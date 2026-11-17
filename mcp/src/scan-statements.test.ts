import {
  cp,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  utimes,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

    it("returns history-newer and leaves the file byte-equal", async () => {
      const path = join(dataDir, "history.json");
      await writeFile(path, '{"version":2,"future":true}\n');
      const before = await readFile(path);
      expect(await scan()).toEqual({ ok: false, reason: "history-newer" });
      expect((await readFile(path)).equals(before)).toBe(true);
      expect(await readdir(dataDir)).not.toContain("history.lock");
    });

    it("returns history-busy while a fresh lock is held, and writes nothing", async () => {
      const t = Date.now();
      let slept = 0;
      const clock = {
        now: () => t + slept,
        sleep: (ms: number): Promise<void> => {
          slept += ms;
          return Promise.resolve();
        },
      };
      const lockPath = join(dataDir, "history.lock");
      await writeFile(lockPath, JSON.stringify({ pid: process.pid, at: "x" }));
      await utimes(lockPath, t / 1000, t / 1000);
      const tool = createReaperTools({
        dataDir,
        appRoot: root,
        now: () => new Date("2026-07-01T09:00:00Z"),
        timeZone: "UTC",
        coreSource: "test-core-source",
        lock: { timings: { pollMs: 50, waitMs: 500, staleMs: 30_000 }, clock },
      }).get("scan_statements");
      expect(await tool?.handler({})).toEqual({ ok: false, reason: "history-busy" });
      expect(await readdir(dataDir)).not.toContain("history.json");
    });

    it("moves an unreadable history aside and reports historyReset", async () => {
      await writeFile(join(dataDir, "history.json"), "not json");
      const result = (await scan()) as unknown as ScanSummary;
      expect(result.historyReset).toBe(true);
      expect(result.historyDropped).toBe(0);
      expect((await readdir(dataDir)).some((n) => n.startsWith("history.unreadable-"))).toBe(true);
    });
  });
});

describe("scan_statements (full scan)", () => {
  let folder: string;

  async function readHistoryFile(): Promise<History> {
    return JSON.parse(await readFile(join(dataDir, "history.json"), "utf8")) as History;
  }

  beforeEach(async () => {
    folder = join(root, "statements");
    await cp(ROUND_1, folder, { recursive: true });
    await writeSettings(folder);
  });

  it("returns no-statements for a folder with only a broken CSV", async () => {
    const broken = join(root, "broken");
    await mkdir(broken);
    // Two conflicting date formats: Core reports an error that is not an empty file.
    await writeFile(
      join(broken, "a.csv"),
      "Date,Description,Amount\n13/01/2026,SHOP,5.00\n01/13/2026,SHOP,5.00\n",
    );
    await writeSettings(broken);
    expect(await scan()).toEqual({ ok: false, reason: "no-statements" });
    expect(await readdir(dataDir)).toEqual(["settings.json"]);
  });

  it("returns folder-missing when the path is a file", async () => {
    await writeFile(join(root, "a-file"), "x");
    await writeSettings(join(root, "a-file"));
    expect(await scan()).toEqual({ ok: false, reason: "folder-missing" });
  });

  it("reports nothing on a second scan of the same files", async () => {
    const first = (await scan()) as unknown as ScanSummary;
    const second = (await scan()) as unknown as ScanSummary;
    expect(first.firstScan).toBe(true);
    expect(second.firstScan).toBe(false);
    expect(second.newUndead).toEqual([]);
    expect(second.possessed).toEqual([]);
    expect(second.trialTraps).toEqual([]);
    expect(second.risenAfterBurial).toEqual([]);
    expect(second.undead).toEqual(first.undead);
    expect(second.yearlyTotals).toEqual(first.yearlyTotals);
  });

  it("gives historyReset and an unreadable-* file for an unreadable history.json", async () => {
    await writeFile(join(dataDir, "history.json"), "not json");
    const result = (await scan()) as unknown as ScanSummary;
    expect(result.historyReset).toBe(true);
    expect(result.firstScan).toBe(true);
    const names = await readdir(dataDir);
    expect(names.filter((n) => n.startsWith("history.unreadable-"))).toHaveLength(1);
    expect((await readHistoryFile()).scans).toHaveLength(1);
  });

  it("drops one bad record, keeps a backup and reports historyDropped", async () => {
    await scan();
    const history = await readHistoryFile();
    const raw = { ...history, trackedCharges: [...history.trackedCharges, { key: 7 }] };
    await writeFile(join(dataDir, "history.json"), JSON.stringify(raw));
    const result = (await scan()) as unknown as ScanSummary;
    expect(result.historyDropped).toBe(1);
    expect(result.historyReset).toBe(false);
    const names = await readdir(dataDir);
    expect(names.filter((n) => n.startsWith("history.backup-"))).toHaveLength(1);
    expect((await readHistoryFile()).trackedCharges).toHaveLength(6);
  });

  it("re-baselines on a different coreSource and keeps the Tombstones", async () => {
    await scan();
    const history = await readHistoryFile();
    const tombstone = {
      key: "no-such-key",
      name: "Gone",
      serviceId: null,
      currency: "USD",
      cadence: "monthly",
      merchantKey: "gone",
      amountCents: 999,
      cadenceAssumed: false,
      yearlySavingCents: 11988,
      buriedAt: "2026-03-01",
      risenReportedThrough: null,
    };
    await writeFile(
      join(dataDir, "history.json"),
      JSON.stringify({ ...history, coreSource: "older-core", tombstones: [tombstone] }),
    );
    const result = (await scan()) as unknown as ScanSummary;
    expect(result.firstScan).toBe(true);
    expect(result.newUndead).toEqual([]);
    const after = await readHistoryFile();
    expect(after.coreSource).toBe("test-core-source");
    expect(after.tombstones).toEqual([tombstone]);
    expect(after.trackedCharges).toHaveLength(6);
    expect(after.scans).toHaveLength(2);
  });

  it("leaves history.json byte-equal when the scan returns ok: false", async () => {
    await scan();
    const path = join(dataDir, "history.json");
    const before = await readFile(path);
    await rm(folder, { recursive: true });
    expect(await scan()).toEqual({ ok: false, reason: "folder-missing" });
    await mkdir(folder);
    expect(await scan()).toEqual({ ok: false, reason: "no-statements" });
    expect((await readFile(path)).equals(before)).toBe(true);
  });

  it("returns internal-error and logs no path when the Data dir is a regular file", async () => {
    const fileAsDir = join(root, "data-is-a-file");
    await writeFile(fileAsDir, "x");
    const lines: string[] = [];
    const spy = vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      lines.push(String(chunk));
      return true;
    });
    try {
      const tool = createReaperTools({
        dataDir: fileAsDir,
        appRoot: root,
        now: () => new Date("2026-07-01T09:00:00Z"),
        timeZone: "UTC",
        coreSource: "test-core-source",
      }).get("scan_statements");
      expect(await tool?.handler({})).toEqual({ ok: false, reason: "internal-error" });
    } finally {
      spy.mockRestore();
    }
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^reaper: tool-error tool=scan_statements name=Error code=ENOTDIR\n$/);
    expect(lines[0]).not.toContain(root);
  });
});
