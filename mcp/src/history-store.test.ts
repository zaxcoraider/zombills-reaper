import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { emptyHistory, encodeHistory } from "../../shared/src/history-codec.ts";
import type { History } from "../../shared/src/types.ts";
import { loadHistoryForWrite, readHistory, saveHistory } from "./history-store.js";

const NOW = new Date("2026-12-01T09:00:12Z");
const STAMP = "20261201T090012";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "reaper-history-store-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function historyWithScan(): History {
  const history = emptyHistory();
  history.scans.push({
    scanId: "scan-20261201T090012Z-3f9a1c",
    scannedAt: "2026-12-01T09:00:12.481Z",
    statementRange: { from: "2026-01-02", to: "2026-06-28" },
    undeadCount: 1,
    yearlyTotals: { USD: { yearlyCostCents: 100, guessedCount: 0 } },
    newCount: 0,
    possessedCount: 0,
  });
  return history;
}

/** Valid History text plus one broken Tracked charge, which the codec drops. */
function textWithBadRecord(): string {
  const parsed = JSON.parse(encodeHistory(historyWithScan())) as Record<string, unknown>;
  parsed["trackedCharges"] = [{ key: 5 }];
  return `${JSON.stringify(parsed)}\n`;
}

async function mode(path: string): Promise<number> {
  return (await stat(path)).mode & 0o777;
}

describe("loadHistoryForWrite", () => {
  it("row 1: a missing file gives an empty History and writes nothing", async () => {
    const result = await loadHistoryForWrite(dir, NOW);
    expect(result).toEqual({ history: emptyHistory(), reset: false, dropped: 0 });
    expect(await readdir(dir)).toEqual([]);
  });

  it("row 2: a clean file is returned and nothing else is written", async () => {
    const history = historyWithScan();
    await writeFile(join(dir, "history.json"), encodeHistory(history), { mode: 0o600 });
    const result = await loadHistoryForWrite(dir, NOW);
    expect(result).toEqual({ history, reset: false, dropped: 0 });
    expect(await readdir(dir)).toEqual(["history.json"]);
  });

  it("row 3: a file with a bad record gets a 0600 backup of the original bytes", async () => {
    const text = textWithBadRecord();
    await writeFile(join(dir, "history.json"), text, { mode: 0o600 });
    const result = await loadHistoryForWrite(dir, NOW);
    expect(result).toEqual({ history: historyWithScan(), reset: false, dropped: 1 });
    const backup = join(dir, `history.backup-${STAMP}.json`);
    expect(await readFile(backup, "utf8")).toBe(text);
    expect(await mode(backup)).toBe(0o600);
    expect(await readFile(join(dir, "history.json"), "utf8")).toBe(text);
  });

  it("row 3: keeps only the 3 newest backups", async () => {
    await writeFile(join(dir, "history.json"), textWithBadRecord(), { mode: 0o600 });
    for (let second = 10; second < 15; second += 1) {
      await loadHistoryForWrite(dir, new Date(`2026-12-01T09:00:${second}Z`));
    }
    const backups = (await readdir(dir)).filter((name) => name.startsWith("history.backup-"));
    expect(backups.sort()).toEqual([
      "history.backup-20261201T090012.json",
      "history.backup-20261201T090013.json",
      "history.backup-20261201T090014.json",
    ]);
  });

  it("row 4: an unreadable file is renamed and an empty History is returned", async () => {
    await writeFile(join(dir, "history.json"), "not json{", { mode: 0o600 });
    const result = await loadHistoryForWrite(dir, NOW);
    expect(result).toEqual({ history: emptyHistory(), reset: true, dropped: 0 });
    expect(await readdir(dir)).toEqual([`history.unreadable-${STAMP}.json`]);
    expect(await readFile(join(dir, `history.unreadable-${STAMP}.json`), "utf8")).toBe("not json{");
    expect(await mode(join(dir, `history.unreadable-${STAMP}.json`))).toBe(0o600);
  });

  it("row 4: a second unreadable file in the same second gets -2", async () => {
    await writeFile(join(dir, "history.json"), "bad1");
    await loadHistoryForWrite(dir, NOW);
    await writeFile(join(dir, "history.json"), "bad2");
    await loadHistoryForWrite(dir, NOW);
    expect((await readdir(dir)).sort()).toEqual([
      `history.unreadable-${STAMP}-2.json`,
      `history.unreadable-${STAMP}.json`,
    ]);
  });

  it("row 5: a newer version gives history-newer and leaves bytes and name unchanged", async () => {
    const text = `${JSON.stringify({ version: 2, anything: [1, 2] })}\n`;
    await writeFile(join(dir, "history.json"), text, { mode: 0o600 });
    expect(await loadHistoryForWrite(dir, NOW)).toEqual({ error: "history-newer" });
    expect(await readdir(dir)).toEqual(["history.json"]);
    expect(await readFile(join(dir, "history.json"), "utf8")).toBe(text);
  });

  it("row 6: a read error other than ENOENT gives history-unreadable", async () => {
    // history.json is a directory: readFile fails with EISDIR.
    await writeFile(join(dir, "marker"), "");
    await mkdir(join(dir, "history.json"));
    expect(await loadHistoryForWrite(dir, NOW)).toEqual({ error: "history-unreadable" });
    expect((await readdir(dir)).sort()).toEqual(["history.json", "marker"]);
  });
});

describe("readHistory", () => {
  it("returns an empty History for a missing file", async () => {
    expect(await readHistory(dir)).toEqual({ history: emptyHistory() });
  });

  it("returns the History, with dropped records absent and no backup", async () => {
    await writeFile(join(dir, "history.json"), textWithBadRecord());
    expect(await readHistory(dir)).toEqual({ history: historyWithScan() });
    expect(await readdir(dir)).toEqual(["history.json"]);
  });

  it("returns history-unreadable for an unreadable file and renames nothing", async () => {
    await writeFile(join(dir, "history.json"), "[1,2");
    expect(await readHistory(dir)).toEqual({ error: "history-unreadable" });
    expect(await readdir(dir)).toEqual(["history.json"]);
    expect(await readFile(join(dir, "history.json"), "utf8")).toBe("[1,2");
  });

  it("returns history-newer for a newer version", async () => {
    await writeFile(join(dir, "history.json"), '{"version":3}');
    expect(await readHistory(dir)).toEqual({ error: "history-newer" });
    expect(await readdir(dir)).toEqual(["history.json"]);
  });
});

describe("saveHistory", () => {
  it("writes the encoded History with mode 0600 and round-trips", async () => {
    const history = historyWithScan();
    await saveHistory(dir, history);
    expect(await readFile(join(dir, "history.json"), "utf8")).toBe(encodeHistory(history));
    expect(await mode(join(dir, "history.json"))).toBe(0o600);
    expect(await readHistory(dir)).toEqual({ history });
  });
});
