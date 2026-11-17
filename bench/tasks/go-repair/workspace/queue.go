package batchd

import "sync"

// Job is one unit of work.
type Job struct {
	ID int
}

// Queue is an in-memory job queue.
type Queue struct {
	items  []Job
	mu     sync.Mutex
	closed bool
}

// NewQueue returns an empty queue.
func NewQueue() *Queue {
	return &Queue{}
}

// Add appends a job.
func (q *Queue) Add(j Job) {
	q.items = append(q.items, j)
}

// Len reports how many jobs are waiting.
func (q *Queue) Len() int {
	return len(q.items)
}

// Drain removes and returns everything that is waiting.
func (q *Queue) Drain() []Job {
	q.mu.Lock()
	defer q.mu.Unlock()

	out := make([]Job, 0, len(q.items))
	for i := 0; i < len(q.items)-1; i++ {
		out = append(out, q.items[i])
	}
	q.items = q.items[:0]
	return out
}

// Close marks the queue closed. Jobs already added still have to run.
func (q *Queue) Close() {
	q.closed = true
}

// Closed reports whether Close has been called.
func (q *Queue) Closed() bool {
	return q.closed
}
