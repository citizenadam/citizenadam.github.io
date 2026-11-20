// The record the judge reasons about lives in JUDGE_RECORD, a secret on both
// the Worker and the repository. It is not in this file, and not in the
// published tree: the more detail the record carries, the better the
// judgement, and detail is exactly what should not be public.
//
// Set it with:
//   wrangler secret put JUDGE_RECORD   < .record.json
//   gh secret set JUDGE_RECORD         < .record.json

export function loadState(env) {
  const raw = env && env.JUDGE_RECORD;
  if (!raw) throw new Error("JUDGE_RECORD is not configured");
  const parsed = JSON.parse(raw);
  if (!parsed || !Array.isArray(parsed.roles)) {
    throw new Error("JUDGE_RECORD is not a record");
  }
  return parsed;
}
