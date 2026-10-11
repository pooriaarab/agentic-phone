import { afterEach, expect, test, vi } from "vitest";
import { createLogger, VendorError } from "agentic-core";
import orderFixture from "./adapters/fixtures/telnyx-number-order.json" with {
  type: "json",
};
import { provisionTelnyxNumber } from "./numbers.js";

const now = () => new Date("2026-10-11T10:00:00Z");
const logger = createLogger({ quiet: true });

afterEach(() => vi.unstubAllEnvs());

test("preview orders nothing and returns a dry id", async () => {
  const fetchFn = vi.fn();
  const receipt = await provisionTelnyxNumber({
    numbers: ["+19705555098"],
    now,
    logger,
    fetchFn,
  });
  expect(receipt).toMatchObject({
    dryRun: true,
    numbers: ["+19705555098"],
    at: now().toISOString(),
  });
  expect(receipt.orderId).toMatch(/^dry-order-/);
  expect(fetchFn).not.toHaveBeenCalled();
});

test("live posts the order and maps the fixture id", async () => {
  const apiKey = "key";
  const fetchFn = vi
    .fn<typeof fetch>()
    .mockResolvedValue(Response.json(orderFixture));
  const receipt = await provisionTelnyxNumber({
    numbers: ["+19705555098"],
    connectionId: "346789098765567",
    customerReference: "MY REF 001",
    live: true,
    apiKey,
    now,
    logger,
    fetchFn,
  });
  expect(receipt).toMatchObject({
    dryRun: false,
    orderId: orderFixture.data.id,
    numbers: ["+19705555098"],
  });
  const [endpoint, init] = fetchFn.mock.calls[0];
  expect(endpoint).toBe("https://api.telnyx.com/v2/number_orders");
  expect(init?.headers).toMatchObject({ Authorization: `Bearer ${apiKey}` });
  expect(JSON.parse(init!.body as string)).toMatchObject({
    phone_numbers: [{ phone_number: "+19705555098" }],
    connection_id: "346789098765567",
    customer_reference: "MY REF 001",
  });
});

test("env key works for live orders", async () => {
  vi.stubEnv("TELNYX_API_KEY", "env-key");
  const receipt = await provisionTelnyxNumber({
    numbers: ["+19705555098"],
    live: true,
    now,
    logger,
    fetchFn: vi.fn().mockResolvedValue(Response.json(orderFixture)),
  });
  expect(receipt.orderId).toBe(orderFixture.data.id);
});

test("rejects blank numbers and bad format", async () => {
  await expect(
    provisionTelnyxNumber({ numbers: [], now, logger }),
  ).rejects.toThrow("at least one number");
  await expect(
    provisionTelnyxNumber({ numbers: ["9705555098"], now, logger }),
  ).rejects.toThrow("E.164");
});

test("missing key throws before network", async () => {
  vi.stubEnv("TELNYX_API_KEY", "");
  const fetchFn = vi.fn();
  await expect(
    provisionTelnyxNumber({
      numbers: ["+19705555098"],
      live: true,
      now,
      logger,
      fetchFn,
    }),
  ).rejects.toThrow("API key");
  expect(fetchFn).not.toHaveBeenCalled();
});

test("HTTP and network failures throw", async () => {
  await expect(
    provisionTelnyxNumber({
      numbers: ["+19705555098"],
      live: true,
      apiKey: "key",
      now,
      logger,
      fetchFn: vi.fn().mockResolvedValue(new Response("", { status: 422 })),
    }),
  ).rejects.toMatchObject({ status: 422 });
  await expect(
    provisionTelnyxNumber({
      numbers: ["+19705555098"],
      live: true,
      apiKey: "key",
      now,
      logger,
      fetchFn: vi.fn().mockRejectedValue(new Error("offline")),
    }),
  ).rejects.toBeInstanceOf(VendorError);
});
