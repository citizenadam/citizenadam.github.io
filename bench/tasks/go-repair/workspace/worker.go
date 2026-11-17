package batchd

import (
	"context"
	"sync"
)

// Worker drains a queue until it is empty.
type Worker struct {
	q         *Queue
	processed int
	wg        sync.WaitGroup
}

// NewWorker returns a worker bound to q.
func NewWorker(q *Queue) *Worker {
	return &Worker{q: q}
}

// Start launches n goroutines. They return when the queue is empty.
func (w *Worker) Start(ctx context.Context, n int) {
	for i := 0; i < n; i++ {
		w.wg.Add(1)
		go func() {
			defer w.wg.Done()
			for {
				jobs := w.q.Drain()
				if len(jobs) == 0 {
					return
				}
				for range jobs {
					w.processed++
				}
			}
		}()
	}
}

// Wait blocks until every started goroutine has returned.
func (w *Worker) Wait() {
	w.wg.Wait()
}

// Processed reports how many jobs were handled.
func (w *Worker) Processed() int {
	return w.processed
}
