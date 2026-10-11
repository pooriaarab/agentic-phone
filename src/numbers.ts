import { randomUUID } from "node:crypto";
import {
  createLogger,
  VendorError,
  type Logger,
} from "agentic-core";
import { postCall } from "./adapters/http.js";

export interface ProvisionRequest {
  numbers: string[];
  connectionId?: string;
  messagingProfileId?: string;
  billingGroupId?: string;
  customerReference?: string;
  live?: boolean;
  apiKey?: string;
  logger?: Logger;
  fetchFn?: typeof fetch;
  now?: () => Date;
}

export interface ProvisionReceipt {
  orderId: string;
  numbers: string[];
  dryRun: boolean;
  at: string;
}

const E164_PATTERN = /^\+[1-9]\d{6,14}$/;

export async function provisionTelnyxNumber(
  req: ProvisionRequest,
): Promise<ProvisionReceipt> {
  if (req.numbers.length === 0) {
    throw new VendorError("at least one number is required");
  }
  for (const number of req.numbers) {
    if (!E164_PATTERN.test(number)) {
      throw new VendorError("numbers must use E.164 format");
    }
  }
  const logger = req.logger ?? createLogger();
  const dryRun = req.live !== true;
  const at = (req.now?.() ?? new Date()).toISOString();
  if (dryRun) {
    logger.info(`Preview order for ${req.numbers.join(", ")}`);
    return {
      orderId: `dry-order-${randomUUID()}`,
      numbers: [...req.numbers],
      dryRun: true,
      at,
    };
  }
  // Order shape follows the Telnyx number orders API.
  const orderId = await postCall(
    "telnyx",
    "https://api.telnyx.com/v2/number_orders",
    req.apiKey ?? process.env.TELNYX_API_KEY,
    {
      phone_numbers: req.numbers.map((phone_number) => ({ phone_number })),
      connection_id: req.connectionId,
      messaging_profile_id: req.messagingProfileId,
      billing_group_id: req.billingGroupId,
      customer_reference: req.customerReference,
    },
    "data.id",
    { fetchFn: req.fetchFn, logger },
  );
  return { orderId, numbers: [...req.numbers], dryRun: false, at };
}
