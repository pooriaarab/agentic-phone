import { defineBrand } from "agentic-core";
import { VERSION } from "./version.js";
export { VERSION };
export const DEFAULT_BRAND = defineBrand({
  name: "Agentic phone",
  command: "agentic-phone",
  description: "Place AI voice calls across vendors from CLI, SDK, or MCP.",
  keywords: [
    "ai-calls",
    "voice-agents",
    "vapi",
    "agentic-suite",
    "claude-code",
    "codex",
    "cli",
    "mcp",
  ],
  version: VERSION,
});
export * from "./phone.js";
export * from "./consent.js";
export * from "./adapters/types.js";
export * from "./adapters/vapi.js";
export * from "./adapters/bland.js";
export * from "./adapters/retell.js";
export * from "./adapters/dry.js";
export {
  createLogger,
  GuardError,
  VendorError,
  getCostReport,
  resetCosts,
} from "agentic-core";
export type {
  BrandConfig,
  Logger,
  LoggerOptions,
  LogLevel,
  Guards,
  GuardsConfig,
  CapsConfig,
  QuietHoursConfig,
  CostEntry,
  CostReport,
} from "agentic-core";
