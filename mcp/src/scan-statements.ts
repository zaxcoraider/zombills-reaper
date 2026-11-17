// The full scan (design "Scan algorithm" steps 1 to 12). Steps 1 to 6 hold no lock and touch no
// Reaper file; steps 7 to 11 run inside `withHistoryLock`.
import { randomBytes } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import { detectSubscriptions } from "@zombills/core";
import type { Subscription } from "@zombills/core";
import { decodeSettings } from "../../shared/src/settings-codec.ts";
import type { ScanSummary, SkipKind, ToolResult } from "../../shared/src/types.ts";
import { ensureDataDir } from "./data-files.js";
import { withHistoryLock } from "./history-lock.js";
import { loadHistoryForWrite, saveHistory } from "./history-store.js";
import { logCounts } from "./log.js";
import { mergeOverlap } from "./merge-transactions.js";
import { readAll } from "./read-statements.js";
import { diffScan } from "./scan-diff.js";
import type { ToolContext } from "./tools.js";

/** Folder `stat` errors that mean "ask for the folder again" (design step 2). */
const FOLDER_MISSING_CODES: readonly string[] = ["ENOENT", "ENOTDIR", "EACCES", "EPERM"];

/** Step 1. A missing file or a file that does not decode is "not configured"; any other error throws. */
async function readStatementsFolder(dataDir: string): Promise<string | null> {
  let text: string;
  try {
    text = await readFile(join(dataDir, "settings.json"), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  const decoded = decodeSettings(text);
  return decoded.kind === "ok" ? decoded.settings.statementsFolder : null;
}

/** Step 2. */
async function folderIsUsable(folder: string): Promise<boolean> {
  try {
    return (await stat(folder)).isDirectory();
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (typeof code === "string" && FOLDER_MISSING_CODES.includes(code)) return false;
    throw error;
  }
}

function scanIdOf(now: Date): string {
  const stamp = now
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d+Z$/, "Z");
  return `scan-${stamp}-${randomBytes(3).toString("hex")}`;
}

interface Detected {
  subs: Subscription[];
  statementRange: { from: string; to: string };
  files: { read: number; skipped: Partial<Record<SkipKind, number>> };
  rowErrorCount: number;
}

/**
 * Steps 3 to 6. The parsed rows live only inside this function; what returns holds Core's
 * subscriptions, which are never written or returned.
 */
async function readAndDetect(folder: string): Promise<Detected | null> {
  const { perFile, files, rowErrorCount } = await readAll(folder);
  if (files.read === 0) return null;
  const detection = detectSubscriptions(mergeOverlap(perFile));
  const { firstDate, lastDate } = detection.statement;
  if (firstDate === null || lastDate === null) return null;
  return {
    subs: detection.subscriptions,
    statementRange: { from: firstDate, to: lastDate },
    files,
    rowErrorCount,
  };
}

export async function scanStatements(context: ToolContext): Promise<ToolResult<ScanSummary>> {
  const folder = await readStatementsFolder(context.dataDir);
  if (folder === null) return { ok: false, reason: "not-configured" };
  if (!(await folderIsUsable(folder))) return { ok: false, reason: "folder-missing" };

  const detected = await readAndDetect(folder);
  if (detected === null) return { ok: false, reason: "no-statements" };

  const now = context.now();
  const scanId = scanIdOf(now);
  await ensureDataDir(context.dataDir);
  const locked = await withHistoryLock(
    context.dataDir,
    async () => {
      const loaded = await loadHistoryForWrite(context.dataDir, now);
      if ("error" in loaded) return { ok: false as const, reason: loaded.error };
      const { summary, nextHistory } = diffScan({
        subs: detected.subs,
        history: loaded.history,
        coreSource: context.coreSource,
        scanId,
        now,
        folderName: basename(folder),
        files: detected.files,
        statementRange: detected.statementRange,
        historyReset: loaded.reset,
        historyDropped: loaded.dropped,
      });
      await saveHistory(context.dataDir, nextHistory);
      return { ok: true as const, summary };
    },
    context.lock?.timings,
    context.lock?.clock,
  );
  if (!locked.ok) return { ok: false, reason: locked.reason };

  const { summary } = locked;
  const skippedTotal = Object.values(detected.files.skipped).reduce((sum, n) => sum + n, 0);
  logCounts("scan", {
    read: detected.files.read,
    skipped: skippedTotal,
    rowErrors: detected.rowErrorCount,
    undead: summary.undead.length,
    new: summary.newUndead.length,
    possessed: summary.possessed.length,
  });
  return { ok: true, ...summary };
}
