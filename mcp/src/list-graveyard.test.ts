import { cp, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createReaperTools } from "./tools.js";

const ROUND_1 = new URL("../fixtures/demo/round-1/", import.meta.url).pathname;

let root: string;
let dataDir: string;

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

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "reaper-graveyard-"));
  dataDir = join(root, "data");
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("list_graveyard", () => {
  it("returns ok with no Tombstones and no months for an empty Data dir", async () => {
    expect(await call("list_graveyard", {})).toEqual({
      ok: true,
      tombstones: [],
      savings: {},
      months: [],
    });
  });

  it("returns one Tombstone and one month after a scan and a bury", async () => {
    const statements = join(root, "statements");
    await cp(ROUND_1, statements, { recursive: true });
    await mkdir(dataDir, { recursive: true });
    await writeFile(
      join(dataDir, "settings.json"),
      JSON.stringify({ version: 1, statementsFolder: statements }),
    );
    expect((await call("scan_statements", {}))["ok"]).toBe(true);
    expect((await call("bury", { service: "Netflix" }))["ok"]).toBe(true);
    const before = await readFile(join(dataDir, "history.json"));

    const result = await call("list_graveyard", {});
    expect(result["ok"]).toBe(true);
    const tombstones = result["tombstones"] as Array<Record<string, unknown>>;
    expect(tombstones).toHaveLength(1);
    expect(tombstones[0]?.["name"]).toBe("Netflix");
    expect(tombstones[0]).not.toHaveProperty("key");
    expect(tombstones[0]).not.toHaveProperty("merchantKey");
    expect(typeof tombstones[0]?.["ref"]).toBe("string");
    expect(result["months"]).toHaveLength(1);
    expect(await readFile(join(dataDir, "history.json"))).toEqual(before);
  });

  it("returns history-unreadable for a broken file and does not rename it", async () => {
    await mkdir(dataDir, { recursive: true });
    await writeFile(join(dataDir, "history.json"), "{ not json");
    expect(await call("list_graveyard", {})).toEqual({ ok: false, reason: "history-unreadable" });
    expect(await readdir(dataDir)).toEqual(["history.json"]);
    expect(await readFile(join(dataDir, "history.json"), "utf8")).toBe("{ not json");
  });

  it("returns history-newer for a newer History version", async () => {
    await mkdir(dataDir, { recursive: true });
    await writeFile(join(dataDir, "history.json"), JSON.stringify({ version: 2 }));
    expect(await call("list_graveyard", {})).toEqual({ ok: false, reason: "history-newer" });
  });
});
