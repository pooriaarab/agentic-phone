import type { Logger } from "agentic-core";
export type CallVendor = "dry" | "vapi" | "bland" | "retell";
export interface CallInput {
  to: string;
  script: string;
  disclosure: string;
  from?: string;
  assistantId?: string;
  phoneNumberId?: string;
  agentId?: string;
  voice?: string;
}
export interface AdapterContext {
  fetchFn?: typeof fetch;
  logger?: Logger;
}
export interface CallAdapter {
  readonly name: CallVendor;
  place(input: CallInput, ctx: AdapterContext): Promise<string>;
}
export interface AdapterOptions {
  apiKey?: string;
}
