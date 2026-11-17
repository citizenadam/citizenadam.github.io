package batchd

import "testing"

func TestAddAndLen(t *testing.T) {
	q := NewQueue()
	for i := 0; i < 5; i++ {
		q.Add(Job{ID: i})
	}
	if got := q.Len(); got != 5 {
		t.Fatalf("Len() = %d, want 5", got)
	}
}

func TestDrainReturnsEveryJob(t *testing.T) {
	q := NewQueue()
	const n = 10
	for i := 0; i < n; i++ {
		q.Add(Job{ID: i})
	}
	got := q.Drain()
	if len(got) != n {
		t.Fatalf("Drain() returned %d jobs, want %d", len(got), n)
	}
	if got[len(got)-1].ID != n-1 {
		t.Fatalf("last job is %d, want %d", got[len(got)-1].ID, n-1)
	}
}

func TestDrainEmptiesQueue(t *testing.T) {
	q := NewQueue()
	q.Add(Job{ID: 1})
	q.Drain()
	if q.Len() != 0 {
		t.Fatalf("Len() after Drain = %d, want 0", q.Len())
	}
}
