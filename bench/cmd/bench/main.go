// Command bench runs one agent task under a fixed harness and records it.
//
//	bench run -task go-repair -model opencode/deepseek-v4.1-flash -rep 1
//	bench summarize
//	bench list
package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"os/signal"
	"syscall"

	"github.com/citizenadam/citizenadam.github.io/bench/internal/bench"
)

const version = "0.1.0"

func main() {
	if len(os.Args) < 2 {
		usage()
		os.Exit(2)
	}
	root, err := bench.Root()
	if err != nil {
		fatal(err)
	}

	switch os.Args[1] {
	case "run":
		cmdRun(root, os.Args[2:])
	case "summarize":
		cmdSummarize(root)
	case "list":
		cmdList(root)
	case "tasks":
		cmdTasks(root)
	case "oracle":
		cmdOracle(root, os.Args[2:])
	default:
		usage()
		os.Exit(2)
	}
}

func usage() {
	fmt.Fprint(os.Stderr, `bench — one task, one harness, one row per run

  bench run -task <id> -model <provider/model> [-rep N]
  bench summarize
  bench list
  bench tasks
`)
}

func cmdRun(root string, args []string) {
	fs := flag.NewFlagSet("run", flag.ExitOnError)
	taskID := fs.String("task", "go-repair", "task id under tasks/")
	modelID := fs.String("model", "", "provider/model, or a label from models.json")
	rep := fs.Int("rep", 1, "repetition number")
	_ = fs.Parse(args)

	if *modelID == "" {
		fatal(fmt.Errorf("-model is required"))
	}
	task, err := bench.LoadTask(root, *taskID)
	if err != nil {
		fatal(err)
	}
	models, err := bench.LoadModels(root)
	if err != nil {
		fatal(err)
	}
	model, ok := models.FindModel(*modelID)
	if !ok {
		fatal(fmt.Errorf("model %q is not in models.json", *modelID))
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	fmt.Printf("run  task=%s model=%s rep=%d wall_limit=%ds\n", task.ID, model.Label, *rep, task.Limits.WallSeconds)
	run, err := bench.Execute(ctx, root, task, model, *rep, version)
	if err != nil {
		fatal(err)
	}
	if err := bench.AppendRun(root, run); err != nil {
		fatal(err)
	}
	fmt.Printf("done valid=%v gates=%s cost=$%.4f wall=%dms tests=%d/%d session=%s\n",
		run.Valid, gateString(run.Gates), run.CostUSD, run.WallMS,
		run.Quality.TestsPassed, run.Quality.TestsPassed+run.Quality.TestsFailed, run.Session)
	if run.Error != "" {
		fmt.Printf("note %s\n", run.Error)
	}

	s, err := bench.Summarize(root, models, version)
	if err != nil {
		fatal(err)
	}
	fmt.Printf("summary runs=%d valid=%d\n", s.Totals.Runs, s.Totals.Valid)
}

func cmdOracle(root string, args []string) {
	fs := flag.NewFlagSet("oracle", flag.ExitOnError)
	taskID := fs.String("task", "go-repair", "task id")
	work := fs.String("work", "", "workspace to grade")
	_ = fs.Parse(args)
	if *work == "" {
		fatal(fmt.Errorf("-work is required"))
	}
	task, err := bench.LoadTask(root, *taskID)
	if err != nil {
		fatal(err)
	}
	res, err := bench.RunOracle(context.Background(), root, task, *work)
	if err != nil {
		fatal(err)
	}
	fmt.Printf("ok=%v vet=%v passed=%d failed=%d failed_tests=%v ms=%d\n",
		res.OK, res.VetOK, res.TestsPassed, res.TestsFailed, res.FailedTests, res.ExecutedInMS)
	fmt.Println("--- output ---")
	fmt.Println(res.Output)
}

func cmdSummarize(root string) {
	models, err := bench.LoadModels(root)
	if err != nil {
		fatal(err)
	}
	s, err := bench.Summarize(root, models, version)
	if err != nil {
		fatal(err)
	}
	fmt.Printf("summary runs=%d valid=%d models=%d tasks=%d\n",
		s.Totals.Runs, s.Totals.Valid, len(s.ByModel), len(s.ByTask))
}

func cmdList(root string) {
	runs, err := bench.LoadRuns(root)
	if err != nil {
		fatal(err)
	}
	fmt.Printf("%-44s %-10s %-7s %-9s %-8s\n", "run", "valid", "cost", "wall", "tests")
	for _, r := range runs {
		fmt.Printf("%-44s %-10v $%-8.4f %-9d %d/%d\n",
			r.RunID, r.Valid, r.CostUSD, r.WallMS,
			r.Quality.TestsPassed, r.Quality.TestsPassed+r.Quality.TestsFailed)
	}
}

func cmdTasks(root string) {
	entries, err := os.ReadDir(root + "/tasks")
	if err != nil {
		fatal(err)
	}
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		t, err := bench.LoadTask(root, e.Name())
		if err != nil {
			fmt.Printf("%-14s (unreadable: %v)\n", e.Name(), err)
			continue
		}
		fmt.Printf("%-14s %s\n", t.ID, t.Title)
	}
}

func gateString(g map[string]bool) string {
	s := ""
	for _, k := range []string{"G1_input_seal", "G2_held_out_oracle", "G3_coverage_receipt", "G5_provenance", "G7_no_answer_leak"} {
		if v, ok := g[k]; ok {
			if v {
				s += "+"
			} else {
				s += "-"
			}
		}
	}
	return s
}

func fatal(err error) {
	fmt.Fprintln(os.Stderr, "bench:", err)
	os.Exit(1)
}
