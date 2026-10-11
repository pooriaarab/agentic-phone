import { randomUUID } from "node:crypto";
import type { CallAdapter, CallInput, AdapterContext } from "./types.js";
export class DryAdapter implements CallAdapter {
  readonly name = "dry" as const;
  async place(_input: CallInput, _ctx: AdapterContext = {}): Promise<string> {
    return `dry-${randomUUID()}`;
  }
}
