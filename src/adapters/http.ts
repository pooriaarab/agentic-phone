import { VendorError } from "agentic-core";
import type { AdapterContext } from "./types.js";
export async function postCall(
  name: string,
  url: string,
  key: string | undefined,
  body: unknown,
  idField: string,
  ctx: AdapterContext,
): Promise<string> {
  if (!key?.trim()) throw new VendorError(`${name}: missing API key`);
  let response: Response;
  try {
    response = await (ctx.fetchFn ?? globalThis.fetch)(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (cause) {
    throw new VendorError(`${name}: network error`, { cause });
  }
  if (!response.ok)
    throw new VendorError(`${name}: HTTP ${response.status}`, {
      status: response.status,
    });
  let data: Record<string, unknown>;
  try {
    data = (await response.json()) as Record<string, unknown>;
  } catch (cause) {
    throw new VendorError(`${name}: invalid response`, { cause });
  }
  const id = data?.[idField];
  if (typeof id !== "string" || !id.trim())
    throw new VendorError(`${name}: response has no id`);
  return id;
}
