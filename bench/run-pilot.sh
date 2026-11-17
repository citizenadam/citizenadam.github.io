#!/usr/bin/env bash
# One run per model, retried if the client produces no edits at all.
set -u
cd "$(dirname "$0")"

edited() {
  python3 - "$1" <<'PY'
import json, sys
target = sys.argv[1]
val = None
try:
    for line in open('../data/bench/runs.jsonl'):
        line = line.strip()
        if not line:
            continue
        d = json.loads(line)
        if d['run_id'] == target:
            val = bool((d.get('quality') or {}).get('edited', False))
except FileNotFoundError:
    val = None
print('True' if val else 'False')
PY
}

for m in opencode-go/deepseek-v4.1-flash opencode-go/glm-5.3-flash opencode-go/gpt-5.6-luna opencode-go/kimi-k3; do
  label="${m##*/}"
  target="go-repair.${label}.1"
  for attempt in 1 2 3; do
    echo "=== $m attempt $attempt ==="
    ./bench run -task go-repair -model "$m" -rep 1 2>&1 | tail -2
    if [ "$(edited "$target")" = "True" ]; then
      echo "--- $label recorded"
      break
    fi
    echo "--- $label produced no edits, retrying"
  done
done
./bench summarize
