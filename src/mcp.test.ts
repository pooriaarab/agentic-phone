import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { expect, test } from "vitest";
import { createMcpServer } from "./mcp.js";
test("real client tools and mapped guard error", async () => {
  const [ct, st] = InMemoryTransport.createLinkedPair();
  const server = createMcpServer({
    now: () => new Date("2026-10-11T10:00:00Z"),
  });
  const client = new Client({ name: "probe", version: "1" });
  await server.connect(st);
  await client.connect(ct);
  try {
    const tools = (await client.listTools()).tools;
    expect(tools.map((t) => t.name).sort()).toEqual([
      "get_consent_log",
      "get_cost_report",
      "place_call",
    ]);
    expect(
      tools.find((t) => t.name === "place_call")?.annotations,
    ).toMatchObject({
      openWorldHint: true,
      readOnlyHint: false,
      idempotentHint: false,
      destructiveHint: false,
    });
    const arguments_ = {
      to: "+12025550123",
      script: "Hello",
      disclosure: "I am AI.",
    };
    const preview = await client.callTool({
      name: "place_call",
      arguments: arguments_,
    });
    expect(
      JSON.parse((preview.content as { text: string }[])[0].text),
    ).toMatchObject({ dryRun: true });
    expect(
      (
        await client.callTool({
          name: "place_call",
          arguments: { ...arguments_, disclosure: " " },
        })
      ).isError,
    ).toBe(true);
    for (const name of ["get_cost_report", "get_consent_log"])
      expect(
        (
          await client.callTool({
            name,
            arguments:
              name === "get_consent_log"
                ? { logFile: "/tmp/absent-phone-log" }
                : {},
          })
        ).isError,
      ).not.toBe(true);
  } finally {
    await client.close();
    await server.close();
  }
});
