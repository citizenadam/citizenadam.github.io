#!/usr/bin/env bash
# Deploy the judge. Run from judge/ after `wrangler login`.
# The API key is read from ~/.config/opencode/jev.env and pushed as a secret;
# it is never written into this repository.
set -euo pipefail
cd "$(dirname "$0")"

KEY_FILE="${KEY_FILE:-$HOME/.config/opencode/jev.env}"
[ -f "$KEY_FILE" ] || { echo "missing $KEY_FILE"; exit 1; }
KEY="$(sed -n 's/^TYPESAFE_API_KEY=//p' "$KEY_FILE" | tr -d '\n')"
[ -n "$KEY" ] || { echo "no key in $KEY_FILE"; exit 1; }

if ! grep -q '^\[\[kv_namespaces\]\]' wrangler.toml; then
  echo "creating the rate-limit namespace"
  OUT="$(npx --yes wrangler@latest kv namespace create RATE 2>&1)"
  ID="$(printf '%s' "$OUT" | grep -oE '"id": *"[a-f0-9]{32}"' | head -1 | grep -oE '[a-f0-9]{32}')"
  [ -n "$ID" ] || ID="$(printf '%s' "$OUT" | grep -oE '\b[a-f0-9]{32}\b' | head -1)"
  [ -n "$ID" ] || { echo "could not read the namespace id from:"; echo "$OUT"; exit 1; }
  printf '\n[[kv_namespaces]]\nbinding = "RATE"\nid = "%s"\n' "$ID" >> wrangler.toml
  echo "bound RATE=$ID"
fi

printf '%s' "$KEY" | npx --yes wrangler@latest secret put TYPESAFE_API_KEY >/dev/null
echo "secret stored"
npx --yes wrangler@latest deploy
