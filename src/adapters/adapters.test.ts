import { afterEach, describe, expect, test, vi } from "vitest";
import { VendorError } from "agentic-core";
import { VapiAdapter } from "./vapi.js";
import { BlandAdapter } from "./bland.js";
import { RetellAdapter } from "./retell.js";
import { TelnyxAdapter } from "./telnyx.js";
import { DryAdapter } from "./dry.js";
import dialFixture from "./fixtures/telnyx-dial.json" with { type: "json" };
const input = {
  to: "+12025550123",
  script: "Reminder",
  disclosure: "I am an AI assistant.",
  assistantId: "assistant",
  phoneNumberId: "number",
  from: "+12025550124",
  agentId: "agent",
  voice: "voice",
  connectionId: "connection",
};
afterEach(() => vi.unstubAllEnvs());
for (const [name, Adapter, idField, env, url] of [
  ["vapi", VapiAdapter, "id", "VAPI_API_KEY", "https://api.vapi.ai/call"],
  [
    "bland",
    BlandAdapter,
    "call_id",
    "BLAND_API_KEY",
    "https://api.bland.ai/v1/calls",
  ],
  [
    "retell",
    RetellAdapter,
    "call_id",
    "RETELL_API_KEY",
    "https://api.retellai.com/v2/create-phone-call",
  ],
] as const)
  describe(name, () => {
    test("maps id and sends vendor payload", async () => {
      const fetchFn = vi
        .fn<typeof fetch>()
        .mockResolvedValue(Response.json({ [idField]: "call-1" }));
      expect(
        await new Adapter({ apiKey: "key" }).place(input, { fetchFn }),
      ).toBe("call-1");
      const [endpoint, init] = fetchFn.mock.calls[0];
      expect(endpoint).toBe(url);
      expect(init?.headers).toMatchObject({ Authorization: "Bearer key" });
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      const body = JSON.parse(init!.body as string);
      if (name === "vapi")
        expect(body).toEqual({
          assistantId: "assistant",
          phoneNumberId: "number",
          customer: { number: input.to },
        });
      if (name === "bland")
        expect(body).toMatchObject({
          phone_number: input.to,
          task: input.script,
          record: true,
          from: input.from,
          voice: input.voice,
        });
      if (name === "retell")
        expect(body).toEqual({
          from_number: input.from,
          to_number: input.to,
          override_agent_id: "agent",
          metadata: { disclosure: input.disclosure },
        });
    });
    test("HTTP failure carries status", async () => {
      await expect(
        new Adapter({ apiKey: "key" }).place(input, {
          fetchFn: vi.fn().mockResolvedValue(new Response("", { status: 429 })),
        }),
      ).rejects.toMatchObject({ status: 429 });
    });
    test("network failure throws", async () => {
      await expect(
        new Adapter({ apiKey: "key" }).place(input, {
          fetchFn: vi.fn().mockRejectedValue(new Error("offline")),
        }),
      ).rejects.toBeInstanceOf(VendorError);
    });
    test("missing key throws before network", async () => {
      vi.stubEnv(env, "");
      const fetchFn = vi.fn();
      await expect(new Adapter().place(input, { fetchFn })).rejects.toThrow(
        "API key",
      );
      expect(fetchFn).not.toHaveBeenCalled();
    });
    test("missing id throws", async () => {
      await expect(
        new Adapter({ apiKey: "key" }).place(input, {
          fetchFn: vi.fn().mockResolvedValue(Response.json({})),
        }),
      ).rejects.toThrow("no id");
    });
    test("env key works", async () => {
      vi.stubEnv(env, "env-key");
      expect(
        await new Adapter().place(input, {
          fetchFn: vi
            .fn()
            .mockResolvedValue(Response.json({ [idField]: "env-call" })),
        }),
      ).toBe("env-call");
    });
  });
test("dry never fetches", async () => {
  const fetchFn = vi.fn();
  expect(await new DryAdapter().place(input, { fetchFn })).toMatch(/^dry-/);
  expect(fetchFn).not.toHaveBeenCalled();
});
test("required vendor fields", async () => {
  await expect(
    new VapiAdapter().place({ ...input, assistantId: undefined }),
  ).rejects.toThrow("assistantId");
  await expect(
    new RetellAdapter().place({ ...input, from: undefined }),
  ).rejects.toThrow("from");
  await expect(
    new TelnyxAdapter().place({ ...input, connectionId: undefined }),
  ).rejects.toThrow("connectionId");
});
describe("telnyx", () => {
  const url = "https://api.telnyx.com/v2/calls";
  const apiKey = "key";
  const expectedAuth = `Bearer ${apiKey}`;
  test("maps fixture id and sends dial payload", async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(dialFixture));
    expect(
      await new TelnyxAdapter({ apiKey }).place(input, { fetchFn }),
    ).toBe(dialFixture.data.call_control_id);
    const [endpoint, init] = fetchFn.mock.calls[0];
    expect(endpoint).toBe(url);
    expect(init?.headers).toMatchObject({ Authorization: expectedAuth });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(init!.body as string)).toEqual({
      connection_id: "connection",
      to: input.to,
      from: input.from,
    });
  });
  test("HTTP failure carries status", async () => {
    await expect(
      new TelnyxAdapter({ apiKey: "key" }).place(input, {
        fetchFn: vi.fn().mockResolvedValue(new Response("", { status: 429 })),
      }),
    ).rejects.toMatchObject({ status: 429 });
  });
  test("network failure throws", async () => {
    await expect(
      new TelnyxAdapter({ apiKey: "key" }).place(input, {
        fetchFn: vi.fn().mockRejectedValue(new Error("offline")),
      }),
    ).rejects.toBeInstanceOf(VendorError);
  });
  test("missing key throws before network", async () => {
    vi.stubEnv("TELNYX_API_KEY", "");
    const fetchFn = vi.fn();
    await expect(
      new TelnyxAdapter().place(input, { fetchFn }),
    ).rejects.toThrow("API key");
    expect(fetchFn).not.toHaveBeenCalled();
  });
  test("missing id throws", async () => {
    await expect(
      new TelnyxAdapter({ apiKey: "key" }).place(input, {
        fetchFn: vi.fn().mockResolvedValue(Response.json({ data: {} })),
      }),
    ).rejects.toThrow("no id");
  });
  test("env key works", async () => {
    vi.stubEnv("TELNYX_API_KEY", "env-key");
    expect(
      await new TelnyxAdapter().place(input, {
        fetchFn: vi.fn().mockResolvedValue(Response.json(dialFixture)),
      }),
    ).toBe(dialFixture.data.call_control_id);
  });
});
