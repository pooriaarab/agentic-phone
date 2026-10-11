import {
  createGuards,
  createLogger,
  GuardError,
  recordCost,
  VendorError,
  type Guards,
  type GuardsConfig,
  type Logger,
} from "agentic-core";
import { BlandAdapter } from "./adapters/bland.js";
import { DryAdapter } from "./adapters/dry.js";
import { RetellAdapter } from "./adapters/retell.js";
import { TelnyxAdapter } from "./adapters/telnyx.js";
import { VapiAdapter } from "./adapters/vapi.js";
import type {
  AdapterOptions,
  CallAdapter,
  CallInput,
  CallVendor,
} from "./adapters/types.js";
import { appendConsentLog, defaultConsentPath } from "./consent.js";

export interface CallRequest extends CallInput {
  vendor?: CallVendor;
  live?: boolean;
  apiKey?: string;
  logFile?: string | null;
  guards?: Guards;
  logger?: Logger;
  fetchFn?: typeof fetch;
  now?: () => Date;
}

export interface CallReceipt {
  vendor: CallVendor;
  callId: string;
  to: string;
  at: string;
  dryRun: boolean;
  disclosure: string;
}

export function createCallGuards(options: GuardsConfig = {}): Guards {
  return createGuards({
    ...options,
    quietHours: options.quietHours ?? { startHour: 20, endHour: 8 },
  });
}

const E164_PATTERN = /^\+[1-9]\d{6,14}$/;

export async function placeCall(req: CallRequest): Promise<CallReceipt> {
  if (
    typeof req.disclosure !== "string" ||
    req.disclosure.trim().length === 0
  ) {
    throw new GuardError("An AI disclosure line is required");
  }
  if (!E164_PATTERN.test(req.to)) {
    throw new VendorError("to must use E.164 format");
  }
  if (typeof req.script !== "string" || req.script.trim().length === 0) {
    throw new VendorError("script is required");
  }
  const vendor = req.vendor ?? "dry";
  const adapterOptions: AdapterOptions = req.apiKey
    ? { apiKey: req.apiKey }
    : {};
  const adapters: Record<CallVendor, CallAdapter> = {
    dry: new DryAdapter(),
    vapi: new VapiAdapter(adapterOptions),
    bland: new BlandAdapter(adapterOptions),
    retell: new RetellAdapter(adapterOptions),
    telnyx: new TelnyxAdapter(adapterOptions),
  };
  if (!Object.hasOwn(adapters, vendor)) {
    throw new VendorError("Unknown call vendor");
  }
  const guards = req.guards ?? createCallGuards({ now: req.now });
  guards.checkDispatch(req.script);
  const logger = req.logger ?? createLogger();
  const dryRun = req.live !== true || vendor === "dry";
  const input =
    vendor === "bland" && !dryRun
      ? { ...req, script: `${req.disclosure}\n${req.script}` }
      : req;
  const callId = await (dryRun ? adapters.dry : adapters[vendor]).place(input, {
    fetchFn: req.fetchFn,
    logger,
  });
  const receipt: CallReceipt = {
    vendor,
    callId,
    to: req.to,
    at: (req.now?.() ?? new Date()).toISOString(),
    dryRun,
    disclosure: req.disclosure,
  };
  if (dryRun) {
    logger.info(`Preview call to ${req.to}`);
    return receipt;
  }
  guards.recordDispatch();
  recordCost({ kind: "dispatch", adapter: vendor, units: 1 });
  if (req.logFile !== null) {
    await appendConsentLog(req.logFile ?? defaultConsentPath(), {
      at: receipt.at,
      to: receipt.to,
      vendor,
      callId,
      disclosure: receipt.disclosure,
    });
  }
  return receipt;
}
