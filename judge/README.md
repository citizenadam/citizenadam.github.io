# The hire judge

The headline panel asks a question a recruiter actually has — should we hire
this person for this role — and answers it from the recorded work history with
a decision model instead of adjectives. This directory is the whole mechanism,
and none of it is a secret.

## What runs where

| Piece | Where | Why |
|---|---|---|
| `state.mjs` | public | The record the model reads: roles, numbers, and a written list of what is *not* evidenced. |
| `questions.mjs` | public | The four judgments and the truth table that turns them into a verdict. |
| `roles.mjs` | public | The twelve roles precomputed at publish time. |
| `precompute.mjs` | GitHub Actions | Runs with `TYPESAFE_API_KEY` from repository secrets. |
| `ask.js` | optional worker | Free-text judging. The key lives in the host's secret store. |

## Two paths, one verdict

**Precomputed.** On any change to this directory, `.github/workflows/judge.yml`
asks the model about the twelve fixed roles and commits
`data/judge/precomputed.json`. The page reads that file. No request is made
when a visitor clicks, no key exists in the browser, and the whole set costs
about **$0.0008**.

**Live.** `ask.js` handles a pasted job description. Run it on a Cloudflare
Worker or a Vercel function; the key is set as a secret there, never here.
`deploy.sh` does the Cloudflare path.

Both call the same model with the same questions and the same decision code, so
a verdict does not depend on which path produced it.

## What the model is asked

| id | type | question |
|---|---|---|
| `depth` | Score 0–3 | How much of the requirement does the record demonstrate directly? |
| `evidence_gap` | Noul | Does the requirement name a capability, tool, or domain absent from the record? |
| `scale_gap` | Noul | Is the stated scale larger than anything in the record? |
| `management` | Noul | Is this a people-and-money role? |

The verdict is decided in code, with the thresholds in `questions.mjs`. The
model supplies judgments; it does not decide what to say.

## What a first version got wrong

The first question set included *"would saying this candidate meets the
requirement go beyond what the record states?"* — a stretch check. Jev answered
0.86 to 0.99 to it on **every** requirement, including a Kubernetes migration
the record covers directly. A saturated question carries no information, so it
was removed rather than thresholded around. What replaced it: separate questions
for the named-tool gap and the scale gap, which do discriminate (0.08 versus
0.99 on the same task).

## Security

- The API key is a GitHub repository secret and is read only by the workflow.
  It is never written into a page, a data file, or this repository.
- The optional worker keeps the key in the host's secret store, allows only the
  site's origin, caps the input at 4,000 characters, and limits requests per
  visitor and per day.
- Worst-case abuse of the worker, if someone calls the endpoint directly and
  ignores CORS: 400 asks a day at ~1,700 tokens each, about **$0.03 a day**.
- The contact address is not in the markup. `js/contact.js` assembles it in the
  browser so text scrapers never see it.

## Cost

Jev prices input at $42 per billion tokens. A judgement carries the record
(~800 tokens), the criteria, and the requirement, so about 1,700 tokens:
**$0.00007 per answer**. The twelve-role set is under a tenth of a cent.
