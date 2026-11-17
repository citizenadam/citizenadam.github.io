package bench

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"time"
)

const SchemaVersion = "1.0.0"

// DataDir is the published directory the site reads.
func DataDir(benchRoot string) string {
	return filepath.Join(filepath.Dir(benchRoot), "data", "bench")
}

// AppendRun writes one row. A rerun with the same run id replaces the old row
// instead of stacking a second copy: the record is keyed, not a log of attempts.
func AppendRun(benchRoot string, r Run) error {
	dir := DataDir(benchRoot)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	existing, err := LoadRuns(benchRoot)
	if err != nil {
		return err
	}
	kept := make([]Run, 0, len(existing)+1)
	for _, x := range existing {
		if x.RunID != r.RunID {
			kept = append(kept, x)
		}
	}
	kept = append(kept, r)

	var buf []byte
	for _, x := range kept {
		line, err := MarshalRow(x)
		if err != nil {
			return err
		}
		buf = append(buf, line...)
	}
	tmp := filepath.Join(dir, "runs.jsonl.tmp")
	if err := os.WriteFile(tmp, buf, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, filepath.Join(dir, "runs.jsonl"))
}

// LoadRuns reads every row.
func LoadRuns(benchRoot string) ([]Run, error) {
	p := filepath.Join(DataDir(benchRoot), "runs.jsonl")
	f, err := os.Open(p)
	if os.IsNotExist(err) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	defer f.Close()
	var runs []Run
	sc := bufio.NewScanner(f)
	sc.Buffer(make([]byte, 0, 64*1024), 4*1024*1024)
	for sc.Scan() {
		line := sc.Bytes()
		if len(line) == 0 || line[0] != '{' {
			continue
		}
		var r Run
		if err := json.Unmarshal(line, &r); err != nil {
			return nil, fmt.Errorf("%s: %w", p, err)
		}
		runs = append(runs, r)
	}
	return runs, sc.Err()
}

type ModelAgg struct {
	Model          string         `json:"model"`
	Provider       string         `json:"provider,omitempty"`
	Runs           int            `json:"runs"`
	Valid          int            `json:"valid"`
	Completion     float64        `json:"completion"`
	AllRepsValid   bool           `json:"all_reps_valid"`
	CostTotal      float64        `json:"cost_total_usd"`
	CostPerValid   *float64       `json:"cost_per_valid_usd"`
	MedianWallMS   int64          `json:"median_wall_ms"`
	MedianInputTok int            `json:"median_input_tokens"`
	GateFailures   map[string]int `json:"gate_failures"`
}

type TaskAgg struct {
	Task       string  `json:"task"`
	Runs       int     `json:"runs"`
	Valid      int     `json:"valid"`
	Completion float64 `json:"completion"`
}

type Cell struct {
	Task         string   `json:"task"`
	Model        string   `json:"model"`
	Runs         int      `json:"runs"`
	Valid        int      `json:"valid"`
	Completion   float64  `json:"completion"`
	CostPerValid *float64 `json:"cost_per_valid_usd"`
	MedianWallMS int64    `json:"median_wall_ms"`
}

type Summary struct {
	SchemaVersion string     `json:"schema_version"`
	GeneratedAt   time.Time  `json:"generated_at"`
	Totals        Totals     `json:"totals"`
	ByModel       []ModelAgg `json:"by_model"`
	ByTask        []TaskAgg  `json:"by_task"`
	Matrix        []Cell     `json:"matrix"`
}

type Totals struct {
	Runs         int `json:"runs"`
	Valid        int `json:"valid"`
	GateFailures int `json:"gate_failures"`
}

// Summarize rebuilds summary.json and manifest.json from runs.jsonl.
func Summarize(benchRoot string, models Models, version string) (Summary, error) {
	runs, err := LoadRuns(benchRoot)
	if err != nil {
		return Summary{}, err
	}
	var s Summary
	s.SchemaVersion = SchemaVersion
	s.GeneratedAt = time.Now().UTC()
	s.Totals.Runs = len(runs)

	modelAgg := map[string]*ModelAgg{}
	taskAgg := map[string]*TaskAgg{}
	cellAgg := map[string]*Cell{}
	costByModel := map[string]float64{}

	for _, r := range runs {
		if r.Valid {
			s.Totals.Valid++
		}
		for g, ok := range r.Gates {
			if !ok {
				s.Totals.GateFailures++
				ma := ensureModel(modelAgg, r)
				ma.GateFailures[g]++
			}
		}
		ma := ensureModel(modelAgg, r)
		ma.Runs++
		if r.Valid {
			ma.Valid++
		}
		costByModel[r.Model] += r.CostUSD

		ta := taskAgg[r.Task]
		if ta == nil {
			ta = &TaskAgg{Task: r.Task}
			taskAgg[r.Task] = ta
		}
		ta.Runs++
		if r.Valid {
			ta.Valid++
		}

		key := r.Task + "\x00" + r.Model
		c := cellAgg[key]
		if c == nil {
			c = &Cell{Task: r.Task, Model: r.Model}
			cellAgg[key] = c
		}
		c.Runs++
		if r.Valid {
			c.Valid++
			if c.CostPerValid == nil {
				zero := 0.0
				c.CostPerValid = &zero
			}
			*c.CostPerValid += r.CostUSD
		}
	}

	for name, ma := range modelAgg {
		ma.Completion = ratio(ma.Valid, ma.Runs)
		ma.AllRepsValid = ma.Runs > 0 && ma.Valid == ma.Runs
		ma.CostTotal = costByModel[name]
		if ma.Valid > 0 {
			v := ma.CostTotal / float64(ma.Valid)
			ma.CostPerValid = &v
		}
		var walls []int64
		var toks []int
		for _, r := range runs {
			if r.Model == name {
				walls = append(walls, effectiveWall(r))
				toks = append(toks, r.Tokens.Input)
			}
		}
		ma.MedianWallMS = medianInt64(walls)
		ma.MedianInputTok = medianInt(toks)
		s.ByModel = append(s.ByModel, *ma)
	}
	sort.Slice(s.ByModel, func(i, j int) bool { return s.ByModel[i].Model < s.ByModel[j].Model })

	for _, ta := range taskAgg {
		ta.Completion = ratio(ta.Valid, ta.Runs)
		s.ByTask = append(s.ByTask, *ta)
	}
	sort.Slice(s.ByTask, func(i, j int) bool { return s.ByTask[i].Task < s.ByTask[j].Task })

	for _, c := range cellAgg {
		c.Completion = ratio(c.Valid, c.Runs)
		var walls []int64
		for _, r := range runs {
			if r.Model == c.Model && r.Task == c.Task {
				walls = append(walls, effectiveWall(r))
			}
		}
		c.MedianWallMS = medianInt64(walls)
		s.Matrix = append(s.Matrix, *c)
	}
	sort.Slice(s.Matrix, func(i, j int) bool {
		if s.Matrix[i].Task != s.Matrix[j].Task {
			return s.Matrix[i].Task < s.Matrix[j].Task
		}
		return s.Matrix[i].Model < s.Matrix[j].Model
	})

	if s.ByModel == nil {
		s.ByModel = []ModelAgg{}
	}
	if s.ByTask == nil {
		s.ByTask = []TaskAgg{}
	}
	if s.Matrix == nil {
		s.Matrix = []Cell{}
	}

	dir := DataDir(benchRoot)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return s, err
	}
	if err := writeJSON(filepath.Join(dir, "summary.json"), s); err != nil {
		return s, err
	}
	if err := writeJSON(filepath.Join(dir, "tasks.json"), map[string]any{
		"schema_version": SchemaVersion,
		"generated_at":   s.GeneratedAt,
		"tasks":          publicTasks(benchRoot),
	}); err != nil {
		return s, err
	}
	if err := writeJSON(filepath.Join(dir, "models.json"), map[string]any{
		"schema_version": SchemaVersion,
		"generated_at":   s.GeneratedAt,
		"models":         publicModels(models),
	}); err != nil {
		return s, err
	}

	if b, err := os.ReadFile(filepath.Join(benchRoot, "prices.json")); err == nil {
		if err := os.WriteFile(filepath.Join(dir, "prices.json"), b, 0o644); err != nil {
			return s, err
		}
	}

	manifest := map[string]any{
		"$schema":        "./schema/manifest.schema.json",
		"schema_version": SchemaVersion,
		"generated_at":   s.GeneratedAt,
		"harness":        map[string]string{"name": "bench", "version": version, "runtime": "opencode-cli"},
		"totals":         s.Totals,
		"files":          []string{"runs.jsonl", "summary.json", "models.json", "tasks.json"},
		"notes": fmt.Sprintf("%d models, %d task(s), %d runs. Enforced gates: G1, G2, G3, G5, G7. G4 egress sealing and G6 determinism are not yet enforced.",
			len(s.ByModel), len(s.ByTask), s.Totals.Runs),
	}
	if err := writeJSON(filepath.Join(dir, "manifest.json"), manifest); err != nil {
		return s, err
	}
	return s, nil
}

// publicTasks publishes the contract each task enforces, so a reader can check
// the claim instead of trusting the page.
func publicTasks(benchRoot string) []map[string]any {
	out := []map[string]any{}
	entries, err := os.ReadDir(filepath.Join(benchRoot, "tasks"))
	if err != nil {
		return out
	}
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		t, err := LoadTask(benchRoot, e.Name())
		if err != nil {
			continue
		}
		out = append(out, map[string]any{
			"id":       t.ID,
			"title":    t.Title,
			"version":  t.Version,
			"lang":     t.Lang,
			"contract": t.Contract,
			"limits":   t.Limits,
			"oracle":   t.Oracle.Cmd,
			"gates_enforced": []string{
				"G1_input_seal", "G2_held_out_oracle", "G3_coverage_receipt",
				"G5_provenance", "G7_no_answer_leak",
			},
		})
	}
	return out
}

func publicModels(m Models) []map[string]string {
	out := []map[string]string{}
	for _, x := range m.Models {
		out = append(out, map[string]string{
			"id": x.ID, "label": x.Label, "provider": x.Provider, "color": x.Color,
		})
	}
	return out
}

func ensureModel(m map[string]*ModelAgg, r Run) *ModelAgg {
	ma := m[r.Model]
	if ma == nil {
		ma = &ModelAgg{Model: r.Model, Provider: r.Provider, GateFailures: map[string]int{}}
		m[r.Model] = ma
	}
	return ma
}

// effectiveWall prefers the model's own span over the harness wall clock, so a
// client that hangs after the last message is not charged to the model.
func effectiveWall(r Run) int64 {
	if r.Quality.AgentMS > 0 {
		return r.Quality.AgentMS
	}
	return r.WallMS
}

func ratio(a, b int) float64 {
	if b == 0 {
		return 0
	}
	return float64(a) / float64(b)
}

func medianInt(v []int) int {
	if len(v) == 0 {
		return 0
	}
	sort.Ints(v)
	return v[len(v)/2]
}

func medianInt64(v []int64) int64 {
	if len(v) == 0 {
		return 0
	}
	sort.Slice(v, func(i, j int) bool { return v[i] < v[j] })
	return v[len(v)/2]
}

func writeJSON(path string, v any) error {
	b, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return err
	}
	b = append(b, '\n')
	return os.WriteFile(path, b, 0o644)
}
