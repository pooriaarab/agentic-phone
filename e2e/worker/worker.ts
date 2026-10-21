// Dry-run proof that `agentic-phone/adapters` bundles for Cloudflare Workers.
// Run after `npm run build` at the repo root:
//   npm --prefix e2e/worker install   # links agentic-phone via file:
//   bunx wrangler deploy --dry-run --config e2e/worker/wrangler.jsonc
import {
  DryPhoneAdapter,
  TelnyxPhoneAdapter,
} from "agentic-phone/adapters";

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/dry") {
      const placed = await new DryPhoneAdapter().placeCall({
        to: "+12025550123",
        script: "Reminder",
        disclosure: "I am an AI assistant.",
      });
      return Response.json(placed);
    }
    const adapter = new TelnyxPhoneAdapter({ apiKey: "unused-in-dry-run" });
    return Response.json({ name: adapter.name });
  },
};
