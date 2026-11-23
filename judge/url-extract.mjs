// Turns a link to a posting into text. Only ever returns visible text: markup,
// scripts, and styles are stripped, nothing is executed, and nothing but the
// text is kept. Runs in a Cloudflare Worker or plain Node unchanged.

const MAX_URL_BYTES = 1500000;
const MAX_URL_LEN = 2048;

const BLOCKED_EXACT = new Set([
  "localhost",
  "metadata.google",
  "metadata.google.internal",
  "metadata.google.internal.",
  "instance-data",
  "instance-data-compute",
  "instance-metadata",
  "169.254.169.254",
  "100.100.100.200",
  "213.186.116.80"
]);

const BLOCKED_SUFFIXES = [
  ".internal",
  ".internal.",
  ".local",
  ".lan",
  ".home",
  ".corp",
  ".localdomain",
  ".invalid",
  ".test",
  ".example",
  ".localhost"
];

function isIPv4(host) {
  const parts = host.split(".");
  if (parts.length !== 4) return false;
  return parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) >= 0 && Number(p) <= 255);
}

function blockedIPv4(host) {
  const [a, b] = host.split(".").map(Number);
  if (a === 0) return true;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 192 && b === 0 && host.startsWith("192.0.2.")) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a === 198 && b === 51 && host.startsWith("198.51.100.")) return true;
  if (a === 203 && b === 0 && host.startsWith("203.0.113.")) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a >= 224) return true;
  return false;
}

function blockedIPv6(host) {
  const h = host.toLowerCase();
  if (h === "::1" || h === "::") return true;
  if (h.startsWith("fe80") || h.startsWith("fec0")) return true;
  if (h.startsWith("fc") || h.startsWith("fd")) return true;
  if (h.startsWith("::ffff:")) {
    const v4 = h.slice("::ffff:".length).replace(/^\[|\]$/g, "");
    if (isIPv4(v4) && blockedIPv4(v4)) return true;
  }
  return false;
}

export function validatePostingUrl(raw) {
  const text = String(raw || "").trim();
  if (text.length < 12) throw inputError("Paste a full link starting with http:// or https://.");
  if (text.length > MAX_URL_LEN) throw inputError("That link is longer than 2048 characters.");

  let url;
  try {
    url = new URL(text);
  } catch {
    throw inputError("That link could not be parsed. It needs to start with http:// or https://.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw inputError("Only http:// and https:// links are fetched. No file, data, or script links.");
  }
  if (url.username || url.password) {
    throw inputError("Links with a login in them are refused.");
  }

  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!host) throw inputError("That link has no host.");
  if (BLOCKED_EXACT.has(host)) throw inputError("That address is not fetched: internal and metadata hosts are refused.");
  if (BLOCKED_EXACT.has(url.hostname.toLowerCase())) {
    throw inputError("That address is not fetched: internal and metadata hosts are refused.");
  }
  for (const suffix of BLOCKED_SUFFIXES) {
    if (host.endsWith(suffix.replace(/\.$/, "")) || host.endsWith(suffix)) {
      throw inputError("That address is not fetched: internal names are refused.");
    }
  }
  if (isIPv4(host)) {
    if (blockedIPv4(host)) throw inputError("That address is not fetched: private and reserved addresses are refused.");
  } else if (host.includes(":")) {
    if (blockedIPv6(host)) throw inputError("That address is not fetched: private and reserved addresses are refused.");
  } else if (!host.includes(".")) {
    throw inputError("That address is not fetched: single-name hosts are refused.");
  }

  if (url.port && url.port !== "80" && url.port !== "443") {
    throw inputError("Only the normal web ports are fetched; that link names another port.");
  }

  return url;
}

function inputError(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function decodeEntities(s) {
  return s
    .replace(/&#x([0-9a-fA-F]{1,6});/g, (_, h) => {
      try {
        return String.fromCodePoint(parseInt(h, 16));
      } catch {
        return "";
      }
    })
    .replace(/&#(\d{1,7});/g, (_, d) => {
      try {
        return String.fromCodePoint(parseInt(d, 10));
      } catch {
        return "";
      }
    })
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/gi, " ")
    .replace(/&tab;/gi, "\t");
}

export function htmlToText(html) {
  let title = "";
  const titleMatch = String(html).match(/<title[^>]*>([\s\S]{0,500})<\/title\s*>/i);
  if (titleMatch) {
    title = decodeEntities(titleMatch[1].replace(/<[^>]*>/g, "").trim()).replace(/\s+/g, " ").slice(0, 300);
  }

  let body = String(html);
  const bodyMatch = body.match(/<body[^>]*>([\s\S]*)<\/body\s*>/i);
  if (bodyMatch) body = bodyMatch[1];

  body = body
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<script[\s\S]*?<\/script\s*>/gi, " ")
    .replace(/<style[\s\S]*?<\/style\s*>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript\s*>/gi, " ")
    .replace(/<template[\s\S]*?<\/template\s*>/gi, " ")
    .replace(/<(svg|canvas|iframe|object|embed|video|audio)[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<\/(p|div|li|tr|section|article|h1|h2|h3|h4|h5|h6)>/gi, "\n")
    .replace(/<(br|hr|tr)[^>]*>/gi, "\n")
    .replace(/<[^>]*>/g, " ");

  let text = decodeEntities(body)
    .replace(/\r/g, "\n")
    .replace(/[ \t\u00a0]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (title && text.slice(0, title.length + 20).indexOf(title.slice(0, 40)) === -1) {
    text = (title + "\n\n" + text).trim();
  }
  return text;
}

export async function urlToText(rawUrl, fetchFn = fetch) {
  const url = validatePostingUrl(rawUrl);

  let res;
  try {
    res = await fetchFn(url.toString(), {
      headers: {
        accept: "text/html,application/xhtml+xml,text/plain;q=0.9,text/markdown;q=0.8",
        "user-agent": "citizenadam-judge/1.0 (+https://citizenadam.github.io/)"
      },
      signal: AbortSignal.timeout(15000),
      redirect: "follow"
    });
  } catch (err) {
    const timeout = err && err.name === "TimeoutError";
    throw inputError(
      timeout ? "That link timed out after 15 seconds." : "That link could not be reached.",
      502
    );
  }

  if (!res.ok) {
    throw inputError(`That link returned ${res.status}. Check it opens in a browser first.`);
  }

  const contentType = (res.headers.get("content-type") || "").toLowerCase();
  if (contentType && !/text\/html|application\/xhtml|text\/plain|text\/markdown|text\/xml/.test(contentType)) {
    if (/pdf/.test(contentType)) {
      throw inputError("That link points to a PDF. Download it and drop the file instead.", 415);
    }
    throw inputError(`That link is ${contentType.split(";")[0] || "not a page"}; only pages and plain text are read.`, 415);
  }

  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_URL_BYTES) {
    throw inputError("That page is larger than 1.5 MB.", 413);
  }

  const buf = await res.arrayBuffer();
  if (buf.byteLength > MAX_URL_BYTES) {
    throw inputError("That page is larger than 1.5 MB.", 413);
  }
  if (buf.byteLength === 0) {
    throw inputError("That page came back empty.");
  }

  const raw = new TextDecoder("utf-8", { fatal: false }).decode(buf);
  const text = (/text\/plain|text\/markdown/.test(contentType) ? raw : htmlToText(raw))
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .trim();

  if (text.length < 8) {
    throw inputError("That page had no readable posting text.");
  }
  return text;
}
