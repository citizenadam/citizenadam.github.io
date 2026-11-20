# The hire judge

The headline panel asks a question a recruiter actually has — should we hire
this person for this role — and answers it from the recorded work history, with
yes, no or maybe and the reasons in plain words.

Everything here is static. GitHub Pages serves one JSON file; the page reads it.
There is no API call, no key in the browser, and no second provider.

## How an answer is produced

1. `state.mjs` holds the record: three roles, the numbers, and a written list of
   what is **not** evidenced.
2. `questions.mjs` holds four typed questions and the truth table that turns the
   answers into a verdict. The model supplies judgments; the decision is code.
3. `roles.mjs` holds twelve common roles, each written as a requirement.
4. `precompute.mjs` asks the model about all twelve and writes
   `data/judge/precomputed.json`.
5. `.github/workflows/judge.yml` runs that on any change to this directory, with
   `TYPESAFE_API_KEY` from repository secrets, and commits the result.

A visitor's click reads the committed file. The whole twelve-role set costs
about $0.0008, once, and then nothing.

## Why not answer arbitrary pasted postings

That needs somewhere to keep the key and take requests, which means a second
hosting provider. This project is one platform: an existing deployment plus a
new provider is not a small addition, and it will not be added without an
explicit decision to do so.

## What the model is asked

| id | type | question |
|---|---|---|
| `depth` | Score 0–3 | How much of the requirement does the record demonstrate directly? |
| `evidence_gap` | Noul | Does the requirement name a capability, tool, or domain absent from the record? |
| `scale_gap` | Noul | Is the stated scale larger than anything in the record? |
| `management` | Noul | Is this a people-and-money role? |

## What a first version got wrong

The first question set included *"would saying this candidate meets the
requirement go beyond what the record states?"* — a stretch check. Jev answered
0.86 to 0.99 on **every** requirement, including a Kubernetes migration the
record covers directly. A saturated question carries no information, so it was
removed rather than thresholded around. The named-tool gap and the scale gap
replaced it, and those do discriminate: 0.07 against 0.99 on the same set.
