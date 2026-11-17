// Package bench runs one agent task under a fixed harness and records the
// result as a row anyone can re-derive.
package bench

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

// Task is the contract a model is asked to satisfy.
type Task struct {
	ID        string   `json:"id"`
	Title     string   `json:"title"`
	Version   string   `json:"version"`
	Lang      string   `json:"lang"`
	Workspace string   `json:"workspace"`
	Prompt    string   `json:"prompt"`
	Contract  []string `json:"contract"`
	Limits    struct {
		WallSeconds int `json:"wall_seconds"`
		MaxSteps    int `json:"max_steps"`
	} `json:"limits"`
	Oracle struct {
		Kind           string `json:"kind"`
		HiddenDir      string `json:"hidden_dir"`
		Cmd            string `json:"cmd"`
		KeepAgentTests bool   `json:"keep_agent_tests"`
		TimeoutSeconds int    `json:"timeout_seconds"`
	} `json:"oracle"`
	Gates map[string]bool `json:"gates"`

	// ReceiptTest names the oracle test that proves the deliverable
	// accounted for every input. Empty means the task has no coverage axis.
	ReceiptTest string `json:"receipt_test"`

	// AnswerLiterals are scanned for in the agent's output; finding one means
	// the answer was copied rather than derived.
	AnswerLiterals []string `json:"answer_literals"`
}

// Model is one arm of the panel.
type Model struct {
	ID       string `json:"id"`
	Label    string `json:"label"`
	Provider string `json:"provider"`
	Color    string `json:"color,omitempty"`
	Notes    string `json:"notes,omitempty"`
}

// Models wraps the panel file so the array has a home for metadata later.
type Models struct {
	Models []Model `json:"models"`
}

// Root is the bench directory, i.e. the parent of tasks/ and work/.
func Root() (string, error) {
	dir, err := os.Getwd()
	if err != nil {
		return "", err
	}
	for {
		if _, err := os.Stat(filepath.Join(dir, "tasks")); err == nil {
			if _, err := os.Stat(filepath.Join(dir, "go.mod")); err == nil {
				return dir, nil
			}
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return "", fmt.Errorf("no bench root above the working directory")
		}
		dir = parent
	}
}

// LoadTask reads tasks/<id>/task.json.
func LoadTask(root, id string) (Task, error) {
	var t Task
	p := filepath.Join(root, "tasks", id, "task.json")
	b, err := os.ReadFile(p)
	if err != nil {
		return t, err
	}
	if err := json.Unmarshal(b, &t); err != nil {
		return t, fmt.Errorf("%s: %w", p, err)
	}
	if t.ID == "" {
		t.ID = id
	}
	return t, nil
}

// TaskDir is where the fixture and the hidden oracle live.
func TaskDir(root, id string) string { return filepath.Join(root, "tasks", id) }

// LoadModels reads models.json.
func LoadModels(root string) (Models, error) {
	var m Models
	b, err := os.ReadFile(filepath.Join(root, "models.json"))
	if err != nil {
		return m, err
	}
	if err := json.Unmarshal(b, &m); err != nil {
		return m, err
	}
	return m, nil
}

// Price is a published list price in USD per million tokens.
type Price struct {
	Input      float64 `json:"input"`
	Output     float64 `json:"output"`
	CacheRead  float64 `json:"cache_read"`
	CacheWrite float64 `json:"cache_write"`
}

// Prices is the pinned table used to turn tokens into dollars. The subscription
// gateway reports cost 0, which is true and useless: the interesting number is
// what the same tokens would cost at list.
type Prices struct {
	Source     string           `json:"source"`
	CapturedAt string           `json:"captured_at"`
	Unit       string           `json:"unit"`
	Models     map[string]Price `json:"models"`
}

// LoadPrices reads prices.json.
func LoadPrices(root string) (Prices, error) {
	var p Prices
	b, err := os.ReadFile(filepath.Join(root, "prices.json"))
	if err != nil {
		return p, err
	}
	err = json.Unmarshal(b, &p)
	return p, err
}

// Cost prices a usage record against the pinned table.
func (p Prices) Cost(modelID string, t Tokens) float64 {
	pr, ok := p.Models[modelID]
	if !ok {
		return 0
	}
	const m = 1_000_000
	return float64(t.Input)*pr.Input/m +
		float64(t.Output)*pr.Output/m +
		float64(t.CacheRead)*pr.CacheRead/m +
		float64(t.CacheWrite)*pr.CacheWrite/m
}

// FindModel returns the panel entry for a provider/model id.
func (m Models) FindModel(id string) (Model, bool) {
	for _, x := range m.Models {
		if x.ID == id || x.Label == id {
			return x, true
		}
	}
	return Model{}, false
}
