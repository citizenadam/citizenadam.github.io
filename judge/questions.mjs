// Every judgment this page asks Jev to make, in one place, so it can be read
// and argued with. The decision itself is code, below.

export const MODEL = "jev-latest";

export const QUESTIONS = {
  depth: {
    type: "score",
    instructions:
      "How much of this requirement does the work record in `roles` demonstrate directly?",
    criteria: [
      "The record shows no work on this responsibility at all.",
      "The record shows adjacent work that could transfer, but not this responsibility itself.",
      "The record shows direct experience doing this responsibility.",
      "The record shows direct experience with wider ownership or larger scale than the requirement asks for."
    ]
  },

  evidence_gap: {
    type: "noul",
    instructions:
      "Does the requirement name a specific capability, tool, or domain that appears nowhere in `roles` or `skills_demonstrated`?",
    criteria: {
      true: "The requirement names a capability, tool, or domain that the record never mentions, such as a named product, a language, or an industry.",
      false: "Every capability the requirement names is either in the record or a close neighbour of something in the record."
    }
  },

  scale_gap: {
    type: "noul",
    instructions:
      "Does the requirement set a scale, headcount, budget, or volume materially larger than anything in `roles`?",
    criteria: {
      true: "The requirement states a size the record never reaches, such as a much larger company, a much larger team, or a much larger budget.",
      false: "The requirement's scale is at or below what the record already shows, or it states no scale at all."
    }
  },

  management: {
    type: "noul",
    instructions:
      "Does the requirement ask for managing people, owning a budget, or running an organisation?",
    criteria: {
      true: "The requirement mentions reports, headcount, budget, vendor management, or running a department.",
      false: "The requirement is about building or operating systems rather than running people or money."
    }
  }
};

// The truth table. Jev supplies judgments; this decides what to say. Every
// branch has an outcome, including the band where the model is unsure.
export function decide(answers) {
  const depth = answers.depth?.score ?? 0;
  const depthProb = answers.depth?.probabilities ?? [];
  const gap = answers.evidence_gap?.noul ?? 0.5;
  const scale = answers.scale_gap?.noul ?? 0.5;
  const management = answers.management?.noul ?? 0.5;

  // Thresholds are the documented defaults where they exist: 0.7 reads as yes,
  // 0.3 as no, and the band between means the record does not settle it.
  const flags = [];
  const near = (v, t) => Math.abs(v - t) < 0.12;
  if (near(depth, 1.1) || near(depth, 1.5) || near(depth, 2.1)) {
    flags.push("the evidence sits on a threshold, so a small change in the record would move this");
  }
  if (gap > 0.3 && gap < 0.7) flags.push("part of the requirement is not clearly in the record");
  if (scale > 0.3 && scale < 0.7) flags.push("the scale comparison is unsettled");
  if (management > 0.3 && management < 0.7) flags.push("whether this is a people-and-money role is unclear");

  let verdict, tone;

  if (depth < 1.1) {
    verdict = "Not in the record";
    tone = "no";
  } else if (gap >= 0.7 && depth < 1.7) {
    verdict = "Missing a named requirement";
    tone = "no";
  } else if (gap >= 0.7) {
    // The substance is there and a specific term is not. Saying no would throw
    // away the depth answer; saying yes would hide the gap.
    verdict = "Evidenced, but a named requirement is missing";
    tone = "maybe";
  } else if (depth >= 2.1 && gap < 0.35 && scale < 0.5) {
    verdict = "Direct evidence";
    tone = "yes";
  } else if (depth >= 1.5 && gap < 0.5 && scale < 0.5) {
    verdict = "Evidenced";
    tone = "yes";
  } else if (depth >= 1.5) {
    verdict = "Evidenced, with caveats";
    tone = "maybe";
  } else {
    verdict = "Adjacent experience only";
    tone = "maybe";
  }

  return {
    verdict,
    tone,
    depth: Number(depth.toFixed(2)),
    depth_by_level: depthProb,
    gap: Number(gap.toFixed(2)),
    scale_gap: Number(scale.toFixed(2)),
    management: Number(management.toFixed(2)),
    flags
  };
}

export function buildRequest(requirement, record) {
  return {
    model: MODEL,
    state: { requirement, record },
    questions: QUESTIONS
  };
}
