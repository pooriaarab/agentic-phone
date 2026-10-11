import { VendorError } from "agentic-core";
import { postCall } from "./http.js";
import type {
  AdapterOptions,
  CallAdapter,
  CallInput,
  AdapterContext,
} from "./types.js";
export class VapiAdapter implements CallAdapter {
  readonly name = "vapi" as const;
  constructor(private options: AdapterOptions = {}) {}
  async place(input: CallInput, ctx: AdapterContext = {}): Promise<string> {
    if (!input.assistantId || !input.phoneNumberId)
      throw new VendorError("vapi: assistantId and phoneNumberId are required");
    // phoneNumberId may point at a Twilio-imported number.
    return postCall(
      this.name,
      "https://api.vapi.ai/call",
      this.options.apiKey ?? process.env.VAPI_API_KEY,
      {
        assistantId: input.assistantId,
        phoneNumberId: input.phoneNumberId,
        customer: { number: input.to },
      },
      "id",
      ctx,
    );
  }
}
