import { postCall } from "./http.js";
import type {
  AdapterOptions,
  CallAdapter,
  CallInput,
  AdapterContext,
} from "./types.js";
export class BlandAdapter implements CallAdapter {
  readonly name = "bland" as const;
  constructor(private options: AdapterOptions = {}) {}
  async place(input: CallInput, ctx: AdapterContext = {}): Promise<string> {
    return postCall(
      this.name,
      "https://api.bland.ai/v1/calls",
      this.options.apiKey ?? process.env.BLAND_API_KEY,
      {
        phone_number: input.to,
        task: input.script,
        voice: input.voice,
        from: input.from,
        record: true,
      },
      "call_id",
      ctx,
    );
  }
}
