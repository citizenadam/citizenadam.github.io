// One renderer for both the live judge and the precomputed role set, so a
// verdict looks the same however it was produced.
(function () {
  "use strict";

  var PRICE_PER_MTOK = 0.042;

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function money(tokens) {
    if (!tokens) return "";
    var usd = tokens * PRICE_PER_MTOK / 1e6;
    if (usd < 0.001) return "$" + usd.toFixed(6).replace(/0+$/, "");
    return "$" + usd.toFixed(4);
  }

  function bar(label, value, max) {
    var pct = Math.max(2, Math.min(100, (value / max) * 100));
    return '<div class="j-bar"><span class="j-bar-label">' + esc(label) + "</span>" +
      '<span class="j-bar-track"><span class="j-bar-fill" style="width:' + pct.toFixed(1) + '%"></span></span>' +
      '<span class="j-bar-value">' + esc(value.toFixed(2)) + "</span></div>";
  }

  function cta(tone) {
    var mail = window.Contact
      ? window.Contact.mailto("Saw the page — worth a conversation")
      : "#";

    if (tone === "yes") {
      return '<p class="j-cta-line"><a href="' + mail + '">Start the conversation</a></p>';
    }

    var title = tone === "no"
      ? "Not a perfect fit, and worth saying so plainly"
      : "Close, with gaps worth naming";

    var body = tone === "no"
      ? "The record does not cover this one. If the page found you anyway, something in it still overlaps with what you need. Happy to walk through where it does and where it clearly does not."
      : "Part of the record supports this and part of it does not. That is usually a better conversation than a verdict.";

    return '<div class="j-cta"><p class="j-cta-title">' + esc(title) + "</p>" +
      '<p class="j-cta-body">' + esc(body) + "</p>" +
      '<a class="j-cta-button" href="' + mail + '">Talk it through</a></div>';
  }

  function hasDoneThis(depth) {
    if (depth >= 1.7) return { word: "Yes, directly", cls: "ok" };
    if (depth >= 1.1) return { word: "Yes, closely related", cls: "mid" };
    return { word: "Not on the record yet", cls: "no" };
  }

  function matchesExperience(gap) {
    if (gap >= 0.7) return { word: "Names something outside the record", cls: "mid" };
    if (gap >= 0.4) return { word: "Would need some lead time", cls: "mid" };
    return { word: "Near perfect match", cls: "ok" };
  }

  function rampUp(scale) {
    if (scale >= 0.75) return { word: "Two to three months", cls: "mid" };
    if (scale >= 0.55) return { word: "About a month", cls: "mid" };
    if (scale >= 0.35) return { word: "About two weeks", cls: "ok" };
    return { word: "Can start today", cls: "ok" };
  }

  // Two answers, not three. A "maybe" is a decision nobody can act on, so the
  // badge is whether the record evidences the work: direct experience is a yes,
  // everything short of it is a no, and the rows carry the nuance.
  function badge(data) {
    var yes = typeof data.depth === "number" ? data.depth >= 1.7 : data.tone === "yes";
    return yes ? { text: "Yes", cls: "yes" } : { text: "No", cls: "no" };
  }

  var LABELS = {
    "Direct evidence": "Proven in this role",
    "Evidenced": "Strong fit",
    "Evidenced, with caveats": "Good fit, some ramp-up",
    "Evidenced, but a named requirement is missing": "Strong fit, one thing to learn",
    "Missing a named requirement": "Partial fit",
    "Adjacent experience only": "Transferable experience",
    "Not in the record": "Not evidenced"
  };

  function row(label, value) {
    return '<div class="v-fact"><dt>' + esc(label) + "</dt>" +
      '<dd class="' + value.cls + '">' + esc(value.word) + "</dd></div>";
  }

  function html(data, meta) {
    var b = badge(data);

    var out = '<p class="v-badge v-badge-' + b.cls + '">' + esc(b.text) + "</p>";
    out += '<p class="j-verdict">' + esc(LABELS[data.verdict] || data.verdict) + "</p>";

    out += '<dl class="v-facts">';
    out += row("Has done this work", hasDoneThis(data.depth));
    out += row("Matches real world experience", matchesExperience(data.gap));
    out += row("Ramp-up required", rampUp(data.scale_gap));
    out += "</dl>";

    out += cta(b.cls === "yes" ? "yes" : "no");

    // The raw numbers stay available, one click down, for anyone auditing it.
    out += '<details class="v-math"><summary>The numbers behind this</summary>';
    out += '<p class="j-reason">Directness ' + data.depth.toFixed(2) + " of 3. " +
      "Outside the record " + data.gap.toFixed(2) + ". Scale beyond the record " +
      data.scale_gap.toFixed(2) + ".</p>";
    out += '<div class="j-bars">';
    out += bar("direct evidence", data.depth, 3);
    out += bar("outside the record", data.gap, 1);
    out += bar("scale beyond record", data.scale_gap, 1);
    out += "</div>";
    if (data.flags && data.flags.length) {
      out += '<ul class="j-flags">' + data.flags.map(function (f) {
        return "<li>" + esc(f) + "</li>";
      }).join("") + "</ul>";
    }
    out += "</details>";

    if (meta) out += '<p class="j-meta">' + esc(meta) + "</p>";
    return out;
  }

  window.Verdict = {
    html: html,
    esc: esc,
    money: money,
    binary: badge,
    toneClass: function (data) {
      var t = typeof data === "string" ? data : badge(data || {}).cls;
      return "judge-result tone-" + t;
    }
  };
})();
