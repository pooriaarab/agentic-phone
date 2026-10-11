import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  createLogger,
  getCostReport,
  GuardError,
  VendorError,
  type Guards,
  type Logger,
} from "agentic-core";
import { placeCall } from "./phone.js";
import { readConsentLog } from "./consent.js";
import { DEFAULT_BRAND } from "./index.js";
export interface McpDeps {
  guards?: Guards;
  logger?: Logger;
  now?: () => Date;
  fetchFn?: typeof fetch;
}
const result = (value: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value) }],
});
export function createMcpServer(deps: McpDeps = {}): McpServer {
  const server = new McpServer({
    name: DEFAULT_BRAND.command,
    version: DEFAULT_BRAND.version,
  });
  server.registerTool(
    "place_call",
    {
      description: "Preview an AI voice call. Set live true to place it.",
      inputSchema: {
        vendor: z.enum(["dry", "vapi", "bland", "retell"]).default("dry"),
        to: z.string(),
        script: z.string(),
        disclosure: z.string(),
        live: z.boolean().default(false),
        from: z.string().optional(),
        assistantId: z.string().optional(),
        phoneNumberId: z.string().optional(),
        agentId: z.string().optional(),
        voice: z.string().optional(),
        logFile: z.string().nullable().optional(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (input) => {
      try {
        return result(
          await placeCall({
            ...input,
            ...deps,
            logger: deps.logger ?? createLogger({ quiet: true }),
          }),
        );
      } catch (error) {
        if (error instanceof GuardError || error instanceof VendorError)
          return { ...result({ error: error.message }), isError: true };
        throw error;
      }
    },
  );
  server.registerTool(
    "get_consent_log",
    {
      description: "Read the consent log.",
      inputSchema: { logFile: z.string().optional() },
      annotations: { readOnlyHint: true },
    },
    async ({ logFile }) => result(await readConsentLog(logFile)),
  );
  server.registerTool(
    "get_cost_report",
    {
      description: "Read session cost totals.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => result(getCostReport()),
  );
  return server;
}
export async function startMcp(deps: McpDeps = {}): Promise<void> {
  await createMcpServer(deps).connect(new StdioServerTransport());
}
