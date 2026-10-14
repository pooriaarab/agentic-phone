import { createRequire } from "node:module";
import { afterEach, expect, test, vi } from "vitest";
import worker from "./worker.js";
import { VERSION } from "./version.js";
afterEach(() => vi.useRealTimers());
test("health and version", async () => {
  const require = createRequire(import.meta.url);
  expect(VERSION).toBe(
    (require("../package.json") as { version: string }).version,
  );
  expect(
    await (await worker.fetch(new Request("https://phone/health"))).json(),
  ).toEqual({ ok: true, pack: "agentic-phone", version: VERSION });
});
test("preview forces dry and rejects bad input", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-11T10:00:00Z"));
  const response = await worker.fetch(
    new Request("https://phone/preview", {
      method: "POST",
      body: JSON.stringify({
        to: "+12025550123",
        script: "Hello",
        disclosure: "AI",
        live: true,
        vendor: "bland",
      }),
    }),
  );
  expect(await response.json()).toMatchObject({ dryRun: true, vendor: "dry" });
  for (const body of [
    "bad",
    "{}",
    "null",
    JSON.stringify({ to: "bad", script: "Hello", disclosure: "AI" }),
  ])
    expect(
      (
        await worker.fetch(
          new Request("https://phone/preview", { method: "POST", body }),
        )
      ).status,
    ).toBe(400);
});
test("404", async () => {
  expect((await worker.fetch(new Request("https://phone/other"))).status).toBe(
    404,
  );
});
