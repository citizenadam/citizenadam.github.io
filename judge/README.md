# The hire judge

The headline panel asks a question a recruiter actually has — should we hire
this person for this role — and answers it from the recorded work history, with
yes, no or maybe and the reasons in plain words.

Everything here is static. GitHub Pages serves one JSON file; the page reads it.
There is no API call, no key in the browser, and no second provider.

## How an answer is produced

1. The record — three roles, the numbers, and a written list of what is **not**
   evidenced — is a secret called `JUDGE_RECORD`, set on the Worker and on the
   repository. It is not in this tree, so it can carry as much detail as the
   judgement needs without any of it being published. `state.mjs` only loads it.
2. `questions.mjs` holds four typed questions and the truth table that turns the
   answers into a verdict. The model supplies judgments; the decision is code.
3. `roles.mjs` holds twelve common roles, each written as a requirement.
4. `precompute.mjs` asks the model about all twelve and writes
   `data/judge/precomputed.json`.
5. `.github/workflows/judge.yml` runs that on any change to this directory, with
   `TYPESAFE_API_KEY` and `JUDGE_RECORD` from repository secrets, and commits the
   result.

Set both secrets with:

```sh
gh secret set TYPESAFE_API_KEY      < ~/.config/opencode/jev.env     # value only
gh secret set JUDGE_RECORD          < judge/.record.json
wrangler secret put TYPESAFE_API_KEY
wrangler secret put JUDGE_RECORD    < judge/.record.json
```

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

## Trimming a pasted posting

A real posting arrives with a mission statement, benefits, an EEO notice, an
arbitration agreement and the application form attached — 15,000 characters
where 3,000 describe the work. `trim.js` recognises sections by name
(`key responsibilities`, `minimum qualifications`, `preferred qualifications`,
`what you'll do`, `expectations`, `about the role`) and keeps only those,
dropping every other section and any boilerplate paragraph inside a kept one.

Recognition is by heading name, never by shape: "Next-generation sequencing
library preparation experience" looks like a heading and is a requirement, so
an unrecognised line stays body text. Every answer reports what it actually
read: `posting: { original, kept, sections }`.
