// Cloudflare Worker entry. The limiter lives beside it as a Durable Object so
// the counters are strongly consistent; KV was too loose for a 60-second gap.
import { handle } from "./ask.js";
export { Limiter } from "./limiter.js";

export default {
  fetch: (request, env) => handle(request, env)
};
