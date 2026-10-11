import { VendorError } from "agentic-core";
import { postCall } from "./http.js";
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
    if (!input.from || !input.connectionId)
      throw new VendorError("telnyx: from and connectionId are required");
    // Dial request follows the Telnyx Call Control API.
    // The call_control_id drives later commands for this call.
    return postCall(
      this.name,
      "https://api.telnyx.com/v2/calls",
      this.options.apiKey ?? process.env.TELNYX_API_KEY,
      {
        connection_id: input.connectionId,
        to: input.to,
        from: input.from,
      },
      "data.call_control_id",
      ctx,
    );
  }
}
