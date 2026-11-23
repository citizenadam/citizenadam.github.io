// One request in, one judgment out. No framework, no dependencies: this runs
// on a Cloudflare Worker or a Vercel function unchanged.
//
// The API key lives here and never reaches the browser. That is the whole
// reason this file exists.

import { loadState } from "./state.mjs";
import { QUESTIONS, MODEL, buildRequest, decide } from "./questions.mjs";
import { fileToText } from "./extract.mjs";
import { urlToText } from "./url-extract.mjs";

const MAX_INPUT = 12000;
const DEFAULT_ORIGIN = "https://citizenadam.github.io";

const memory = new Map();

function cors(origin, env) {
  const allowed = (env.ALLOWED_ORIGINS || DEFAULT_ORIGIN).split(",").map((s) => s.trim());
  const ok = allowed.includes(origin) || allowed.includes("*");
  return {
    "access-control-allow-origin": ok ? origin || allowed[0] : allowed[0],
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "600",
    vary: "origin"
  };
}

function reply(body, status, origin, env) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...cors(origin, env) }
  });
}

async function sha(input) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(buf)].slice(0, 8).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Two limits: one per visitor per day, one global per day. With KV bound the
// counters survive isolates; without it they are per-isolate best effort.
// An IPv6 host is handed a /64, and privacy addressing rotates the last 64
// bits per connection. Keying on the full address lets a browser walk around
// the gap, so the key is the /64 itself.
function addressKey(addr) {
  if (!addr) return "unknown";
  if (addr.indexOf(":") >= 0) return addr.split(":").slice(0, 4).join(":") + "::/64";
  return addr;
}

async function limited(env, ip) {
  const gapMs = Number(env.MIN_GAP_MS || 60000);
  const ipCap = Number(env.IP_DAILY_CAP || 25);
  const dayCap = Number(env.DAILY_CAP || 400);
  const globalPerMin = Number(env.GLOBAL_PER_MIN || 6);

  // A Durable Object is the only place here with strong consistency. It holds
  // the gap and the daily counters for the whole deployment.
  const id = env.LIMITER.idFromName("global");
  const res = await env.LIMITER.get(id).fetch("https://limiter/check", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ip: await sha(addressKey(ip)), gapMs, ipCap, dayCap, globalPerMin })
  });
  return res.json();
}

export async function handle(request, env = {}) {
  const origin = request.headers.get("origin") || "";

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors(origin, env) });
  }
  if (request.method !== "POST") {
    return reply({ error: "method", message: "POST only" }, 405, origin, env);
  }
  if (!env.TYPESAFE_API_KEY) {
    return reply({ error: "configuration", message: "No judge key is configured." }, 503, origin, env);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return reply({ error: "input", message: "Body must be JSON." }, 400, origin, env);
  }

  let requirement = String(body.requirement || "").trim();

  // A pasted posting, a link, and an uploaded file take the same path from here.
  if (requirement.length < 8 && body.file && body.file.data) {
    try {
      requirement = (await fileToText(body.file.name, body.file.data)).replace(/[ \t]+/g, " ").trim();
    } catch (err) {
      return reply({ error: "file", message: err.message || "That file could not be read." }, 400, origin, env);
    }
  }

  // A link is fetched once, server-side, and only its visible text is kept:
  // markup, scripts, and styles are stripped, nothing executes. The box holds
  // one input, so a paste that is nothing but a link is a link to fetch.
  const pastedUrl = body.url || (/^https?:\/\/\S+$/i.test(requirement) && requirement.length <= 2048 ? requirement : "");
  if (pastedUrl) {
    try {
      requirement = (await urlToText(String(pastedUrl))).replace(/[ \t]+/g, " ").trim();
    } catch (err) {
      return reply({ error: "url", message: err.message || "That link could not be read." }, err.status || 400, origin, env);
    }
  }

  if (requirement.length < 8) {
    return reply({ error: "input", message: "Paste the requirements, paste a link to the posting, or drop a PDF, DOCX or text file." }, 400, origin, env);
  }
  if (requirement.length > MAX_INPUT) {
    return reply(
      { error: "input", message: `That is ${requirement.length} characters; the limit is ${MAX_INPUT}. Trim the posting to the requirements section.` },
      413, origin, env
    );
  }

  const ip = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "";
  const addr = ip.split(",")[0].trim();
  const gate = await limited(env, addr);
  console.log(JSON.stringify({ gate: gate.ok, reason: gate.reason || null, addr }));
  if (!gate.ok) {
    return reply({ error: "rate", message: gate.reason }, gate.status || 429, origin, env);
  }

  let upstream;
  try {
    upstream = await fetch(env.TYPESAFE_API_URL || "https://api.typesafe.ai/v1/systemone", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${env.TYPESAFE_API_KEY}`
      },
      body: JSON.stringify(buildRequest(requirement, loadState(env))),
      signal: AbortSignal.timeout(25000)
    });
  } catch (err) {
    return reply({ error: "upstream", message: "The judge did not answer in time." }, 504, origin, env);
  }

  if (!upstream.ok) {
    const text = await upstream.text().catch(() => "");
    // Never dress a failed call up as an answer. Silence is not a no.
    return reply(
      { error: "upstream", status: upstream.status, message: text.slice(0, 300) || "The judge returned an error." },
      502, origin, env
    );
  }

  const data = await upstream.json();
  const judged = decide(data.answers || {});

  return reply(
    {
      ...judged,
      model: data.model,
      usage: data.usage,
      state_revision: await sha(JSON.stringify(loadState(env)))
    },
    200, origin, env
  );
}

export { loadState, QUESTIONS, MODEL };
