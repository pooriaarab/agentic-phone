import { expect, test, vi } from "vitest";
import { parseArgs, runCli, UsageError } from "./cli.js";
const args = [
  "call",
  "--to",
  "+12025550123",
  "--script",
  "Hello",
  "--disclosure",
  "I am AI.",
];
const io = () => ({
  out: vi.fn(),
  err: vi.fn(),
  readFile: vi.fn(() => "Hello"),
  now: () => new Date("2026-10-11T10:00:00Z"),
});
test("parse errors exit 2", async () => {
  for (const argv of [
    ["wrong"],
    ["call"],
    [...args, "--bad"],
    [...args, "--vendor", "bad"],
    [...args, "--voice"],
    [...args, "--file", "script.txt"],
  ]) {
    expect(() => parseArgs(argv)).toThrow(UsageError);
    expect(await runCli(argv, io())).toBe(2);
  }
});
test("commands produce output", async () => {
  for (const argv of [
    args,
    ["log", "--log-file", "/tmp/no-phone-log"],
    ["costs"],
    ["help"],
    ["version"],
    ["--help"],
    ["--version"],
  ]) {
    const fake = io();
    expect(await runCli(argv, fake)).toBe(0);
    expect(fake.out).toHaveBeenCalled();
  }
});
test("file input and missing file", async () => {
  const fake = io();
  expect(
    await runCli(
      [
        "call",
        "--to",
        "+12025550123",
        "--file",
        "script.txt",
        "--disclosure",
        "AI",
      ],
      fake,
    ),
  ).toBe(0);
  expect(fake.readFile).toHaveBeenCalledWith("script.txt");
  fake.readFile.mockImplementation(() => {
    throw Object.assign(new Error("missing file"), { code: "ENOENT" });
  });
  expect(
    await runCli(
      [
        "call",
        "--to",
        "+12025550123",
        "--file",
        "absent",
        "--disclosure",
        "AI",
      ],
      fake,
    ),
  ).toBe(1);
  expect(fake.err).toHaveBeenCalledWith("Error: missing file");
});
test("domain failures exit 1 with name", async () => {
  const fake = io();
  expect(await runCli([...args, "--to", "bad"], fake)).toBe(1);
  expect(fake.err.mock.calls[0][0]).toContain("VendorError:");
  expect(await runCli([...args, "--disclosure", " "], fake)).toBe(1);
  expect(fake.err.mock.calls[1][0]).toContain("GuardError:");
});
