import { cp, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { History, ScanSummary } from "../../shared/src/types.ts";
import { createReaperTools } from "./tools.js";

const ROUND_1 = new URL("../fixtures/demo/round-1/", import.meta.url).pathname;

let root: string;
let dataDir: string;

function tools() {
  return createReaperTools({
    dataDir,
    appRoot: root,
    now: () => new Date("2026-07-01T09:00:00Z"),
    timeZone: "UTC",
    coreSource: "test-core-source",
  });
}

async function scan(): Promise<Record<string, unknown>> {
  const tool = tools().get("scan_statements");
  if (!tool) throw new Error("scan_statements is not registered");
  return (await tool.handler({})) as Record<string, unknown>;
}

async function writeSettings(folder: string): Promise<void> {
  await mkdir(dataDir, { recursive: true });
  await writeFile(
    join(dataDir, "settings.json"),
    JSON.stringify({ version: 1, statementsFolder: folder }),
  );
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "reaper-scan-"));
  dataDir = join(root, "data");
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("scan_statements (skeleton)", () => {
  it("returns not-configured when there is no Settings file", async () => {
    expect(await scan()).toEqual({ ok: false, reason: "not-configured" });
  });

  it("returns not-configured for a Settings file of the wrong shape", async () => {
    await mkdir(dataDir, { recursive: true });
    await writeFile(
      join(dataDir, "settings.json"),
      JSON.stringify({ version: 2, statementsFolder: "/x" }),
    );
    expect(await scan()).toEqual({ ok: false, reason: "not-configured" });
  });

  it("returns folder-missing when the folder does not exist", async () => {
    await writeSettings(join(root, "nowhere"));
    expect(await scan()).toEqual({ ok: false, reason: "folder-missing" });
  });

  it("returns no-statements for a folder without CSV files", async () => {
    const folder = join(root, "empty");
    await mkdir(folder);
    await writeSettings(folder);
    expect(await scan()).toEqual({ ok: false, reason: "no-statements" });
  });

  describe("on the round-1 demo statements", () => {
    let folder: string;

    beforeEach(async () => {
      folder = join(root, "statements");
      await cp(ROUND_1, folder, { recursive: true });
      await writeSettings(folder);
    });

    it("finds 6 undead and the yearly total", async () => {
      const result = (await scan()) as unknown as { ok: true } & ScanSummary;
      expect(result.ok).toBe(true);
      expect(result.firstScan).toBe(true);
      expect(result.files).toEqual({ read: 6, skipped: {} });
      expect(result.undead).toHaveLength(6);
      expect(result.yearlyTotals).toEqual({ USD: { yearlyCostCents: 118140, guessedCount: 0 } });
      expect(result.newUndead).toEqual([]);
      expect(result.possessed).toEqual([]);
    });

    it("returns no key, merchantKey or id on any entry", async () => {
      const result = (await scan()) as unknown as ScanSummary;
      for (const entry of result.undead) {
        expect(entry).not.toHaveProperty("key");
        expect(entry).not.toHaveProperty("merchantKey");
        expect(entry).not.toHaveProperty("id");
        expect(entry.ref).toMatch(/^[0-9a-f]{12}$/);
      }
    });

    it("writes a version 1 History with mode 0600", async () => {
      await scan();
      const path = join(dataDir, "history.json");
      const history = JSON.parse(await readFile(path, "utf8")) as History;
      expect(history.version).toBe(1);
      expect(history.coreSource).toBe("test-core-source");
      expect(history.trackedCharges).toHaveLength(6);
      expect(history.scans).toHaveLength(1);
      expect((await stat(path)).mode & 0o777).toBe(0o600);
    });

    it("adds one Scan record per scan and keeps the Tombstones", async () => {
      await scan();
      await scan();
      const history = JSON.parse(await readFile(join(dataDir, "history.json"), "utf8")) as History;
      expect(history.scans).toHaveLength(2);
      expect(history.tombstones).toEqual([]);
    });
  });
});
