/* Loads the flat JSON, paints the legend, the run table and the derived
   findings, then hands the run set to Atlas. No build step, no framework. */

(function () {
  "use strict";

  var PALETTE = window.Atlas.PALETTE;
  var fmtMoney = window.Atlas.fmtMoney;
  var fmtDur = window.Atlas.fmtDur;
  var fmtTokens = window.Atlas.fmtTokens;

  function el(id) { return document.getElementById(id); }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function median(nums) {
    if (!nums.length) return 0;
    var a = nums.slice().sort(function (x, y) { return x - y; });
    var m = Math.floor(a.length / 2);
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  }

  function parseJSONL(text) {
    return text.split("\n").map(function (l) { return l.trim(); })
      .filter(function (l) { return l && l[0] === "{"; })
      .map(function (l) { try { return JSON.parse(l); } catch (e) { return null; } })
      .filter(Boolean);
  }

  function state(html) {
    var f = el("findings");
    if (f) f.innerHTML = html;
  }

  fetch("/data/bench/manifest.json", { cache: "no-store" })
    .then(function (r) { return r.ok ? r.json() : null; })
    .catch(function () { return null; })
    .then(function (manifest) {
      return Promise.all([
        fetch("/data/bench/runs.jsonl", { cache: "no-store" })
          .then(function (r) { return r.ok ? r.text() : ""; })
          .catch(function () { return ""; }),
        fetch("/data/bench/models.json", { cache: "no-store" })
          .then(function (r) { return r.ok ? r.json() : { models: [] }; })
          .catch(function () { return { models: [] }; })
      ]).then(function (res) {
        boot(manifest, parseJSONL(res[0]), res[1].models || []);
      });
    });

  function boot(manifest, runs, models) {
    // The model's own span is the fair wall-clock: a client that hangs after
    // the last message should not be charged to the model.
    runs = runs.map(function (r) {
      var q = r.quality || {};
      var w = q.agent_ms || r.wall_ms;
      return Object.assign({}, r, { wall_ms: w });
    });

    var colorFor = {};
    models.forEach(function (m, i) {
      var c = m.color || PALETTE[i % PALETTE.length];
      colorFor[m.id] = c;
      if (m.label) colorFor[m.label] = c;
    });
    runs.forEach(function (r, i) {
      if (!colorFor[r.model]) colorFor[r.model] = PALETTE[i % PALETTE.length];
    });
    function colorOf(id) { return colorFor[id] || PALETTE[0]; }

    if (!runs.length) {
      el("atlas-empty").hidden = false;
      el("findings").hidden = true;
      el("atlas-legend").hidden = true;
    }

    var meta = el("bench-meta");
    if (meta) {
      if (!runs.length) {
        meta.textContent = "Pilot not recorded yet. runs.jsonl is empty.";
      } else {
        var models = {}, tasks = {}, cost = 0;
        runs.forEach(function (r) { models[r.model] = 1; tasks[r.task] = 1; cost += r.cost_usd; });
        meta.textContent = Object.keys(models).length + " models x " +
          Object.keys(tasks).length + " task" + (Object.keys(tasks).length === 1 ? "" : "s") +
          " x " + runs.length + " runs. List price of everything shown: " + fmtMoney(cost) +
          ". Marginal spend: $0, billed against existing provider subscriptions.";
      }
    }

    // ---- atlas ----
    var tip = el("atlas-tip");
    var atlas = window.Atlas.mount(el("atlas-canvas"), {
      runs: runs,
      colorOf: colorOf,
      onHover: function (run, ev) {
        if (!run) { tip.hidden = true; return; }
        var failed = Object.keys(run.gates || {}).filter(function (k) { return !run.gates[k]; });
        tip.innerHTML =
          "<b>" + esc(run.model) + "</b> · " + esc(run.task) + "<br>" +
          (run.valid ? '<span class="ok">valid</span>' : '<span class="warn">invalid</span>') +
          (failed.length ? " · " + esc(failed.join(", ")) : "") + "<br>" +
          "cost " + fmtMoney(run.cost_usd) + " · wall " + fmtDur(run.wall_ms) + "<br>" +
          "in " + fmtTokens(run.tokens.input) + " · out " + fmtTokens(run.tokens.output) +
          " · steps " + (run.steps || "–");
        tip.hidden = false;
        var stage = el("atlas-chart-wrap") || tip.parentElement;
        var box = stage.getBoundingClientRect();
        var x = ev.clientX - box.left + 14;
        var y = ev.clientY - box.top + 14;
        tip.style.left = Math.min(x, box.width - tip.offsetWidth - 8) + "px";
        tip.style.top = Math.min(y, box.height - tip.offsetHeight - 8) + "px";
      }
    });

    // ---- legend ----
    var legend = el("atlas-legend");
    var byModel = {};
    runs.forEach(function (r) {
      var b = byModel[r.model] || (byModel[r.model] = { runs: 0, valid: 0 });
      b.runs++; if (r.valid) b.valid++;
    });
    Object.keys(byModel).sort().forEach(function (id) {
      var b = byModel[id];
      var btn = document.createElement("button");
      btn.className = "lg";
      btn.type = "button";
      btn.setAttribute("aria-pressed", "true");
      btn.innerHTML = '<span class="lg-swatch" style="background:' + colorOf(id) + '"></span>' +
        '<span class="lg-name">' + esc(id) + '</span>' +
        '<span class="lg-val">' + b.valid + "/" + b.runs + '</span>';
      btn.addEventListener("click", function () {
        var on = btn.getAttribute("aria-pressed") === "true";
        btn.setAttribute("aria-pressed", on ? "false" : "true");
        atlas.setHidden(id, on);
      });
      legend.appendChild(btn);
    });

    // ---- table ----
    var tbody = el("runs-table").querySelector("tbody");
    runs.slice().sort(function (a, b) { return a.run_id < b.run_id ? -1 : 1; }).forEach(function (r) {
      var failed = Object.keys(r.gates || {}).filter(function (k) { return !r.gates[k]; });
      var tr = document.createElement("tr");
      tr.innerHTML =
        "<td>" + esc(r.run_id) + "</td>" +
        "<td>" + esc(r.model) + "</td>" +
        "<td>" + esc(r.task) + "</td>" +
        "<td class='" + (r.valid ? "ok" : "bad") + "'>" + (r.valid ? "yes" : "no") + "</td>" +
        "<td>" + (failed.length ? esc(failed.join(", ")) : "—") + "</td>" +
        "<td class='num'>" + fmtTokens(r.tokens.input) + "</td>" +
        "<td class='num'>" + fmtTokens(r.tokens.output) + "</td>" +
        "<td class='num'>" + fmtMoney(r.cost_usd) + "</td>" +
        "<td class='num'>" + fmtDur(r.wall_ms) + "</td>";
      tbody.appendChild(tr);
    });

    // ---- findings, derived so they cannot drift from the data ----
    var valid = runs.filter(function (r) { return r.valid; });
    var invalid = runs.filter(function (r) { return !r.valid; });
    var cheapest = valid.slice().sort(function (a, b) { return a.cost_usd - b.cost_usd; })[0];
    var overhead = median(runs.map(function (r) { return r.tokens.input; }));

    var cards = [];
    cards.push({
      n: fmtTokens(overhead),
      p: "median input tokens per run before the model has written a line. Scaffold, tools, and system prompt are the floor of every task."
    });
    cards.push({
      n: valid.length + "/" + runs.length,
      p: "runs passed every gate. " + (invalid.length
        ? invalid.length + " failed at least one, and are excluded from the cost and time comparison."
        : "Nothing was excluded, which is unusual — check the gates are actually running.")
    });
    if (cheapest) {
      cards.push({
        n: fmtMoney(cheapest.cost_usd) + " / " + fmtDur(cheapest.wall_ms),
        p: "cheapest valid run: " + esc(cheapest.model) + " on " + esc(cheapest.task) + "."
      });
    }
    var reps = {};
    runs.forEach(function (r) { reps[r.model] = (reps[r.model] || 0) + 1; });
    var multi = Object.keys(reps).filter(function (k) { return reps[k] > 1; });
    if (multi.length) {
      var stable = multi.filter(function (m) {
        return runs.filter(function (r) { return r.model === m; }).every(function (r) { return r.valid; });
      });
      cards.push({
        n: stable.length + "/" + multi.length,
        p: "models that passed every repetition. Same task, same harness: a model that passes once in three is not reliable, it is lucky."
      });
    }
    state(cards.map(function (c) {
      return '<div class="finding"><div class="finding-num">' + c.n + '</div><p>' + c.p + "</p></div>";
    }).join(""));

    atlas.draw();
  }
})();
