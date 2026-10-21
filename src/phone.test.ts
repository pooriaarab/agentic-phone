import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { createLogger, getCostReport, resetCosts } from "agentic-core";
import { placeCall, createCallGuards } from "./phone.js";
import { appendConsentLog, readConsentLog } from "./consent.js";
import dialFixture from "./adapters/fixtures/telnyx-dial.json" with {
  type: "json",
};
const now = () => new Date("2026-10-11T10:00:00Z");
const req = {
  to: "+12025550123",
  script: "Appointment reminder",
  disclosure: "I am an AI assistant.",
  now,
  logger: createLogger({ quiet: true }),
};
afterEach(() => {
  resetCosts();
  vi.unstubAllEnvs();
});
test("default preview has no network, cost, dispatch count, or log", async () => {
  const fetchFn = vi.fn();
  const guards = createCallGuards({ now });
  const dir = await mkdtemp(join(tmpdir(), "phone-"));
  try {
    const logFile = join(dir, "log");
    expect(await placeCall({ ...req, fetchFn, guards, logFile })).toMatchObject(
      { dryRun: true, vendor: "dry", at: now().toISOString() },
    );
    expect(fetchFn).not.toHaveBeenCalled();
    expect(guards.dispatchCount).toBe(0);
    expect(getCostReport().units).toBe(0);
    expect(await readConsentLog(logFile)).toEqual([]);
  } finally {
    await rm(dir, { recursive: true });
  }
});
test("vendor preview needs no key and dry vendor stays preview with live", async () => {
  const fetchFn = vi.fn();
  for (const options of [
    { vendor: "vapi" as const },
    { vendor: "dry" as const, live: true },
  ])
    expect((await placeCall({ ...req, ...options, fetchFn })).dryRun).toBe(
      true,
    );
  expect(fetchFn).not.toHaveBeenCalled();
});
test("rejects E.164 and blank disclosure", async () => {
  await expect(placeCall({ ...req, to: "2025550123" })).rejects.toThrow(
    "E.164",
  );
  await expect(placeCall({ ...req, disclosure: "  " })).rejects.toThrow(
    "AI disclosure line",
  );
});
test("day hours and boundaries", async () => {
  for (const hour of [8, 10, 19])
    expect(
      (
        await placeCall({
          ...req,
          now: () =>
            new Date(`2026-10-11T${String(hour).padStart(2, "0")}:00:00Z`),
        })
      ).dryRun,
    ).toBe(true);
  for (const hour of [7, 20, 22])
    await expect(
      placeCall({
        ...req,
        now: () =>
          new Date(`2026-10-11T${hour.toString().padStart(2, "0")}:00:00Z`),
      }),
    ).rejects.toThrow();
});
test("caps and blocklist", async () => {
  const guards = createCallGuards({ now, caps: { maxDispatches: 1 } });
  guards.recordDispatch();
  await expect(placeCall({ ...req, guards })).rejects.toThrow();
  await expect(
    placeCall({
      ...req,
      guards: createCallGuards({ now, blocklist: ["reminder"] }),
    }),
  ).rejects.toThrow();
});
test("live records one cost and consent after dispatch", async () => {
  vi.stubEnv("BLAND_API_KEY", "key");
  const dir = await mkdtemp(join(tmpdir(), "phone-"));
  const logFile = join(dir, "log");
  const guards = createCallGuards({ now });
  try {
    const receipt = await placeCall({
      ...req,
      vendor: "bland",
      live: true,
      guards,
      logFile,
      fetchFn: vi.fn().mockResolvedValue(Response.json({ call_id: "live-1" })),
    });
    expect(receipt.dryRun).toBe(false);
    expect(guards.dispatchCount).toBe(1);
    expect(getCostReport().units).toBe(1);
    expect(await readConsentLog(logFile)).toEqual([
      {
        at: receipt.at,
        to: receipt.to,
        vendor: receipt.vendor,
        callId: receipt.callId,
        disclosure: receipt.disclosure,
      },
    ]);
    await appendConsentLog(logFile, receipt);
    expect(await readConsentLog(logFile)).toHaveLength(2);
    expect(await readConsentLog(join(dir, "absent"))).toEqual([]);
  } finally {
    await rm(dir, { recursive: true });
  }
});
test("failed dispatch records no cost and null disables consent", async () => {
  vi.stubEnv("BLAND_API_KEY", "key");
  const guards = createCallGuards({ now });
  await expect(
    placeCall({
      ...req,
      vendor: "bland",
      live: true,
      guards,
      logFile: null,
      fetchFn: vi.fn().mockRejectedValue(new Error("offline")),
    }),
  ).rejects.toThrow();
  expect(guards.dispatchCount).toBe(0);
  expect(getCostReport().units).toBe(0);
  expect(
    (
      await placeCall({
        ...req,
        vendor: "bland",
        live: true,
        guards,
        logFile: null,
        fetchFn: vi.fn().mockResolvedValue(Response.json({ call_id: "id" })),
      })
    ).dryRun,
  ).toBe(false);
});
test("telnyx preview needs no key and live logs consent", async () => {
  const preview = await placeCall({
    ...req,
    vendor: "telnyx",
    fetchFn: vi.fn(),
  });
  expect(preview).toMatchObject({ dryRun: true, vendor: "telnyx" });
  vi.stubEnv("TELNYX_API_KEY", "key");
  const dir = await mkdtemp(join(tmpdir(), "phone-"));
  const logFile = join(dir, "log");
  const guards = createCallGuards({ now });
  try {
    const receipt = await placeCall({
      ...req,
      vendor: "telnyx",
      live: true,
      from: "+12025550124",
      connectionId: "connection",
      assistantId: "assistant",
      guards,
      logFile,
      fetchFn: vi.fn().mockResolvedValue(Response.json(dialFixture)),
    });
    expect(receipt).toMatchObject({
      dryRun: false,
      vendor: "telnyx",
      callId: dialFixture.data.call_control_id,
    });
    expect(guards.dispatchCount).toBe(1);
    expect(getCostReport().units).toBe(1);
    expect(await readConsentLog(logFile)).toEqual([
      {
        at: receipt.at,
        to: receipt.to,
        vendor: receipt.vendor,
        callId: receipt.callId,
        disclosure: receipt.disclosure,
      },
    ]);
  } finally {
    await rm(dir, { recursive: true });
  }
});
test("apiKey option reaches the vendor adapter", async () => {
  vi.stubEnv("BLAND_API_KEY", "");
  const fetchFn = vi
    .fn<typeof fetch>()
    .mockResolvedValue(Response.json({ call_id: "key-1" }));
  const receipt = await placeCall({
    ...req,
    vendor: "bland",
    live: true,
    apiKey: "opt-key",
    logFile: null,
    fetchFn,
  });
  expect(receipt).toMatchObject({ dryRun: false, callId: "key-1" });
  expect(fetchFn.mock.calls[0][1]?.headers).toMatchObject({
    Authorization: "Bearer opt-key",
  });
});
