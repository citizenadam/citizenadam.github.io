/* Atlas — a perspective scatter in plain canvas 2D.
   x = cost (log), y = wall-clock (log), z = validity.
   No dependencies: the projection is three lines of matrix math and the
   depth sort is a sort. Three.js would be 600 KB to draw 40 dots. */

(function () {
  "use strict";

  var PALETTE = [
    "#d6f24b", "#7fd1c0", "#8fb8ff", "#e8a87c",
    "#c9a0ff", "#f07f9a", "#9fe08a", "#e6d27a"
  ];

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function log10(v) { return Math.log(v) / Math.LN10; }

  function fmtMoney(v) {
    if (v === 0) return "$0";
    if (v < 0.01) return "$" + v.toFixed(4);
    if (v < 1) return "$" + v.toFixed(3);
    if (v < 10) return "$" + v.toFixed(2);
    return "$" + v.toFixed(0);
  }

  function fmtDur(ms) {
    if (ms < 1000) return Math.round(ms) + "ms";
    var s = ms / 1000;
    if (s < 60) return s.toFixed(s < 10 ? 1 : 0) + "s";
    var m = s / 60;
    if (m < 60) return m.toFixed(m < 10 ? 1 : 0) + "m";
    return (m / 60).toFixed(1) + "h";
  }

  function fmtTokens(n) {
    if (n < 1000) return String(n);
    if (n < 1e6) return (n / 1000).toFixed(n < 1e4 ? 1 : 0) + "k";
    return (n / 1e6).toFixed(2) + "M";
  }

  function mount(canvas, opts) {
    var ctx = canvas.getContext("2d");
    var runs = opts.runs || [];
    var colorOf = opts.colorOf || function () { return PALETTE[0]; };
    var hidden = {};
    var yaw = 0.62, pitch = 0.34, zoom = 1;
    var drag = null;
    var hovered = null;
    var selected = null;
    var pts = [];

    var COL = getComputedStyle(document.documentElement);
    var ink = COL.getPropertyValue("--ink").trim() || "#eae7e1";
    var ink2 = COL.getPropertyValue("--ink-2").trim() || "#a5a19a";
    var ink3 = COL.getPropertyValue("--ink-3").trim() || "#6e6a63";
    var line = COL.getPropertyValue("--line").trim() || "#1f2225";
    var bad = COL.getPropertyValue("--bad").trim() || "#e2644c";
    var accent = COL.getPropertyValue("--accent").trim() || "#d6f24b";

    function domain(values, fallback) {
      var vals = values.filter(function (v) { return isFinite(v); });
      if (!vals.length) return fallback;
      var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
      if (lo === hi) { lo -= 0.5; hi += 0.5; }
      var pad = (hi - lo) * 0.08;
      return [lo - pad, hi + pad];
    }

    var visible = runs.filter(function (r) { return !hidden[r.model]; });
    var costD = domain(visible.map(function (r) { return log10(Math.max(r.cost_usd, 1e-6)); }), [-4, -1]);
    var wallD = domain(visible.map(function (r) { return log10(Math.max(r.wall_ms, 100)); }), [2, 4]);

    function gateFraction(r) {
      var keys = Object.keys(r.gates || {});
      if (!keys.length) return r.valid ? 1 : 0;
      var ok = keys.filter(function (k) { return r.gates[k]; }).length;
      return ok / keys.length;
    }

    function norm(r) {
      var x = (log10(Math.max(r.cost_usd, 1e-6)) - costD[0]) / (costD[1] - costD[0]);
      var y = (log10(Math.max(r.wall_ms, 100)) - wallD[0]) / (wallD[1] - wallD[0]);
      // z is the share of enforced gates that passed, so a run that missed one
      // sits slightly below the valid plane instead of being flattened onto the floor.
      var z = clamp(gateFraction(r), 0, 1) * 0.92;
      return { x: clamp(x, 0, 1), y: clamp(y, 0, 1), z: z };
    }

    function project(p) {
      var W = canvas._w || 880, H = canvas._h || 520;
      var vx = p.x - 0.5, vy = p.y - 0.5, vz = p.z - 0.5;
      var cy = Math.cos(yaw), sy = Math.sin(yaw);
      var cp = Math.cos(pitch), sp = Math.sin(pitch);
      var x1 = vx * cy - vz * sy;
      var z1 = vx * sy + vz * cy;
      var y1 = vy * cp - z1 * sp;
      var z2 = vy * sp + z1 * cp;
      var depth = z2;
      var s = 1 / (1 + (depth + 0.5) * 0.42);
      var S = Math.min(W, H) * (W < 620 ? 0.66 : 0.80) * zoom;
      return {
        x: W / 2 + x1 * s * S,
        y: H / 2 - y1 * s * S,
        depth: depth,
        scale: s
      };
    }

    function line3(a, b, color, width, dash) {
      var pa = project(a), pb = project(b);
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = width || 1;
      if (dash) ctx.setLineDash(dash);
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
      ctx.stroke();
      ctx.restore();
    }

    function label(text, p, color, align) {
      var q = project(p);
      ctx.save();
      ctx.fillStyle = color;
      ctx.font = "10px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.textAlign = align || "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, q.x, q.y);
      ctx.restore();
    }

    function drawAxes() {
      var O = { x: 0, y: 0, z: 0 };
      var X = { x: 1, y: 0, z: 0 };
      var Y = { x: 0, y: 1, z: 0 };
      var Z = { x: 0, y: 0, z: 1 };

      // floor grid on the validity plane (z = 0)
      for (var i = 0; i <= 4; i++) {
        var t = i / 4;
        line3({ x: t, y: 0, z: 0 }, { x: t, y: 1, z: 0 }, line, 1);
        line3({ x: 0, y: t, z: 0 }, { x: 1, y: t, z: 0 }, line, 1);
      }

      line3(O, X, ink3, 1.2);
      line3(O, Y, ink3, 1.2);
      line3(O, Z, ink3, 1.2);

      [0.06, 0.5, 0.94].forEach(function (f) {
        var v = costD[0] + (costD[1] - costD[0]) * f;
        label(fmtMoney(Math.pow(10, v)), { x: f, y: -0.055, z: 0 }, ink3);
      });
      [0.06, 0.5, 0.94].forEach(function (f) {
        var v = wallD[0] + (wallD[1] - wallD[0]) * f;
        label(fmtDur(Math.pow(10, v)), { x: -0.045, y: f, z: 0 }, ink3, "right");
      });
      label("cost", { x: 1.09, y: -0.085, z: 0 }, ink2);
      label("wall", { x: -0.02, y: 0.96, z: 0 }, ink2, "right");
      label("valid", { x: 0, y: 0, z: 1.06 }, ink2);
    }

    function draw() {
      var dpr = window.devicePixelRatio || 1;
      var rect = canvas.getBoundingClientRect();
      var w = Math.max(320, Math.round(rect.width));
      var h = Math.round(w * (w < 620 ? 0.86 : 0.55));
      if (canvas._w !== w || canvas._h !== h || canvas._dpr !== dpr) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        canvas.style.height = h + "px";
        canvas._dpr = dpr;
      }
      canvas._w = w;
      canvas._h = h;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      drawAxes();

      pts = [];
      var vis = runs.filter(function (r) { return !hidden[r.model]; });
      vis.forEach(function (r) {
        var p = norm(r);
        var q = project(p);
        pts.push({ run: r, x: q.x, y: q.y, depth: q.depth, scale: q.scale });
      });

      pts.sort(function (a, b) { return a.depth - b.depth; });

      pts.forEach(function (pt) {
        var r = pt.run;
        var rad = (r.valid ? 4.6 : 4.2) * (0.72 + pt.scale * 0.5);
        var isBad = !r.valid;
        var isSel = selected && selected.run_id === r.run_id;
        var isHov = hovered && hovered.run_id === r.run_id;
        ctx.save();
        ctx.globalAlpha = 0.45 + pt.scale * 0.55;
        if (isBad) {
          ctx.strokeStyle = bad;
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, rad, 0, Math.PI * 2);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(pt.x - rad * 0.55, pt.y);
          ctx.lineTo(pt.x + rad * 0.55, pt.y);
          ctx.stroke();
        } else {
          ctx.fillStyle = colorOf(r.model);
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, rad, 0, Math.PI * 2);
          ctx.fill();
        }
        if (isSel || isHov) {
          ctx.strokeStyle = accent;
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, rad + 4, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.restore();
      });

      // stash CSS-pixel geometry for hit testing
      canvas._pts = pts;
    }

    function hit(ev) {
      var rect = canvas.getBoundingClientRect();
      var mx = ev.clientX - rect.left, my = ev.clientY - rect.top;
      var best = null, bd = 16;
      (canvas._pts || []).forEach(function (p) {
        var d = Math.hypot(p.x - mx, p.y - my);
        if (d < bd) { bd = d; best = p; }
      });
      return best;
    }

    canvas.addEventListener("pointerdown", function (ev) {
      drag = { x: ev.clientX, y: ev.clientY, yaw: yaw, pitch: pitch, moved: false };
      canvas.setPointerCapture(ev.pointerId);
    });

    canvas.addEventListener("pointermove", function (ev) {
      if (drag) {
        var dx = ev.clientX - drag.x, dy = ev.clientY - drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
        yaw = drag.yaw + dx * 0.008;
        pitch = clamp(drag.pitch - dy * 0.006, -1.15, 1.15);
        draw();
        return;
      }
      var h = hit(ev);
      if (h) {
        hovered = h.run;
        canvas.style.cursor = "pointer";
        opts.onHover && opts.onHover(h.run, ev);
      } else {
        hovered = null;
        canvas.style.cursor = "grab";
        opts.onHover && opts.onHover(null, ev);
      }
      draw();
    });

    canvas.addEventListener("pointerup", function (ev) {
      var wasDrag = drag && drag.moved;
      drag = null;
      if (wasDrag) return;
      var h = hit(ev);
      selected = h ? h.run : null;
      opts.onSelect && opts.onSelect(selected);
      draw();
    });

    canvas.addEventListener("pointerleave", function () {
      hovered = null;
      opts.onHover && opts.onHover(null, null);
      draw();
    });

    canvas.addEventListener("wheel", function (ev) {
      ev.preventDefault();
      zoom = clamp(zoom * (ev.deltaY > 0 ? 0.92 : 1.08), 0.55, 2.4);
      draw();
    }, { passive: false });

    window.addEventListener("resize", draw);

    return {
      draw: draw,
      setHidden: function (model, isHidden) {
        if (isHidden) hidden[model] = true; else delete hidden[model];
        draw();
      },
      colorOf: function (model) {
        return colorOf(model);
      },
      palette: PALETTE,
      fmtMoney: fmtMoney,
      fmtDur: fmtDur,
      fmtTokens: fmtTokens
    };
  }

  window.Atlas = { mount: mount, PALETTE: PALETTE, fmtMoney: fmtMoney, fmtDur: fmtDur, fmtTokens: fmtTokens };
})();
