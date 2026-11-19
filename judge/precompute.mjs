// Answers the fixed role set with the live model and writes the static file the
// page reads. Runs in CI with TYPESAFE_API_KEY from repository secrets, or
// locally with it in the environment.

import { writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { STATE } from "./state.mjs";
import { QUESTIONS, MODEL, decide } from "./questions.mjs";
import { ROLES } from "./roles.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "..", "data", "judge", "precomputed.json");
const KEY = process.env.TYPESAFE_API_KEY;
if (!KEY) {
  console.error("TYPESAFE_API_KEY is not set");
  process.exit(1);
}

const revision = createHash("sha256").update(JSON.stringify(STATE)).digest("hex").slice(0, 16);
const judged = [];
let tokens = 0;

for (const role of ROLES) {
  const res = await fetch("https://api.typesafe.ai/v1/systemone", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${KEY}` },
    body: JSON.stringify({
      model: MODEL,
      state: { requirement: role.requirement, record: STATE },
      questions: QUESTIONS
    })
  });

  if (!res.ok) {
    // A failed call is not a "no". Abort so CI leaves the old file in place.
    console.error(`HTTP ${res.status} for ${role.label}: ${(await res.text()).slice(0, 200)}`);
    process.exit(1);
  }

  const data = await res.json();
  const verdict = decide(data.answers || {});
  tokens += data.usage?.input_tokens || 0;
  judged.push({
    label: role.label,
    requirement: role.requirement,
    answers: {
      depth: data.answers?.depth?.score,
      gap: data.answers?.evidence_gap?.noul,
      scale_gap: data.answers?.scale_gap?.noul,
      management: data.answers?.management?.noul
    },
    ...verdict
  });
  console.log(`${role.label}: ${verdict.verdict} (${verdict.tone})`);
}

const payload = {
  schema_version: "1.0.0",
  generated_at: new Date().toISOString(),
  model: MODEL,
  state_revision: revision,
  price_usd_per_mtok: 0.042,
  tokens_used: tokens,
  cost_usd: Number(((tokens * 0.042) / 1e6).toFixed(6)),
  roles: judged
};

await mkdir(join(here, "..", "data", "judge"), { recursive: true });
await writeFile(out, JSON.stringify(payload, null, 2) + "\n");
console.log(`wrote ${out} — ${judged.length} roles, ${tokens} tokens, $${payload.cost_usd}`);
