package bench

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

// OracleResult is the verdict plus enough detail to argue with it.
type OracleResult struct {
	OK           bool
	VetOK        bool
	TestsPassed  int
	TestsFailed  int
	FailedTests  []string
	Output       string
	Determinism  string
	ExecutedInMS int64
}

type testEvent struct {
	Action string
	Test   string
}

// RunOracle copies the agent's workspace into a throwaway directory, strips
// every test file the agent may have added, drops in the held-out tests, and
// runs them. The agent never sees this directory.
func RunOracle(ctx context.Context, root string, task Task, workDir string) (res OracleResult, err error) {
	start := time.Now()
	defer func() { res.ExecutedInMS = time.Since(start).Milliseconds() }()

	tmp, err := os.MkdirTemp("", "bench-oracle-*")
	if err != nil {
		return res, err
	}
	defer os.RemoveAll(tmp)

	if err := copyTree(workDir, tmp); err != nil {
		return res, fmt.Errorf("copy workspace: %w", err)
	}

	// Provenance is checked before the strip, by the caller; here we enforce it.
	if !task.Oracle.KeepAgentTests {
		err := filepath.WalkDir(tmp, func(p string, d fs.DirEntry, err error) error {
			if err != nil {
				return err
			}
			if d.IsDir() {
				return nil
			}
			if strings.HasSuffix(p, "_test.go") {
				return os.Remove(p)
			}
			return nil
		})
		if err != nil {
			return res, err
		}
	}

	hidden := filepath.Join(TaskDir(root, task.ID), task.Oracle.HiddenDir)
	entries, err := os.ReadDir(hidden)
	if err != nil {
		return res, fmt.Errorf("hidden oracle: %w", err)
	}
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		name := strings.TrimSuffix(e.Name(), ".txt")
		src := filepath.Join(hidden, e.Name())
		dst := filepath.Join(tmp, name)
		if err := copyFile(src, dst); err != nil {
			return res, err
		}
	}

	timeout := task.Oracle.TimeoutSeconds
	if timeout <= 0 {
		timeout = 300
	}
	octx, cancel := context.WithTimeout(ctx, time.Duration(timeout)*time.Second)
	defer cancel()

	vetOut, vetErr := runIn(octx, tmp, "go", "vet", "./...")
	res.VetOK = vetErr == nil

	testOut, testErr := runIn(octx, tmp, "go", "test", "-json", "-race", "-count=1", "-timeout", "120s", "./...")
	res.Output = trimOutput(vetOut + testOut)

	seen := map[string]string{}
	sc := bufio.NewScanner(strings.NewReader(testOut))
	sc.Buffer(make([]byte, 0, 64*1024), 4*1024*1024)
	for sc.Scan() {
		line := sc.Bytes()
		if len(bytes.TrimSpace(line)) == 0 || line[0] != '{' {
			continue
		}
		var ev struct {
			Action string `json:"Action"`
			Test   string `json:"Test"`
		}
		if err := json.Unmarshal(line, &ev); err != nil {
			continue
		}
		if ev.Test == "" {
			continue
		}
		seen[ev.Test] = ev.Action
	}
	for name, action := range seen {
		switch action {
		case "pass":
			res.TestsPassed++
		case "fail":
			res.TestsFailed++
			res.FailedTests = append(res.FailedTests, name)
		}
	}
	if res.FailedTests == nil {
		res.FailedTests = []string{}
	}
	sortStrings(res.FailedTests)
	res.OK = testErr == nil && res.VetOK && res.TestsFailed == 0
	return res, nil
}

func runIn(ctx context.Context, dir, name string, args ...string) (string, error) {
	cmd := exec.CommandContext(ctx, name, args...)
	cmd.Dir = dir
	cmd.WaitDelay = 10 * time.Second

	f, err := os.CreateTemp("", "bench-cmd-*")
	if err != nil {
		return "", err
	}
	defer os.Remove(f.Name())
	cmd.Stdout = f
	cmd.Stderr = f
	runErr := cmd.Run()
	f.Close()
	b, _ := os.ReadFile(f.Name())
	if ctx.Err() == context.DeadlineExceeded {
		return string(b), fmt.Errorf("timeout")
	}
	return string(b), runErr
}

func trimOutput(s string) string {
	s = strings.TrimSpace(s)
	const max = 6000
	if len(s) > max {
		return s[:max] + "\n… truncated"
	}
	return s
}

func sortStrings(s []string) {
	for i := 1; i < len(s); i++ {
		for j := i; j > 0 && s[j] < s[j-1]; j-- {
			s[j], s[j-1] = s[j-1], s[j]
		}
	}
}
