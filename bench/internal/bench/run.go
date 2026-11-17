package bench

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"sync/atomic"
	"time"
)

// Run is one row of the table, and one dot in the atlas.
type Run struct {
	RunID     string          `json:"run_id"`
	Task      string          `json:"task"`
	Model     string          `json:"model"`
	Provider  string          `json:"provider"`
	Rep       int             `json:"rep"`
	StartedAt time.Time       `json:"started_at"`
	WallMS    int64           `json:"wall_ms"`
	Valid     bool            `json:"valid"`
	Gates     map[string]bool `json:"gates"`
	Tokens    Tokens          `json:"tokens"`
	CostUSD   float64         `json:"cost_usd"`
	Steps     int             `json:"steps"`
	Quality   Quality         `json:"quality"`
	Session   string          `json:"session_id"`
	Error     string          `json:"error,omitempty"`
	Harness   HarnessInfo     `json:"harness"`
}

// Quality is task-specific, but every task reports test counts.
type Quality struct {
	OraclePass  bool     `json:"oracle_pass"`
	Vet         bool     `json:"vet"`
	TestsPassed int      `json:"tests_passed"`
	TestsFailed int      `json:"tests_failed"`
	FailedTests []string `json:"failed_tests"`
	OracleMS    int64    `json:"oracle_ms"`
	InputSeal   string   `json:"input_seal"`
	AgentMS     int64    `json:"agent_ms"`
	Edited      bool     `json:"edited"`
	OracleOut   string   `json:"oracle_output,omitempty"`
}

// HarnessInfo pins what produced the row.
type HarnessInfo struct {
	Version string `json:"version"`
	Runtime string `json:"runtime"`
}

var sessionRe = regexp.MustCompile(`"sessionID":"(ses_[A-Za-z0-9]+)"`)

// Execute runs one task against one model and returns the row. A non-nil error
// means the harness itself broke; a model failing the task is a valid result.
func Execute(ctx context.Context, root string, task Task, model Model, rep int, version string) (Run, error) {
	label := model.Label
	if label == "" {
		label = strings.ReplaceAll(model.ID, "/", "-")
	}
	runID := fmt.Sprintf("%s.%s.%d", task.ID, label, rep)

	run := Run{
		RunID:     runID,
		Task:      task.ID,
		Model:     label,
		Provider:  model.Provider,
		Rep:       rep,
		StartedAt: time.Now().UTC(),
		Gates:     map[string]bool{},
		Harness:   HarnessInfo{Version: version, Runtime: "opencode-cli"},
	}

	fixture := filepath.Join(TaskDir(root, task.ID), task.Workspace)
	sealBefore, fixtureFiles, err := hashTree(fixture)
	if err != nil {
		return run, err
	}
	run.Quality.InputSeal = sealBefore

	workDir := filepath.Join(root, "work", runID)
	if err := os.RemoveAll(workDir); err != nil {
		return run, err
	}
	if err := os.MkdirAll(filepath.Dir(workDir), 0o755); err != nil {
		return run, err
	}
	if err := copyTree(fixture, workDir); err != nil {
		return run, err
	}
	testHashesBefore, err := testFileHashes(workDir)
	if err != nil {
		return run, err
	}
	srcHashesBefore, err := sourceHashes(workDir)
	if err != nil {
		return run, err
	}

	wall := task.Limits.WallSeconds
	if wall <= 0 {
		wall = 900
	}
	rctx, cancel := context.WithTimeout(ctx, time.Duration(wall)*time.Second)
	defer cancel()

	start := time.Now()
	stdout, stderr, runErr, stalled := invokeAgent(rctx, workDir, model.ID, task.Prompt, cancel)
	run.WallMS = time.Since(start).Milliseconds()
	switch {
	case stalled:
		run.Error = "client went quiet; graded the work on disk"
	case rctx.Err() == context.DeadlineExceeded:
		run.Error = "wall-clock limit reached"
	case runErr != nil && run.Error == "":
		run.Error = strings.TrimSpace(firstLine(stderr))
	}
	if m := sessionRe.FindStringSubmatch(stdout + stderr); m != nil {
		run.Session = m[1]
	}

	if run.Session != "" {
		if u, err := ReadUsage(OpenCodeDB(), run.Session); err == nil {
			run.Tokens = u.Tokens
			run.CostUSD = u.Cost
			run.Steps = u.Steps
			run.Quality.AgentMS = u.AgentMS
			// A subscription reports zero per token. Price the tokens against
			// the pinned list table instead, so the number means something to
			// someone who would actually pay for them.
			if prices, perr := LoadPrices(root); perr == nil {
				if c := prices.Cost(model.ID, run.Tokens); c > 0 {
					run.CostUSD = c
				}
			}
		}
	}

	// G1: the fixture the oracle reads is byte-identical to the one hashed
	// before the run. The agent's copy may be a mess; this is the source.
	sealAfter, _, err := hashTree(fixture)
	if err != nil {
		return run, err
	}
	run.Gates["G1_input_seal"] = sealAfter == sealBefore && len(fixtureFiles) > 0

	// G2: the held-out tests were never inside the workspace.
	hidden := filepath.Join(TaskDir(root, task.ID), task.Oracle.HiddenDir)
	run.Gates["G2_held_out_oracle"] = !isInside(hidden, workDir) && !isInside(workDir, hidden)

	// G5: the agent did not create, delete, or edit a test file.
	testHashesAfter, err := testFileHashes(workDir)
	if err != nil {
		return run, err
	}
	run.Gates["G5_provenance"] = equalHashes(testHashesBefore, testHashesAfter)

	// A run where the model produced no edits at all is a client fault, not a
	// capability result. Record it as such instead of scoring it as a failure.
	srcHashesAfter, err := sourceHashes(workDir)
	if err != nil {
		return run, err
	}
	run.Quality.Edited = !equalHashes(srcHashesBefore, srcHashesAfter)

	// G7: nothing in the output matches a known answer literal.
	run.Gates["G7_no_answer_leak"] = !containsAny(workDir, task.AnswerLiterals)

	oracle, err := RunOracle(ctx, root, task, workDir)
	if err != nil {
		return run, err
	}
	run.Quality.OraclePass = oracle.OK
	run.Quality.Vet = oracle.VetOK
	run.Quality.TestsPassed = oracle.TestsPassed
	run.Quality.TestsFailed = oracle.TestsFailed
	run.Quality.FailedTests = oracle.FailedTests
	run.Quality.OracleMS = oracle.ExecutedInMS
	run.Quality.OracleOut = oracle.Output

	// G3 is the coverage receipt: the task names the test that proves the
	// deliverable accounts for every input row, and that test must pass.
	run.Gates["G3_coverage_receipt"] = true
	if task.ReceiptTest != "" {
		// The receipt gate asks one question: did the test that proves full
		// coverage run and pass? It is not a second copy of the oracle verdict.
		ran := oracle.TestsPassed+oracle.TestsFailed > 0
		run.Gates["G3_coverage_receipt"] = ran && !contains(oracle.FailedTests, task.ReceiptTest)
	}

	// A run is valid only when every gate passed AND the oracle passed. The
	// oracle verdict is not derived from a gate map: a missing receipt test
	// must never be able to turn a timeout into a pass.
	run.Valid = run.Tokens.Input > 0 && oracle.OK && run.Quality.Edited
	if run.Tokens.Input == 0 && run.Error == "" {
		run.Error = "no token accounting for this session"
	}
	if !oracle.OK && run.Error == "" {
		run.Error = "oracle failed"
	}
	if !run.Quality.Edited && run.Error == "" {
		run.Error = "no edits made"
	}
	var failedGates []string
	for g, ok := range run.Gates {
		if !ok {
			run.Valid = false
			failedGates = append(failedGates, g)
		}
	}
	if len(failedGates) > 0 {
		sortStrings(failedGates)
		run.Error = "gate failed: " + strings.Join(failedGates, ", ")
	}
	return run, nil
}

func invokeAgent(ctx context.Context, dir, modelID, prompt string, stop func()) (string, string, error, bool) {
	args := []string{"run", "--format", "json", "--auto", "--model", modelID, prompt}
	cmd := exec.CommandContext(ctx, "opencode", args...)
	cmd.Dir = dir
	cmd.WaitDelay = 15 * time.Second

	// Never hand a child process a pipe we then have to drain: a descendant
	// that outlives the agent keeps the pipe open and blocks Run past the point
	// where the work actually finished. Files have no such coupling.
	outF, err := os.CreateTemp("", "bench-stdout-*")
	if err != nil {
		return "", "", err, false
	}
	defer os.Remove(outF.Name())
	errF, err := os.CreateTemp("", "bench-stderr-*")
	if err != nil {
		outF.Close()
		return "", "", err, false
	}
	defer os.Remove(errF.Name())

	cmd.Stdout = outF
	cmd.Stderr = errF
	if err := cmd.Start(); err != nil {
		outF.Close()
		errF.Close()
		return "", "", err, false
	}

	// The client can finish the model's turn and then never exit, holding the
	// run open until the wall clock expires. Silence is the signal: this task's
	// own test suite finishes in seconds, so a minute and a half with no output
	// means the client is stuck, not working.
	done := make(chan struct{})
	var stalledFlag atomic.Bool
	go func() {
		var last int64 = -1
		quiet := 0
		for {
			select {
			case <-done:
				return
			case <-ctx.Done():
				return
			case <-time.After(5 * time.Second):
			}
			info, err := os.Stat(outF.Name())
			if err != nil {
				continue
			}
			if info.Size() == last {
				quiet += 5
			} else {
				quiet = 0
				last = info.Size()
			}
			if quiet >= 90 {
				stalledFlag.Store(true)
				stop()
				return
			}
		}
	}()

	runErr := cmd.Wait()
	close(done)
	wasStalled := stalledFlag.Load()
	outF.Close()
	errF.Close()

	ob, _ := os.ReadFile(outF.Name())
	eb, _ := os.ReadFile(errF.Name())
	return string(ob), string(eb), runErr, wasStalled
}

// ---- filesystem helpers ----

func copyTree(src, dst string) error {
	return filepath.WalkDir(src, func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		rel, err := filepath.Rel(src, p)
		if err != nil {
			return err
		}
		target := filepath.Join(dst, rel)
		if d.IsDir() {
			return os.MkdirAll(target, 0o755)
		}
		return copyFile(p, target)
	})
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	if err := os.MkdirAll(filepath.Dir(dst), 0o755); err != nil {
		return err
	}
	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer out.Close()
	_, err = io.Copy(out, in)
	return err
}

func hashTree(dir string) (string, map[string]string, error) {
	files := map[string]string{}
	var paths []string
	err := filepath.WalkDir(dir, func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() {
			return nil
		}
		sum, err := hashFile(p)
		if err != nil {
			return err
		}
		rel, _ := filepath.Rel(dir, p)
		files[rel] = sum
		paths = append(paths, rel)
		return nil
	})
	if err != nil {
		return "", nil, err
	}
	sort.Strings(paths)
	h := sha256.New()
	for _, p := range paths {
		fmt.Fprintf(h, "%s %s\n", p, files[p])
	}
	return hex.EncodeToString(h.Sum(nil)), files, nil
}

func hashFile(p string) (string, error) {
	f, err := os.Open(p)
	if err != nil {
		return "", err
	}
	defer f.Close()
	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return "", err
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}

// sourceHashes covers every file the model is allowed to change. Test files are
// tracked separately by testFileHashes, for the provenance gate.
func sourceHashes(dir string) (map[string]string, error) {
	out := map[string]string{}
	err := filepath.WalkDir(dir, func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() || strings.HasSuffix(p, "_test.go") {
			return nil
		}
		sum, err := hashFile(p)
		if err != nil {
			return err
		}
		rel, _ := filepath.Rel(dir, p)
		out[rel] = sum
		return nil
	})
	return out, err
}

func testFileHashes(dir string) (map[string]string, error) {
	out := map[string]string{}
	err := filepath.WalkDir(dir, func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() || !strings.HasSuffix(p, "_test.go") {
			return nil
		}
		sum, err := hashFile(p)
		if err != nil {
			return err
		}
		rel, _ := filepath.Rel(dir, p)
		out[rel] = sum
		return nil
	})
	return out, err
}

func equalHashes(a, b map[string]string) bool {
	if len(a) != len(b) {
		return false
	}
	for k, v := range a {
		if b[k] != v {
			return false
		}
	}
	return true
}

func isInside(parent, child string) bool {
	rel, err := filepath.Rel(parent, child)
	if err != nil {
		return false
	}
	return rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator))
}

func containsAny(dir string, literals []string) bool {
	if len(literals) == 0 {
		return false
	}
	found := false
	_ = filepath.WalkDir(dir, func(p string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return nil
		}
		info, err := d.Info()
		if err != nil || info.Size() > 1<<20 {
			return nil
		}
		b, err := os.ReadFile(p)
		if err != nil {
			return nil
		}
		for _, lit := range literals {
			if lit != "" && strings.Contains(string(b), lit) {
				found = true
			}
		}
		return nil
	})
	return found
}

func contains(list []string, s string) bool {
	for _, x := range list {
		if x == s {
			return true
		}
	}
	return false
}

func firstLine(s string) string {
	s = strings.TrimSpace(s)
	if i := strings.IndexByte(s, '\n'); i >= 0 {
		return s[:i]
	}
	return s
}

// MarshalRow keeps the JSONL one-object-per-line guarantee.
func MarshalRow(r Run) ([]byte, error) {
	b, err := json.Marshal(r)
	if err != nil {
		return nil, err
	}
	return append(b, '\n'), nil
}
