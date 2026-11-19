// The headline panel: pick the role you are hiring for, read what the record
// supports. Precomputed at publish time, so this works with no network call and
// no key anywhere near the browser.
(function () {
  "use strict";

  var CONFIG_URL = "/data/judge/precomputed.json";

  function el(id) { return document.getElementById(id); }

  function show(role, meta, source) {
    var out = el("hire-result");
    var placeholder = el("hire-placeholder");
    if (placeholder) placeholder.hidden = true;
    out.hidden = false;
    out.className = window.Verdict.toneClass(role.tone);
    out.innerHTML =
      '<p class="j-prompt">' + window.Verdict.esc(role.requirement) + "</p>" +
      window.Verdict.html(role, source);
    out.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  async function boot() {
    var chips = el("hire-roles");
    var out = el("hire-result");
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
          show(role, "judged " + data.generated_at.slice(0, 10) + " · " + window.Verdict.money(data.tokens_used / data.roles.length) + " of tokens · " + data.model);
        });
      });

      el("hire-meta").textContent =
        "Twelve roles judged with " + data.model + " against the record of " +
        data.state_revision + ". Total cost of judging all twelve: " +
        window.Verdict.money(data.tokens_used) + ".";

      if (out) out.hidden = true;
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
