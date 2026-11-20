// Cloudflare Worker entry. wrangler.toml points at this file.
import { handle } from "./ask.js";

export default {
  fetch: (request, env) => handle(request, env)
};
