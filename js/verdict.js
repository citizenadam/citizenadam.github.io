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

  function html(data, meta) {
    var out = '<p class="j-verdict">' + esc(data.verdict) + "</p>";
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

    out += cta(data.tone);

    if (meta) {
      out += '<p class="j-meta">' + esc(meta) + "</p>";
    }
    return out;
  }

  window.Verdict = {
    html: html,
    esc: esc,
    money: money,
    toneClass: function (tone) { return "judge-result tone-" + (tone || "maybe"); }
  };
})();
