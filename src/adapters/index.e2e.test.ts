import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, expect, test } from "vitest";
import { AdapterError, TelnyxPhoneAdapter } from "./index.js";

// Dry-run E2E: a local fake Telnyx API (node:http, like the fake-*.ts servers
// in pooriaarab/directory apps/web/e2e) on loopback. The adapter's baseUrl
// points at it, so no request reaches Telnyx and no call is placed.
interface SeenRequest {
  method: string;
  path: string;
  body?: Record<string, unknown>;
}
const seen: SeenRequest[] = [];
let server: Server;
let baseUrl: string;
const CONVERSATION_ID = "0424805b-adc1-4ff8-9f95-e1de6883ecbe";
const CALL = {
  call_control_id: "v3:fakeCallControlId0000000000000001",
  call_leg_id: "39109c34-26e5-45a1-b76a-8e9364b1e2bb",
  call_session_id: "4e596d9c-2b14-4e20-b4ec-3e0b1fb3ec0f",
};
const SUPERVISOR = "v3:fakeSupervisorLeg00000000000002";

const json = (body: unknown, status = 200) =>
  ({ status, body: JSON.stringify(body) }) as const;

beforeAll(async () => {
  server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://fake.telnyx");
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const body = chunks.length
        ? (JSON.parse(Buffer.concat(chunks).toString()) as Record<string, unknown>)
        : undefined;
      seen.push({ method: req.method ?? "", path: url.pathname + url.search, body });
      const send = ({ status, body: b }: ReturnType<typeof json>) => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(b);
      };
      if (req.headers.authorization !== "Bearer fake-key")
        return send(json({ errors: [{ code: "40100" }] }, 401));
      const p = url.pathname;
      if (p === "/v2/calls" && req.method === "POST")
        return send(json({ data: { ...CALL, is_alive: true, record_type: "call" } }));
      if (p === `/v2/calls/${encodeURIComponent(CALL.call_control_id)}/actions/bridge` && req.method === "POST")
        return send(json({ data: { result: "ok" } }));
      if (p === "/v2/ai/conversations")
        return send(
          url.searchParams.get("metadata->call_control_id") === `eq.${CALL.call_control_id}`
            ? json({ data: [{ id: CONVERSATION_ID }] })
            : json({ data: [] }),
        );
      if (p === `/v2/ai/conversations/${CONVERSATION_ID}/messages`)
        return send(
          json({
            data: [
              { role: "assistant", text: "I am an AI assistant. Your appointment is tomorrow." },
              { role: "user", text: "Thanks." },
            ],
          }),
        );
      if (p === "/v2/recordings")
        return send(
          json({
            data: [
              { download_urls: { mp3: "https://fake.telnyx/rec.mp3", wav: "https://fake.telnyx/rec.wav" } },
            ],
          }),
        );
      if (p === "/v2/detail_records") {
        if (url.searchParams.get("filter[record_type]") === "call-control")
          return send(
            json({
              data: [
                { call_leg_id: CALL.call_leg_id, cost: "0.0100", currency: "USD" },
                { call_leg_id: "unrelated-leg", cost: "9.99", currency: "USD" },
              ],
            }),
          );
        if (url.searchParams.get("filter[record_type]") === "ai-voice-assistant")
          return send(
            json({
              data:
                url.searchParams.get("filter[conversation_id]") === CONVERSATION_ID
                  ? [{ conversation_id: CONVERSATION_ID, cost: "0.0200", currency: "USD" }]
                  : [],
            }),
          );
      }
      return send(json({ errors: [{ code: "10005", title: "not found" }] }, 404));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());

const adapter = () => new TelnyxPhoneAdapter({ apiKey: "fake-key", baseUrl });
const input = {
  to: "+12025550123",
  from: "+16042399409",
  connectionId: "conn-1",
  assistantId: "assistant-1",
  script: "Remind the contact about tomorrow's appointment.",
  disclosure: "I am an AI assistant.",
  voice: "Telnyx.KokoroTTS.af_heart",
  firstMessage: "Is now a good time?",
  maxDurationSec: 600,
  record: true,
  clientState: "bGVhZC00Mg",
  dynamicVariables: { lead_id: "lead-42" },
};

test("placeCall starts an AI-assistant call and forwards script, disclosure, voice", async () => {
  const placed = await adapter().placeCall(input);
  expect(placed).toEqual({
    providerCallId: CALL.call_control_id,
    status: "ringing",
    callLegId: CALL.call_leg_id,
    callSessionId: CALL.call_session_id,
  });
  const dial = seen.find((r) => r.path === "/v2/calls");
  expect(dial?.body).toEqual({
    connection_id: "conn-1",
    to: input.to,
    from: input.from,
    time_limit_secs: 600,
    record: "record-from-answer",
    client_state: input.clientState,
    assistant: {
      id: "assistant-1",
      instructions: `${input.disclosure}\n\n${input.script}`,
      greeting: `${input.disclosure} ${input.firstMessage}`,
      voice_settings: { voice: input.voice },
      dynamic_variables: { lead_id: "lead-42" },
    },
  });
});

test("placeCall validates before any request", async () => {
  for (const bad of [
    { ...input, disclosure: " " },
    { ...input, to: "12025550123" },
    { ...input, script: "" },
    { ...input, assistantId: undefined },
  ]) {
    await expect(adapter().placeCall(bad)).rejects.toBeInstanceOf(AdapterError);
  }
  expect(seen.filter((r) => r.path === "/v2/calls")).toHaveLength(1);
});

test("transcript joins conversation messages and finds the recording", async () => {
  const t = await adapter().transcript(CALL.call_control_id, {
    callLegId: CALL.call_leg_id,
  });
  expect(t).toEqual({
    text: "assistant: I am an AI assistant. Your appointment is tomorrow.\nuser: Thanks.",
    audioUrl: "https://fake.telnyx/rec.mp3",
  });
  expect(
    seen.some(
      (r) =>
        r.path.startsWith("/v2/ai/conversations?") &&
        r.path.includes("call_control_id"),
    ),
  ).toBe(true);
});

test("transcript is null until the conversation exists", async () => {
  expect(await adapter().transcript("v3:unknown-call")).toBeNull();
});

test("liveJoin bridges a supervisor leg, and reports unsupported without one", async () => {
  expect(
    await adapter().liveJoin(CALL.call_control_id, {
      supervisorCallControlId: SUPERVISOR,
    }),
  ).toEqual({ status: "joined" });
  const bridge = seen.find((r) => r.path.endsWith("/actions/bridge"));
  expect(bridge?.body).toEqual({ call_control_id: SUPERVISOR });
  expect(await adapter().liveJoin(CALL.call_control_id)).toMatchObject({
    status: "unsupported",
  });
});

test("callCost sums telephony and assistant CDRs in cents", async () => {
  const cost = await adapter().callCost(CALL.call_control_id, {
    callLegId: CALL.call_leg_id,
    callSessionId: CALL.call_session_id,
    to: input.to,
  });
  expect(cost).toEqual({ costCents: 3, currency: "USD" });
});

test("missing key fails before any request", async () => {
  await expect(
    new TelnyxPhoneAdapter({ baseUrl }).placeCall(input),
  ).rejects.toMatchObject({ code: "VENDOR_FAILED" });
});
