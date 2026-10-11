#!/usr/bin/env node
import { readFileSync, realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import {
  createLogger,
  getCostReport,
  GuardError,
  VendorError,
} from "agentic-core";
import { placeCall, type CallRequest } from "./phone.js";
import { provisionTelnyxNumber } from "./numbers.js";
import { readConsentLog } from "./consent.js";
import { VERSION } from "./version.js";
export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UsageError";
  }
}
export interface CliRequest extends Partial<CallRequest> {
  command: "call" | "provision" | "log" | "costs" | "mcp" | "help" | "version";
  file?: string;
  number?: string;
  customerReference?: string;
  messagingProfileId?: string;
  billingGroupId?: string;
}
const flags = {
  "--vendor": "vendor",
  "--to": "to",
  "--script": "script",
  "--file": "file",
  "--disclosure": "disclosure",
  "--from": "from",
  "--assistant": "assistantId",
  "--phone-number-id": "phoneNumberId",
  "--agent": "agentId",
  "--voice": "voice",
  "--connection-id": "connectionId",
  "--number": "number",
  "--customer-reference": "customerReference",
  "--messaging-profile-id": "messagingProfileId",
  "--billing-group-id": "billingGroupId",
  "--log-file": "logFile",
} as const;
const provisionFlags = new Set([
  "--number",
  "--connection-id",
  "--customer-reference",
  "--messaging-profile-id",
  "--billing-group-id",
]);
export function parseArgs(argv: string[]): CliRequest {
  const args = [...argv];
  const first = args.shift() ?? "help";
  const command =
    first === "--help" || first === "-h"
      ? "help"
      : first === "--version" || first === "-V"
        ? "version"
        : first;
  if (
    !["call", "provision", "log", "costs", "mcp", "help", "version"].includes(
      command,
    )
  )
    throw new UsageError(`unknown command "${first}"`);
  const req: CliRequest = {
    command: command as CliRequest["command"],
    vendor: "dry",
    live: false,
  };
  while (args.length) {
    const flag = args.shift()!;
    if (flag === "--live" && (command === "call" || command === "provision")) {
      req.live = true;
      continue;
    }
    if (
      !(flag in flags) ||
      (command === "log" && flag !== "--log-file") ||
      (command === "provision" && !provisionFlags.has(flag)) ||
      (command !== "call" && command !== "log" && command !== "provision")
    )
      throw new UsageError(`unknown flag "${flag}"`);
    const value = args.shift();
    if (!value || value.startsWith("--"))
      throw new UsageError(`${flag} needs a value`);
    Object.assign(req, { [flags[flag as keyof typeof flags]]: value });
  }
  if (!["dry", "vapi", "bland", "retell", "telnyx"].includes(req.vendor!))
    throw new UsageError("invalid vendor");
  if (command === "call") {
    if (!req.to || !req.disclosure || (!req.script && !req.file))
      throw new UsageError(
        "call needs --to, --disclosure, and --script or --file",
      );
    if (req.script && req.file)
      throw new UsageError("use one of --script or --file");
  }
  if (command === "provision") {
    if (!req.number) throw new UsageError("provision needs --number");
  }
  return req;
}
export interface CliIo {
  out(line: string): void;
  err(line: string): void;
  readFile(path: string): string;
  now?: () => Date;
  fetchFn?: typeof fetch;
}
const defaultIo: CliIo = {
  out: (line) => console.log(line),
  err: (line) => console.error(line),
  readFile: (path) => readFileSync(path, "utf8"),
};
export function helpText(): string {
  return `Agentic phone ${VERSION}\nPlace AI voice calls across vendors from CLI, SDK, or MCP.\n\nUsage: agentic-phone <command> [flags]\nCommands: call, provision, log, costs, mcp, help, version\ncall --to <E.164> --script <text> | --file <path> --disclosure <line>\n  --vendor <dry|vapi|bland|retell|telnyx> --live --from <number>\n  --assistant <id> --phone-number-id <id> --agent <id> --voice <name>\n  --connection-id <id> --log-file <path>\nprovision --number <E.164> [--live] [--connection-id <id>]\n  [--customer-reference <ref>] [--messaging-profile-id <id>]\n  [--billing-group-id <id>]\nlog [--log-file <path>]\ncosts: Print session cost JSON.\nmcp: Start MCP on stdio.\n--help, -h: Print help.\n--version, -V: Print version.`;
}
export async function runCli(
  argv: string[],
  io: CliIo = defaultIo,
): Promise<number> {
  let req: CliRequest;
  try {
    req = parseArgs(argv);
  } catch (error) {
    io.err(
      `UsageError: ${error instanceof Error ? error.message : String(error)}`,
    );
    return 2;
  }
  try {
    switch (req.command) {
      case "help":
        io.out(helpText());
        break;
      case "version":
        io.out(VERSION);
        break;
      case "costs":
        io.out(JSON.stringify(getCostReport()));
        break;
      case "log":
        io.out(JSON.stringify(await readConsentLog(req.logFile ?? undefined)));
        break;
      case "mcp":
        await (await import("./mcp.js")).startMcp();
        break;
      case "provision":
        io.out(
          JSON.stringify(
            await provisionTelnyxNumber({
              numbers: [req.number!],
              connectionId: req.connectionId,
              customerReference: req.customerReference,
              messagingProfileId: req.messagingProfileId,
              billingGroupId: req.billingGroupId,
              live: req.live,
              logger: createLogger({ quiet: true }),
              now: io.now,
              fetchFn: io.fetchFn,
            }),
          ),
        );
        break;
      case "call":
        io.out(
          JSON.stringify(
            await placeCall({
              ...req,
              to: req.to!,
              disclosure: req.disclosure!,
              script: req.file ? io.readFile(req.file) : req.script!,
              logger: createLogger({ quiet: true }),
              now: io.now,
              fetchFn: io.fetchFn,
            }),
          ),
        );
        break;
    }
    return 0;
  } catch (error) {
    if (
      error instanceof GuardError ||
      error instanceof VendorError ||
      (error instanceof Error && "code" in error && error.code === "ENOENT")
    ) {
      io.err(`${error.name}: ${error.message}`);
      return 1;
    }
    throw error;
  }
}
function isMainModule(): boolean {
  const invoked = process.argv[1];
  if (typeof invoked !== "string") return false;
  try {
    return import.meta.url === pathToFileURL(realpathSync(invoked)).href;
  } catch {
    return false;
  }
}
if (isMainModule())
  runCli(process.argv.slice(2)).then(
    (code) => {
      if (code !== 0) process.exit(code);
    },
    (error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    },
  );
