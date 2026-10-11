import { createLogger, GuardError, VendorError } from "agentic-core";
import { placeCall, type CallRequest } from "./phone.js";
import { VERSION } from "./version.js";
export default {
  async fetch(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (request.method === "GET" && path === "/health")
      return Response.json({
        ok: true,
        pack: "agentic-phone",
        version: VERSION,
      });
    if (request.method === "POST" && path === "/preview") {
      let body: CallRequest;
      try {
        body = (await request.json()) as CallRequest;
        if (
          !body ||
          typeof body !== "object" ||
          !body.to ||
          !body.script ||
          !body.disclosure
        )
          return Response.json(
            { error: "to, script, and disclosure are required" },
            { status: 400 },
          );
      } catch {
        return Response.json({ error: "Invalid JSON" }, { status: 400 });
      }
      try {
        return Response.json(
          await placeCall({
            to: body.to,
            script: body.script,
            disclosure: body.disclosure,
            vendor: "dry",
            live: false,
            logger: createLogger({ quiet: true }),
          }),
        );
      } catch (error) {
        if (error instanceof GuardError || error instanceof VendorError)
          return Response.json({ error: error.message }, { status: 400 });
        throw error;
      }
    }
    return Response.json({ error: "Not found" }, { status: 404 });
  },
};
