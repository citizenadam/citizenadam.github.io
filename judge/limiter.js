// One Durable Object per deployment. The state lives in memory, loaded once at
// construction, and is written back lazily: JavaScript here is single-threaded,
// so the check-and-set below cannot interleave with another request. Storage
// reads on every call were the reason a second request could slip through.
export class Limiter {
  constructor(state) {
    this.state = state;
    this.data = null;
    state.blockConcurrencyWhile(async () => {
      this.data = (await state.storage.get("state")) || null;
    });
  }

  async fetch(request) {
    const { ip, gapMs, ipCap, dayCap, globalPerMin } = await request.json();
    const today = new Date().toISOString().slice(0, 10);
    const now = Date.now();

    if (!this.data || this.data.day !== today) {
      this.data = { day: today, total: 0, perIp: {}, last: {}, recent: [] };
    }

    const lastAt = this.data.last[ip] || 0;
    if (now - lastAt < gapMs) {
      const wait = Math.ceil((gapMs - (now - lastAt)) / 1000);
      return Response.json({
        ok: false,
        reason: `Sorry for the delay. This tool is public and has no login, so it is heavily secured: one request every ${Math.round(gapMs / 1000)} seconds, which prevents somebody using it as a free source of unlimited AI at my cost. That limit is a small piece of the same cost control this page is about. Try again in ${wait}s.`
      });
    }
    // A whole-route ceiling, so a rotating address cannot walk around the
    // per-visitor gap.
    this.data.recent = (this.data.recent || []).filter((t) => now - t < 60000);
    if (this.data.recent.length >= (globalPerMin || 6)) {
      return Response.json({
        ok: false,
        reason: "The page is busy: six requests a minute across everybody. Sorry — that ceiling is what keeps it free to use. Try again in a minute."
      });
    }

    if (this.data.total >= dayCap) {
      return Response.json({ ok: false, reason: "This page has reached its daily limit. Sorry — a public endpoint with no login has to have a ceiling, or it is free AI at my cost." });
    }
    if ((this.data.perIp[ip] || 0) >= ipCap) {
      return Response.json({ ok: false, reason: "That is this visitor's limit for today. Sorry — that limit is what keeps a login-free tool affordable." });
    }

    this.data.recent.push(now);
    this.data.last[ip] = now;
    this.data.perIp[ip] = (this.data.perIp[ip] || 0) + 1;
    this.data.total += 1;

    if (Object.keys(this.data.perIp).length > 5000) {
      this.data.perIp = {};
      this.data.last = {};
    }

    this.state.storage.put("state", this.data);
    return Response.json({ ok: true });
  }
}
