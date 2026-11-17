# bench

One task, one harness, one row per run.

This is the evaluation harness behind the numbers on the site. It exists because
a leaderboard where "done" means "a human looked at it" measures the human, not
the model.

## What it measures

| Number | Definition |
|---|---|
| **completion** | valid runs / runs. A run is valid only when every enforced gate passes. |
| **cost** | list price of the tokens the run consumed, read from the client's own per-message accounting. Not what this machine paid. |
| **cost per valid pass** | total cost / valid runs. A model that fails twice and passes once pays for all three. |
| **wall-clock** | model call to final edit, measured by the harness. |
| **gate-failure rate** | how often the model produced something that had to be caught. |

There is no composite score. A composite score is where gaming hides: you can
always trade a real failure against a cosmetic win. These four numbers are shown
together and never folded into one.

## The gates

| Gate | Enforced | Checks |
|---|---|---|
| `G1_input_seal` | yes | The fixture is hashed before the run and re-hashed after. The oracle reads the pristine copy, never the agent's. |
| `G2_held_out_oracle` | yes | Oracle tests live outside the workspace and are copied in after the agent stops. |
| `G3_coverage_receipt` | yes | The task names one oracle test that proves the deliverable accounted for every input. If it does not pass, the run is invalid no matter how fast it was. |
| `G5_provenance` | yes | Every `_test.go` file must be byte-identical before and after. No build tags, no skips, no deleted tests. |
| `G7_no_answer_leak` | yes | Output is scanned against known answer literals. |
| `G4_egress` | **no** | Not yet. The agent currently runs on the host, so network egress is not blocked. Held-out oracles mean there is no answer on the web to fetch, but this is a gap, not a design choice. |
| `G6_determinism` | **no** | Not yet. Runs are single-pass; `rep` exists for repetitions but nothing forces two matching verdicts. |

A run record carries only the gates that actually ran. A missing gate is
visible, not assumed.

## Running it

```sh
cd bench
go build -o bench ./cmd/bench

./bench tasks
./bench run -task go-repair -model opencode/deepseek-v4.1-flash -rep 1
./bench summarize
./bench list
```

Results land in `../data/bench/`:

- `runs.jsonl` — append-only, one JSON object per line
- `summary.json` — aggregates, rebuilt by `summarize`
- `models.json` — the panel as published
- `manifest.json` — counts, file list, what was enforced

## Adding a task

```
tasks/<id>/
  task.json          contract, prompt, limits, gate selection
  workspace/         exactly what the agent sees
  hidden/*.go.txt    oracle tests, never copied into the workspace
```

`task.json`:

```json
{
  "id": "go-repair",
  "title": "Fix a concurrent job queue",
  "workspace": "workspace",
  "prompt": "...",
  "contract": ["..."],
  "limits": { "wall_seconds": 900 },
  "oracle": {
    "kind": "go-test",
    "hidden_dir": "hidden",
    "cmd": "go vet ./... && go test -race -count=1 ./...",
    "keep_agent_tests": false,
    "timeout_seconds": 300
  },
  "receipt_test": "TestAllJobsProcessed"
}
```

Two rules for writing a task:

1. **State the contract the tests cannot see.** The visible tests are a hint,
   not the spec. If a requirement is not written down and not tested, the task
   is unfair; if it is written down and not tested, it is decoration.
2. **Name the receipt.** If the task consumes data, one test must prove the
   deliverable consumed all of it. That test is what makes "I deleted half the
   input so it would finish" a failure instead of a speed record.

## Cost accounting

`opencode` already prices every assistant message against its model catalog and
stores `cost` and `tokens` alongside the message. The harness reads those rows
directly:

```sql
select data from session_message
where session_id = ? and type = 'assistant' order by seq;
```

That means cost includes the scaffold — system prompt, tool definitions, and
every retried tool call — which is the honest number. The first thing this
measured: a three-word reply cost 47,873 input tokens, because the harness ships
that much context before the model says anything.

## What this is not

- Not a claim about a model's general ability. One task, one language, one
  concurrency bug class.
- Not reproducible without the same provider. Pinned: the task fixture, the
  oracle, the harness, the prompt. Not pinned: the provider's weights, which can
  change behind a model name.
- Not adversarial-complete. Seven gates, not all seven enforced yet.

## What the first version got wrong

The first oracle called `Start` on an open queue. A worker that waits for the
queue to close — a perfectly reasonable reading of "drain the queue" — then
blocks forever. Every model failed, and none of them had made a mistake: the
test encoded the implementation the author had in mind and graded the other
one. The fixture was fixed, not the models: the queue is now closed before
workers start, so both designs pass and the test measures the contract.

The general rule that came out of it: a gate must test the contract, not the
implementation you happened to be thinking of. If two honest readings of the
task exist and the oracle only accepts one, the oracle is the bug.

A second bug from the same day, kept here because it is the more dangerous
kind: the harness initially computed `valid` from the gate map alone, and the
receipt gate defaulted to `true` when a task did not name a receipt test. A
solution that deadlocked the hidden suite was recorded as a clean pass. The
verdict now requires `oracle.OK` directly, not a gate entry that can default.

## Next

- `log-rca`: a generated 500 MB log fixture with an injected incident. The
  answer is a component, a first-error timestamp, and an affected-request
  count — the count is the receipt, and sampling the file gets it wrong.
- `sql-p95`: a 10M-row Postgres container, a result-set hash, and a p95 target.
  Index the table and you pass; delete rows and the checksum fails.
- `scene-build`: one file of three.js against a pinned local copy, judged by
  headless checks plus blind pairwise votes. This is the only task where taste
  matters, so it is the only task with a vote.
- G4 and G6: egress sealing and a second pass per cell.
- A local arm: the same tasks against a model on this machine's RTX 3090, where
  the list price is $0 and wall-clock is the whole story.

## Proof the task is solvable

A reference implementation passes `go vet` and `go test -race` with 5/5 held-out
tests. It is not published: with the oracle and the fixture public, publishing
the answer would make the task worthless the moment a model can reach the
network. The claim is still checkable — concatenate the two files and hash them:

```
6d8cf05d17bc1965e8d4ad20ee0988a7628fb1ff2344c3b14a48051ba2fbb514
```

If you want to verify the oracle end to end, write your own solution against
`tasks/go-repair/workspace`, then run:

```sh
./bench oracle -task go-repair -work /path/to/your/solution
```

It grades exactly what a model's run is graded on, with the same held-out tests.
