import { appendFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { CallVendor } from "./adapters/types.js";
export interface ConsentEntry {
  at: string;
  to: string;
  vendor: CallVendor;
  callId: string;
  disclosure: string;
}
export function defaultConsentPath(): string {
  return resolve(process.cwd(), "consent-log.jsonl");
}
export async function appendConsentLog(
  path: string,
  entry: ConsentEntry,
): Promise<void> {
  await appendFile(path, JSON.stringify(entry) + "\n", "utf8");
}
export async function readConsentLog(
  path: string = defaultConsentPath(),
): Promise<ConsentEntry[]> {
  try {
    return (await readFile(path, "utf8"))
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line) as ConsentEntry);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}
