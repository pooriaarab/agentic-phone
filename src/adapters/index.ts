import { telnyxDialBody } from "./telnyx-body.js";
import type { CallInput, CallVendor } from "./types.js";

// Workers-safe adapter surface for `agentic-phone/adapters`: plain fetch, no
// filesystem, no node builtins, no process.env reads. Keys always arrive as
// AdapterOptions.apiKey. AdapterError mirrors the agentic-core VendorError
// shape (`code: "VENDOR_FAILED"`, optional `status`) but is defined here so
// this entry needs no dependency.
export class AdapterError extends Error {
  readonly code = "VENDOR_FAILED" as const;
  readonly status?: number;
  constructor(message: string, options: { status?: number; cause?: unknown } = {}) {
    super(message, { cause: options.cause });
    this.name = "AdapterError";
    this.status = options.status;
  }
}

export interface AdapterOptions {
  apiKey?: string;
  // Provider API origin override for tests and fakes; production callers leave
  // it unset.
  baseUrl?: string;
  fetchFn?: typeof fetch;
}

export interface PlacedCall {
  providerCallId: string;
  status: "ringing";
  callLegId?: string;
  callSessionId?: string;
  recordingId?: string;
  costCents?: number;
  currency?: string;
}
export interface CallTranscript {
  text: string | null;
  audioUrl: string | null;
}
export type LiveJoinResult =
  | { status: "joined" }
  | { status: "unsupported"; reason: string };
export interface CallCost {
  costCents: number;
  currency: string;
}
export interface TranscriptOptions {
  callLegId?: string;
}
export interface LiveJoinOptions {
  supervisorCallControlId?: string;
}
export interface CallCostOptions {
  callLegId?: string;
  callSessionId?: string;
  to?: string;
}

export interface PhoneAdapter {
  readonly name: CallVendor;
  placeCall(input: CallInput): Promise<PlacedCall>;
  transcript(
    providerCallId: string,
    opts?: TranscriptOptions,
  ): Promise<CallTranscript | null>;
  liveJoin(
    providerCallId: string,
    opts?: LiveJoinOptions,
  ): Promise<LiveJoinResult>;
  callCost(
    providerCallId: string,
    opts?: CallCostOptions,
  ): Promise<CallCost | null>;
}

const E164 = /^\+[1-9]\d{6,14}$/;
const str = (v: unknown): string | null =>
  typeof v === "string" && v ? v : null;
const cents = (v: unknown): number | undefined => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : undefined;
};

function requireCallFields(name: string, input: CallInput): void {
  if (!input.disclosure?.trim())
    throw new AdapterError(`${name}: an AI disclosure line is required`);
  if (!E164.test(input.to))
    throw new AdapterError(`${name}: to must use E.164 format`);
  if (!input.script?.trim())
    throw new AdapterError(`${name}: script is required`);
}

abstract class HttpAdapter {
  abstract readonly name: string;
  protected abstract readonly base: string;
  constructor(protected opts: AdapterOptions) {}
  protected key(): string {
    const key = this.opts.apiKey?.trim();
    if (!key) throw new AdapterError(`${this.name}: missing API key`);
    return key;
  }
  protected async call(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<Record<string, unknown>> {
    const init: RequestInit = {
      method,
      headers: { Authorization: `Bearer ${this.key()}` },
      signal: AbortSignal.timeout(10_000),
    };
    if (body !== undefined) {
      (init.headers as Record<string, string>)["Content-Type"] =
        "application/json";
      init.body = JSON.stringify(body);
    }
    let response: Response;
    try {
      response = await (this.opts.fetchFn ?? globalThis.fetch)(
        `${this.opts.baseUrl ?? this.base}${path}`,
        init,
      );
    } catch (cause) {
      throw new AdapterError(`${this.name}: network error`, { cause });
    }
    if (!response.ok)
      throw new AdapterError(`${this.name}: HTTP ${response.status}`, {
        status: response.status,
      });
    try {
      return (await response.json()) as Record<string, unknown>;
    } catch (cause) {
      throw new AdapterError(`${this.name}: invalid response`, { cause });
    }
  }
}

const unsupported = (name: string, action: string): LiveJoinResult => ({
  status: "unsupported",
  reason: `${name}: no ${action} action`,
});

export class DryPhoneAdapter implements PhoneAdapter {
  readonly name = "dry" as const;
  async placeCall(input: CallInput): Promise<PlacedCall> {
    requireCallFields(this.name, input);
    return { providerCallId: `dry-${crypto.randomUUID()}`, status: "ringing" };
  }
  async transcript(): Promise<CallTranscript | null> {
    return null;
  }
  async liveJoin(): Promise<LiveJoinResult> {
    return unsupported(this.name, "live join");
  }
  async callCost(): Promise<CallCost | null> {
    return null;
  }
}

export class VapiPhoneAdapter extends HttpAdapter implements PhoneAdapter {
  readonly name = "vapi" as const;
  protected base = "https://api.vapi.ai";
  async placeCall(input: CallInput): Promise<PlacedCall> {
    requireCallFields(this.name, input);
    if (!input.assistantId || !input.phoneNumberId)
      throw new AdapterError(
        "vapi: assistantId and phoneNumberId are required",
      );
    const data = await this.call("POST", "/call", {
      assistantId: input.assistantId,
      phoneNumberId: input.phoneNumberId,
      customer: { number: input.to },
    });
    const providerCallId = str(data.id);
    if (!providerCallId)
      throw new AdapterError("vapi: response has no id");
    return { providerCallId, status: "ringing" };
  }
  async transcript(): Promise<CallTranscript | null> {
    return null;
  }
  async liveJoin(): Promise<LiveJoinResult> {
    return unsupported(this.name, "live join");
  }
  async callCost(): Promise<CallCost | null> {
    return null;
  }
}

export class BlandPhoneAdapter extends HttpAdapter implements PhoneAdapter {
  readonly name = "bland" as const;
  protected base = "https://api.bland.ai";
  async placeCall(input: CallInput): Promise<PlacedCall> {
    requireCallFields(this.name, input);
    const data = await this.call("POST", "/v1/calls", {
      phone_number: input.to,
      task: `${input.disclosure}\n${input.script}`,
      voice: input.voice,
      from: input.from,
      record: true,
    });
    const providerCallId = str(data.call_id);
    if (!providerCallId)
      throw new AdapterError("bland: response has no id");
    const costCents = cents(data.cost);
    return {
      providerCallId,
      status: "ringing",
      costCents,
      currency: costCents != null ? (str(data.currency) ?? "USD") : undefined,
    };
  }
  async transcript(): Promise<CallTranscript | null> {
    return null;
  }
  async liveJoin(): Promise<LiveJoinResult> {
    return unsupported(this.name, "live join");
  }
  async callCost(): Promise<CallCost | null> {
    return null;
  }
}

export class RetellPhoneAdapter extends HttpAdapter implements PhoneAdapter {
  readonly name = "retell" as const;
  protected base = "https://api.retellai.com";
  async placeCall(input: CallInput): Promise<PlacedCall> {
    requireCallFields(this.name, input);
    if (!input.from) throw new AdapterError("retell: from is required");
    const data = await this.call("POST", "/v2/create-phone-call", {
      from_number: input.from,
      to_number: input.to,
      override_agent_id: input.agentId,
      metadata: { disclosure: input.disclosure },
    });
    const providerCallId = str(data.call_id);
    if (!providerCallId)
      throw new AdapterError("retell: response has no id");
    return { providerCallId, status: "ringing" };
  }
  async transcript(): Promise<CallTranscript | null> {
    return null;
  }
  async liveJoin(): Promise<LiveJoinResult> {
    return unsupported(this.name, "live join");
  }
  async callCost(): Promise<CallCost | null> {
    return null;
  }
}

// Starts a Telnyx AI-assistant call: dial + assistant overrides in one
// Call Control request, so script, disclosure, and voice reach the
// conversation. `assistantId` names the stored assistant that supplies model,
// tools, and transcription defaults.
export class TelnyxPhoneAdapter extends HttpAdapter implements PhoneAdapter {
  readonly name = "telnyx" as const;
  protected base = "https://api.telnyx.com";
  async placeCall(input: CallInput): Promise<PlacedCall> {
    requireCallFields(this.name, input);
    if (!input.from || !input.connectionId || !input.assistantId)
      throw new AdapterError(
        "telnyx: from, connectionId, and assistantId are required",
      );
    const data = await this.call("POST", "/v2/calls", telnyxDialBody(input));
    const inner = (data.data ?? {}) as Record<string, unknown>;
    const providerCallId = str(inner.call_control_id);
    if (!providerCallId)
      throw new AdapterError("telnyx: response has no id");
    return {
      providerCallId,
      status: "ringing",
      callLegId: str(inner.call_leg_id) ?? undefined,
      callSessionId: str(inner.call_session_id) ?? undefined,
      recordingId: str(inner.recording_id) ?? undefined,
    };
  }
  // The conversation id arrives on the call.conversation.created webhook; the
  // list endpoint accepts a metadata->call_control_id filter so a poller can
  // find it without a webhook. Messages join into one transcript text.
  async transcript(
    providerCallId: string,
    opts: TranscriptOptions = {},
  ): Promise<CallTranscript | null> {
    const conversationId = await this.conversationId(providerCallId);
    if (!conversationId) return null;
    const params = new URLSearchParams({ "page[size]": "100" });
    const data = await this.call(
      "GET",
      `/v2/ai/conversations/${encodeURIComponent(conversationId)}/messages?${params}`,
    );
    const messages = Array.isArray(data.data) ? data.data : [];
    const lines = messages
      .map((m) => {
        const row = m as Record<string, unknown>;
        return str(row.text) ? `${str(row.role) ?? "unknown"}: ${row.text}` : null;
      })
      .filter((l): l is string => l !== null);
    return { text: lines.length ? lines.join("\n") : null, audioUrl: await this.audioUrl(opts.callLegId) };
  }
  // Telnyx has no single-call "barge in": joining is bridging two existing
  // call legs, so the supervisor leg must be placed first.
  async liveJoin(
    providerCallId: string,
    opts: LiveJoinOptions = {},
  ): Promise<LiveJoinResult> {
    if (!opts.supervisorCallControlId)
      return unsupported(
        this.name,
        "live join without a supervisor call_control_id to bridge",
      );
    await this.call(
      "POST",
      `/v2/calls/${encodeURIComponent(providerCallId)}/actions/bridge`,
      { call_control_id: opts.supervisorCallControlId },
    );
    return { status: "joined" };
  }
  // Sums the call-control CDR and the ai-voice-assistant CDR. Both post after
  // the call through Telnyx billing; until then the result is null.
  async callCost(
    providerCallId: string,
    opts: CallCostOptions = {},
  ): Promise<CallCost | null> {
    let costCents = 0;
    let currency: string | null = null;
    if (opts.callLegId || opts.callSessionId) {
      const params = new URLSearchParams({
        "filter[record_type]": "call-control",
        "filter[date_range]": "last_7_days",
      });
      if (opts.to) params.set("filter[cld]", opts.to);
      const data = await this.call("GET", `/v2/detail_records?${params}`);
      for (const rec of (data.data ?? []) as Record<string, unknown>[]) {
        if (
          str(rec.call_leg_id) !== opts.callLegId &&
          str(rec.call_session_id) !== opts.callSessionId
        )
          continue;
        const c = cents(rec.cost);
        if (c != null) costCents += c;
        currency = currency ?? str(rec.currency);
      }
    }
    const conversationId = await this.conversationId(providerCallId);
    if (conversationId) {
      const params = new URLSearchParams({
        "filter[record_type]": "ai-voice-assistant",
        "filter[conversation_id]": conversationId,
      });
      const data = await this.call("GET", `/v2/detail_records?${params}`);
      for (const rec of (data.data ?? []) as Record<string, unknown>[]) {
        const c = cents(rec.cost);
        if (c != null) costCents += c;
        currency = currency ?? str(rec.currency);
      }
    }
    return currency === null && costCents === 0
      ? null
      : { costCents, currency: currency ?? "USD" };
  }
  private async conversationId(
    providerCallId: string,
  ): Promise<string | null> {
    const params = new URLSearchParams({
      "metadata->call_control_id": `eq.${providerCallId}`,
      limit: "1",
    });
    const data = await this.call("GET", `/v2/ai/conversations?${params}`);
    const first = ((data.data ?? []) as Record<string, unknown>[])[0];
    return str(first?.id);
  }
  private async audioUrl(callLegId?: string): Promise<string | null> {
    if (!callLegId) return null;
    const params = new URLSearchParams({
      "filter[call_leg_id]": callLegId,
      "page[size]": "1",
    });
    const data = await this.call("GET", `/v2/recordings?${params}`);
    const first = ((data.data ?? []) as Record<string, unknown>[])[0];
    const urls = first?.download_urls as Record<string, unknown> | undefined;
    return str(urls?.mp3) ?? str(urls?.wav) ?? str(first?.download_url);
  }
}
