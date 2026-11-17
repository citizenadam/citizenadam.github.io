package bench

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// Tokens is what the provider actually charged for, including the scaffold.
type Tokens struct {
	Input      int `json:"input"`
	Output     int `json:"output"`
	Reasoning  int `json:"reasoning"`
	CacheRead  int `json:"cache_read"`
	CacheWrite int `json:"cache_write"`
}

// Usage is the billable shape of one session.
type Usage struct {
	Tokens Tokens  `json:"tokens"`
	Cost   float64 `json:"cost_usd"`
	Steps  int     `json:"steps"`
	// AgentMS is the span from the prompt to the model's last completed
	// message. It excludes a client that hangs after the work is done, which
	// the harness-observed wall clock cannot.
	AgentMS int64 `json:"agent_ms"`
}

// OpenCodeDB is where the client keeps per-message token counts and cost.
func OpenCodeDB() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".local", "share", "opencode", "opencode.db")
}

type messageRow struct {
	Time struct {
		Created   int64 `json:"created"`
		Completed int64 `json:"completed"`
	} `json:"time"`
	Cost   float64 `json:"cost"`
	Tokens struct {
		Input     int `json:"input"`
		Output    int `json:"output"`
		Reasoning int `json:"reasoning"`
		Cache     struct {
			Read  int `json:"read"`
			Write int `json:"write"`
		} `json:"cache"`
	} `json:"tokens"`
}

// ReadUsage sums every assistant message in a session. opencode already prices
// each message against its own model catalog, so this is the number the client
// would show in its own console.
func ReadUsage(db, sessionID string) (Usage, error) {
	var u Usage
	if sessionID == "" {
		return u, fmt.Errorf("empty session id")
	}
	q := fmt.Sprintf(
		"select type, data from session_message where session_id=%s order by seq;",
		sqlQuote(sessionID))
	cmd := exec.Command("sqlite3", "-readonly", "-json", db, q)
	out, err := cmd.Output()
	if err != nil {
		if ee, ok := err.(*exec.ExitError); ok {
			return u, fmt.Errorf("sqlite3: %s", strings.TrimSpace(string(ee.Stderr)))
		}
		return u, err
	}
	trimmed := strings.TrimSpace(string(out))
	if trimmed == "" || trimmed == "[]" {
		return u, fmt.Errorf("session %s has no messages", sessionID)
	}
	var rows []struct {
		Type string `json:"type"`
		Data string `json:"data"`
	}
	if err := json.Unmarshal(out, &rows); err != nil {
		return u, fmt.Errorf("decode rows: %w", err)
	}

	var first, last int64
	for _, r := range rows {
		var m messageRow
		if err := json.Unmarshal([]byte(r.Data), &m); err != nil {
			continue
		}
		if m.Time.Created > 0 && (first == 0 || m.Time.Created < first) {
			first = m.Time.Created
		}
		if m.Time.Completed > last {
			last = m.Time.Completed
		}
		if r.Type != "assistant" {
			continue
		}
		u.Steps++
		u.Cost += m.Cost
		u.Tokens.Input += m.Tokens.Input
		u.Tokens.Output += m.Tokens.Output
		u.Tokens.Reasoning += m.Tokens.Reasoning
		u.Tokens.CacheRead += m.Tokens.Cache.Read
		u.Tokens.CacheWrite += m.Tokens.Cache.Write
	}
	if u.Steps == 0 {
		return u, fmt.Errorf("session %s has no assistant messages", sessionID)
	}
	if first > 0 && last > first {
		u.AgentMS = last - first
	}
	return u, nil
}

func sqlQuote(s string) string {
	return "'" + strings.ReplaceAll(s, "'", "''") + "'"
}
