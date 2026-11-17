import { cp, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createReaperTools } from "./tools.js";

const ROUND_1 = new URL("../fixtures/demo/round-1/", import.meta.url).pathname;

let root: string;
let dataDir: string;
let statements: string;

async function call(name: string, args: unknown): Promise<Record<string, unknown>> {
  const tools = createReaperTools({
    dataDir,
    appRoot: root,
    now: () => new Date("2026-07-01T09:00:00Z"),
    timeZone: "UTC",
    coreSource: "test-core-source",
  });
  const tool = tools.get(name);
  if (!tool) throw new Error(`${name} is not registered`);
  return (await tool.handler(args)) as Record<string, unknown>;
}

async function scanRound1(): Promise<void> {
  statements = join(root, "statements");
  await cp(ROUND_1, statements, { recursive: true });
  await mkdir(dataDir, { recursive: true });
  await writeFile(
    join(dataDir, "settings.json"),
    JSON.stringify({ version: 1, statementsFolder: statements }),
  );
  expect((await call("scan_statements", {}))["ok"]).toBe(true);
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "reaper-unbury-"));
  dataDir = join(root, "data");
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("unbury", () => {
  it("restores history.json byte-for-byte after bury then unbury", async () => {
    await scanRound1();
    const path = join(dataDir, "history.json");
    const before = await readFile(path);
    await call("bury", { service: "Netflix" });
    expect((await readFile(path)).equals(before)).toBe(false);
    const result = await call("unbury", { service: "netflix" });
    expect(result["ok"]).toBe(true);
    expect(typeof result["name"]).toBe("string");
    expect((await readFile(path)).equals(before)).toBe(true);
  });

  it("returns not-found with Tombstone candidates only", async () => {
    await scanRound1();
    await call("bury", { service: "Netflix" });
    const result = await call("unbury", { service: "Spotify" });
    expect(result["ok"]).toBe(false);
    expect(result["reason"]).toBe("not-found");
    expect(result["candidates"]).toEqual([]);
    const near = await call("unbury", { service: "flix" });
    expect(near["reason"]).toBe("not-found");
    expect(near["candidates"]).toEqual([
      expect.objectContaining({ name: "Netflix", amountText: "$15.49", cadence: "monthly" }),
    ]);
  });

  it("returns not-found with no candidates when nothing is buried", async () => {
    await scanRound1();
    expect(await call("unbury", { service: "Netflix" })).toEqual({
      ok: false,
      reason: "not-found",
      candidates: [],
    });
  });

  it("returns history-newer and leaves the file byte-equal", async () => {
    await scanRound1();
    const path = join(dataDir, "history.json");
    await writeFile(path, '{"version":2,"future":true}\n');
    const before = await readFile(path);
    expect(await call("unbury", { service: "Netflix" })).toEqual({
      ok: false,
      reason: "history-newer",
    });
    expect((await readFile(path)).equals(before)).toBe(true);
  });

  it("does not need the statements folder", async () => {
    await scanRound1();
    await call("bury", { service: "Spotify" });
    await rename(statements, join(root, "moved-away"));
    expect((await call("unbury", { service: "Spotify" }))["ok"]).toBe(true);
  });
});
