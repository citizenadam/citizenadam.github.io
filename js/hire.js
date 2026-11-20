// The headline panel. Twelve roles, judged once at publish time by a decision
// model, stored as a flat file. No request is made when a visitor clicks: no
// server, no key, no third party in the path.
(function () {
  "use strict";

  var CONFIG_URL = "/data/judge/precomputed.json";

  function el(id) { return document.getElementById(id); }

  function show(role, meta) {
    var out = el("hire-result");
    var placeholder = el("hire-placeholder");
    if (placeholder) placeholder.hidden = true;

    out.hidden = false;
    out.className = window.Verdict.toneClass(role.tone);
    out.innerHTML =
      '<p class="j-prompt">' + window.Verdict.esc(role.requirement) + "</p>" +
      window.Verdict.html(role, meta);
    out.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  async function boot() {
    var chips = el("hire-roles");
    if (!chips) return;

    try {
      var res = await fetch(CONFIG_URL, { cache: "no-cache" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      var data = await res.json();

      chips.innerHTML = data.roles.map(function (r, i) {
        return '<button type="button" class="hire-chip" data-i="' + i + '">' +
          window.Verdict.esc(r.label) + "</button>";
      }).join("");

      chips.querySelectorAll(".hire-chip").forEach(function (b) {
        b.addEventListener("click", function () {
          chips.querySelectorAll(".hire-chip").forEach(function (x) { x.setAttribute("aria-pressed", "false"); });
          b.setAttribute("aria-pressed", "true");

          var role = data.roles[Number(b.dataset.i)];
          var meta = "judged " + data.generated_at.slice(0, 10) + " · " +
            window.Verdict.money(data.tokens_used / data.roles.length) + " of tokens · " + data.model;
          show(role, meta);
        });
      });

      el("hire-meta").textContent =
        "Twelve roles judged in advance with " + data.model + " against record " +
        data.state_revision + ". Total cost of judging all twelve: " +
        window.Verdict.money(data.tokens_used) + ".";
    } catch (err) {
      el("hire-meta").textContent = "The role set is not published yet.";
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
