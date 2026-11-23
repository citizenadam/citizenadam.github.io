// The headline panel. Two ways in: a role from the precomputed set, or one
// box that takes pasted text, a bare link, or a dropped file.
(function () {
  "use strict";

  var CONFIG_URL = "/data/judge/precomputed.json";
  var MAX_BYTES = 4 * 1024 * 1024;
  var file = null;

  function el(id) { return document.getElementById(id); }

  function status(text) {
    var node = el("hire-status");
    if (node) node.textContent = text || "";
  }

  function showCard(html, tone) {
    var out = el("hire-result");
    out.hidden = false;
    out.className = window.Verdict.toneClass(tone);
    out.innerHTML = html;
    out.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  function fail(message) {
    showCard('<p class="j-verdict">No answer</p><p class="j-reason">' +
      window.Verdict.esc(message) + "</p>", "no");
  }

  // A throttle is not a failure. It gets its own card, in the same voice the
  // rest of the page uses.
  function throttled(message) {
    showCard('<p class="v-badge v-badge-maybe">Throttled</p>' +
      '<p class="j-verdict">Sorry for the delay</p>' +
      '<p class="j-reason">' + window.Verdict.esc(message) + "</p>", "maybe");
  }

  function toBase64(buf) {
    var bytes = new Uint8Array(buf);
    var out = "";
    var chunk = 0x8000;
    for (var i = 0; i < bytes.length; i += chunk) {
      out += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(out);
  }

  // One box for all three. Typed text wins; a dropped file stages until
  // typing replaces it. Anything staged shows in the box foot.
  function describeFile() {
    var box = el("hire-box");
    var hint = el("hire-hint");
    if (!file) {
      box.classList.remove("has-file");
      hint.innerHTML = "Drop a doc, PDF or text file here or " +
        '<button type="button" class="hire-link" id="hire-choose">choose one</button> · up to 4 MB';
      return;
    }
    box.classList.add("has-file");
    hint.innerHTML = window.Verdict.esc(file.name) + " · " +
      (file.size < 1024 ? file.size + " bytes" : Math.round(file.size / 1024) + " KB") +
      ' · <button type="button" class="hire-link" id="hire-clear">remove</button>';
  }

  function acceptFile(f) {
    if (!f) return;
    if (f.size > MAX_BYTES) {
      status("That file is larger than 4 MB. Trim the posting first.");
      return;
    }
    file = f;
    el("hire-text").value = "";
    describeFile();
    status("");
  }

  async function judgeRole(role, data) {
    var meta = "judged " + data.generated_at.slice(0, 10) + " · " +
      window.Verdict.money(data.tokens_used / data.roles.length) + " of tokens · " + data.model;
    showCard('<p class="j-prompt">' + window.Verdict.esc(role.requirement) + "</p>" +
      window.Verdict.html(role, meta), role);
  }

  // A bare link in the box is a link to fetch: the server fetches it once,
  // text only, and judges what it finds. Anything else is judged as pasted.
  function looksLikeLink(text) {
    return /^https?:\/\/\S+$/i.test(text) && text.length <= 2048;
  }

  async function submit(event) {
    event.preventDefault();
    var button = el("hire-submit");
    var text = el("hire-text").value.trim();
    var endpoint = el("hire-form").dataset.endpoint;

    if (!text && !file) {
      status("Paste a position description or URL, or drop a file in the box first.");
      return;
    }

    button.disabled = true;
    button.textContent = "Judging…";
    status(file && !text ? "Reading " + file.name + "…" : looksLikeLink(text) ? "Reading the link…" : "Reading the posting…");

    try {
      var body;
      if (text) {
        body = looksLikeLink(text) ? { url: text } : { requirement: text };
      } else {
        body = { file: { name: file.name, data: toBase64(await file.arrayBuffer()) } };
      }

      var res = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
      });
      var data = await res.json().catch(function () { return {}; });

      if (data.error === "rate") {
        throttled(data.message || "One request a minute. Try again shortly.");
      } else if (!res.ok || data.error) {
        fail(data.message || "The judge did not answer. Try again in a moment.");
      } else {
        var meta = data.model + " · " + window.Verdict.money(data.usage && data.usage.input_tokens) +
          " of tokens · record " + data.state_revision;
        if (data.posting && data.posting.kept < data.posting.original) {
          meta += " · read " + data.posting.kept.toLocaleString() + " of " +
            data.posting.original.toLocaleString() + " characters, the rest was boilerplate";
        }
        showCard(window.Verdict.html(data, meta), data.tone);
      }
    } catch (err) {
      fail("Could not reach the judge. " + (err && err.message ? err.message : ""));
    } finally {
      button.disabled = false;
      button.textContent = "Judge this posting";
      status("");
    }
  }

  async function boot() {
    var chips = el("hire-roles");
    if (!chips) return;

    var data = null;
    try {
      var res = await fetch(CONFIG_URL, { cache: "no-cache" });
      if (res.ok) data = await res.json();
    } catch (err) { /* the input still works without the precomputed set */ }

    if (data) {
      chips.innerHTML = data.roles.map(function (r, i) {
        return '<button type="button" class="hire-chip" data-i="' + i + '">' +
          window.Verdict.esc(r.label) + "</button>";
      }).join("");

      chips.querySelectorAll(".hire-chip").forEach(function (b) {
        b.addEventListener("click", function () {
          chips.querySelectorAll(".hire-chip").forEach(function (x) { x.setAttribute("aria-pressed", "false"); });
          b.setAttribute("aria-pressed", "true");
          judgeRole(data.roles[Number(b.dataset.i)], data);
        });
      });

      el("hire-meta").textContent =
        "Judged live by " + data.model + " against record " + data.state_revision +
        ". The twelve roles above were judged in advance, and all twelve cost " +
        window.Verdict.money(data.tokens_used) + " in total.";
    } else {
      chips.innerHTML = '<span class="hire-loading">Role set unavailable; paste a posting below.</span>';
    }

    var form = el("hire-form");
    form.addEventListener("submit", submit);

    var box = el("hire-box");
    var input = el("hire-file");
    var text = el("hire-text");

    describeFile();

    el("hire-foot").addEventListener("click", function (e) {
      if (!e.target) return;
      if (e.target.id === "hire-choose") input.click();
      if (e.target.id === "hire-clear") {
        file = null;
        input.value = "";
        describeFile();
        status("");
      }
    });
    input.addEventListener("change", function () {
      acceptFile(input.files[0]);
      input.value = "";
    });

    // Typing replaces a staged file: whatever is in the box is the input.
    text.addEventListener("input", function () {
      if (file && text.value.trim()) {
        file = null;
        describeFile();
      }
    });

    function hasFiles(e) {
      return e.dataTransfer && e.dataTransfer.types &&
        Array.prototype.indexOf.call(e.dataTransfer.types, "Files") >= 0;
    }

    ["dragenter", "dragover"].forEach(function (name) {
      box.addEventListener(name, function (e) {
        if (!hasFiles(e)) return;
        e.preventDefault();
        box.classList.add("dragging");
      });
    });
    ["dragleave", "drop"].forEach(function (name) {
      box.addEventListener(name, function (e) {
        if (!hasFiles(e)) return;
        e.preventDefault();
        box.classList.remove("dragging");
      });
    });
    box.addEventListener("drop", function (e) {
      if (!hasFiles(e)) return;
      acceptFile(e.dataTransfer.files[0]);
    });

    // A posting dropped anywhere on the panel should land in the same place.
    form.addEventListener("dragover", function (e) { e.preventDefault(); });
    form.addEventListener("drop", function (e) {
      if (e.target.closest && e.target.closest("#hire-box")) return;
      e.preventDefault();
      var dropped = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      acceptFile(dropped);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
