import { VendorError } from "agentic-core";
import { postCall } from "./http.js";
import { telnyxDialBody } from "./telnyx-body.js";
import type {
  AdapterOptions,
  CallAdapter,
  CallInput,
  AdapterContext,
} from "./types.js";
export class TelnyxAdapter implements CallAdapter {
  readonly name = "telnyx" as const;
  constructor(private options: AdapterOptions = {}) {}
  async place(input: CallInput, ctx: AdapterContext = {}): Promise<string> {
    if (!input.from || !input.connectionId || !input.assistantId)
      throw new VendorError(
        "telnyx: from, connectionId, and assistantId are required",
      );
    // The dial request attaches a stored AI assistant, so the script and the
    // disclosure reach the conversation. call_control_id drives later commands.
    return postCall(
      this.name,
      "https://api.telnyx.com/v2/calls",
      this.options.apiKey ?? process.env.TELNYX_API_KEY,
      telnyxDialBody(input),
      "data.call_control_id",
      ctx,
    );
  }
}
