import { VendorError } from "agentic-core";
import { postCall } from "./http.js";
import type {
  AdapterOptions,
  CallAdapter,
  CallInput,
  AdapterContext,
} from "./types.js";
export class RetellAdapter implements CallAdapter {
  readonly name = "retell" as const;
  constructor(private options: AdapterOptions = {}) {}
  async place(input: CallInput, ctx: AdapterContext = {}): Promise<string> {
    if (!input.from) throw new VendorError("retell: from is required");
    return postCall(
      this.name,
      "https://api.retellai.com/v2/create-phone-call",
      this.options.apiKey ?? process.env.RETELL_API_KEY,
      {
        from_number: input.from,
        to_number: input.to,
        override_agent_id: input.agentId,
        metadata: { disclosure: input.disclosure },
      },
      "call_id",
      ctx,
    );
  }
}
