# batchd

A small in-memory job queue with a worker pool. It is used by an internal
pipeline that must not lose work.

## Contract

1. Every job added before `Close` is processed exactly once.
2. `Add`, `Len`, `Drain`, and `Close` are safe to call concurrently.
3. `Start(ctx, n)` must return all of its goroutines promptly when `ctx` is
   cancelled, with no goroutine left running.
4. `Processed()` returns the number of jobs handled. It must be race-free.

## Rules

- `go test ./...` and `go test -race ./...` must pass.
- Do not edit any `_test.go` file. The tests express the contract; fix the
  implementation instead.
- Standard library only. No new dependencies.
- Keep the exported API exactly as it is: `NewQueue`, `Add`, `Len`, `Drain`,
  `Close`, `Closed`, `NewWorker`, `Start`, `Wait`, `Processed`.
