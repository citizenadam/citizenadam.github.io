// Vercel Node function entry, so the same logic serves both hosts.
import { handle } from "./ask.js";

export default async function handler(req, res) {
  const origin = req.headers.origin || "";
  const body = req.body && typeof req.body === "object" ? req.body
    : (() => { try { return JSON.parse(req.body || "{}"); } catch { return {}; } })();

  const request = new Request(`https://${req.headers.host || "localhost"}/api/ask`, {
    method: req.method,
    headers: { ...req.headers, origin },
    body: req.method === "POST" ? JSON.stringify(body) : undefined
  });

  const response = await handle(request, {
    TYPESAFE_API_KEY: process.env.TYPESAFE_API_KEY,
    ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS,
    IP_DAILY_CAP: process.env.IP_DAILY_CAP,
    DAILY_CAP: process.env.DAILY_CAP
  });

  response.headers.forEach((value, key) => res.setHeader(key, value));
  res.status(response.status).send(await response.text());
}
