// The free-text judge: sends a pasted requirement to the endpoint and shows
// the judgment. Rendering lives in verdict.js so both paths look the same.
(function () {
  "use strict";

  function el(id) { return document.getElementById(id); }

  function fail(message) {
    var out = el("judge-result");
    out.hidden = false;
    out.className = "judge-result tone-error";
    out.innerHTML = '<p class="j-verdict">No answer</p>' +
      '<p class="j-reason">' + window.Verdict.esc(message) + "</p>";
  }

  function render(data) {
    var out = el("judge-result");
    out.hidden = false;
    out.className = window.Verdict.toneClass(data.tone);

    var meta = data.model || "jev";
    if (data.usage && data.usage.input_tokens) {
      meta += " · " + window.Verdict.money(data.usage.input_tokens) + " of tokens";
    }
    if (data.state_revision) meta += " · record " + data.state_revision;

    out.innerHTML = window.Verdict.html(data, meta);
  }

  function init() {
    var form = el("judge-form");
    if (!form) return;

    var input = el("judge-input");
    var button = el("judge-submit");
    var endpoint = form.dataset.endpoint || "/api/ask";

    document.querySelectorAll("[data-judge-example]").forEach(function (chip) {
      chip.addEventListener("click", function () {
        input.value = chip.getAttribute("data-judge-example");
        input.focus();
      });
    });

    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      var requirement = input.value.trim();
      if (requirement.length < 8) {
        fail("Paste the role's requirements first.");
        return;
      }

      button.disabled = true;
      button.textContent = "Judging…";
      el("judge-result").hidden = true;

      try {
        var res = await fetch(endpoint, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ requirement: requirement })
        });
        var data = await res.json().catch(function () { return {}; });
        if (!res.ok || data.error) {
          fail(data.message || "The judge is not answering right now.");
        } else {
          render(data);
        }
      } catch (err) {
        fail("Could not reach the judge. " + (err && err.message ? err.message : ""));
      } finally {
        button.disabled = false;
        button.textContent = "Judge this";
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
