// One Durable Object per deployment, holding the counters in storage so they
// survive eviction. KV was the wrong tool: it is eventually consistent, so two
// requests a second apart could both pass the 60-second gap.
export class Limiter {
  constructor(state) {
    this.state = state;
  }

  async fetch(request) {
    const { ip, gapMs, ipCap, dayCap } = await request.json();
    const today = new Date().toISOString().slice(0, 10);
    const now = Date.now();

    let s = await this.state.storage.get("state");
    if (!s || s.day !== today) {
      s = { day: today, total: 0, perIp: {}, last: {} };
    }

    const lastAt = s.last[ip] || 0;
    if (now - lastAt < gapMs) {
      const wait = Math.ceil((gapMs - (now - lastAt)) / 1000);
      return Response.json({
        ok: false,
        reason: `One request every ${Math.round(gapMs / 1000)} seconds. Try again in ${wait}s.`
      });
    }
    if (s.total >= dayCap) {
      return Response.json({ ok: false, reason: "This page has reached its daily limit." });
    }
    const mine = s.perIp[ip] || 0;
    if (mine >= ipCap) {
      return Response.json({ ok: false, reason: "That is this visitor's limit for today." });
    }

    s.last[ip] = now;
    s.perIp[ip] = mine + 1;
    s.total += 1;

    // Keep the maps from growing without bound.
    if (Object.keys(s.perIp).length > 5000) {
      s.perIp = {};
      s.last = {};
    }

    await this.state.storage.put("state", s);
    return Response.json({ ok: true });
  }
}
