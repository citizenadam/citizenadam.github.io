// A pasted posting arrives with the company's boilerplate attached: mission
// statements, benefits, EEO notices, arbitration text, and the application
// form itself. None of that is evidence about the role.
//
// Sections are recognised by name, not by shape. A line only starts a section
// when it is one of the headings below, because "Next-generation sequencing
// library preparation experience" looks exactly like a heading and is a
// requirement. Anything unrecognised stays body text.

const KEEP = [
  /^(about )?the role$/i,
  /^(role )?(overview|summary)$/i,
  /^(key )?responsibilities$/i,
  /^responsibilities$/i,
  /^what you('|’)?ll (do|be doing)$/i,
  /^what you will (do|be doing)$/i,
  /^(your )?day to day$/i,
  /^(minimum|basic|required|preferred|additional|other) qualifications$/i,
  /^qualifications$/i,
  /^requirements$/i,
  /^(you )?(may|might) be a good fit if$/i,
  /^who you are$/i,
  /^what we('|’)?re looking for$/i,
  /^expectations$/i,
  /^(about )?you$/i,
  /^(key )?skills$/i,
  /^experience( required)?$/i,
  /^what you('|’)?ll bring$/i,
  /^in this role,? you will$/i
];

const DROP = [
  /^(about|our) (the )?(company|team|us|mission|values|culture)/i,
  /^benefits$/i,
  /^perks$/i,
  /^compensation$/i,
  /^pay range$/i,
  /^annual salary$/i,
  /^salary$/i,
  /^logistics$/i,
  /^(equal|diversity|inclusion)/i,
  /^(eeo|affirmative)/i,
  /^voluntary self.?identification/i,
  /^agreement to arbitrate/i,
  /^how to apply$/i,
  /^apply( for this job)?$/i,
  /^create a job alert/i,
  /^additional information$/i,
  /^(linkedin|resume\/cv|personal preferences)/i,
  /^why /i,
  /^come work with us/i,
  /^guidance on/i,
  /^powered by/i,
  /^about (anthropic|acme|[A-Z][a-z]+)$/i
];

// Paragraph-level boilerplate that can appear anywhere.
const CRUFT = [
  /we encourage you to apply even if/i,
  /imposter syndrome/i,
  /underrepresented/i,
  /recruiters only contact you from/i,
  /never ask (you )?for money/i,
  /protect yourself from potential scams/i,
  /equal employment opportunity/i,
  /do not discriminate/i,
  /arbitration/i,
  /class or collective action/i,
  /voluntary self-identification/i,
  /protected veteran/i,
  /accepted file types/i,
  /indicates a required field/i,
  /create (a )?job alert/i,
  /powered by/i,
  /^select\.\.\./i,
  /privacy (policy|notice)/i,
  /we offer competitive compensation/i,
  /benefits include/i,
  /visa sponsorship/i,
  /^the annual compensation range/i,
  /^for sales roles,? the range/i,
  /on target earnings/i,
  /^this is a rare opportunity/i
];

function label(line) {
  const t = line.trim().replace(/[:#*]+$/, "").replace(/\s+/g, " ");
  if (DROP.some((re) => re.test(t))) return "drop";
  if (KEEP.some((re) => re.test(t))) return "keep";
  return null;
}

function isCruft(text) {
  return CRUFT.some((re) => re.test(text));
}

function worthKeeping(text) {
  return /(experience|responsibilit|qualif|you('|’)?ll|you will|skills|degree|years|proficien|familiar)/i.test(text);
}

export function trimPosting(input, limit) {
  const text = String(input || "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const sections = [];
  let current = { heading: "", mode: "intro", body: [] };

  for (const line of text.split("\n")) {
    const mark = line.trim() && line.trim().length <= 72 ? label(line) : null;
    if (mark) {
      sections.push(current);
      current = { heading: line.trim(), mode: mark, body: [] };
      continue;
    }
    current.body.push(line);
  }
  sections.push(current);

  const clean = (bodyLines) => {
    const out = [];
    for (const block of bodyLines.join("\n").split(/\n{2,}/)) {
      const trimmed = block.trim();
      if (!trimmed) continue;
      if (!isCruft(trimmed)) {
        out.push(trimmed);
        continue;
      }
      if (trimmed.length > 300) {
        const keptLines = trimmed.split("\n").filter((l) => l.trim() && !isCruft(l));
        if (keptLines.length) out.push(keptLines.join("\n"));
      }
    }
    return out.join("\n\n");
  };

  const headings = [];
  const kept = sections
    .map((s) => {
      const body = clean(s.body);
      if (!body) return "";
      const keep =
        s.mode === "keep" ||
        (s.mode === "intro" && worthKeeping(body));
      if (!keep) return "";
      if (s.heading) headings.push(s.heading);
      return (s.heading ? s.heading + "\n" : "") + body;
    })
    .filter(Boolean);

  let out = kept.join("\n\n").trim();

  // No recognisable headings at all: filter paragraph by paragraph instead.
  if (out.length < 40) {
    out = text
      .split(/\n{2,}/)
      .map((b) => b.trim())
      .filter((b) => b && b.length > 30 && !isCruft(b))
      .join("\n\n");
  }

  if (limit && out.length > limit) {
    const cut = out.slice(0, limit);
    const at = cut.lastIndexOf("\n\n");
    out = (at > limit * 0.5 ? cut.slice(0, at) : cut).trim();
  }

  return { text: out, original: text.length, kept: out.length, sections: headings };
}
