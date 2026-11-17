// Skeleton of the scan (design "Scan algorithm"). Task 17 replaces it with the full diff.
import { randomBytes } from "node:crypto";
import { mkdir, readdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import {
  classifySubscriptions,
  detectSubscriptions,
  normalizeTransactions,
  parseStatement,
} from "@zombills/core";
import type { ClassifiedSubscription, NormalizedTransaction } from "@zombills/core";
import { displayName } from "../../shared/src/display-name.ts";
import { refOf } from "../../shared/src/ref.ts";
import type {
  History,
  ReaperLabel,
  ScanRecord,
  ScanSummary,
  SkipKind,
  ToolResult,
  Tombstone,
  TrackedCharge,
  UndeadEntry,
  YearlyTotals,
} from "../../shared/src/types.ts";
import { logCounts } from "./log.js";
import type { ToolContext } from "./tools.js";

const MAX_FILES = 120;
const STATEMENT_NAME = /\.csv$/i;

function compareCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readStatementsFolder(dataDir: string): Promise<string | null> {
  let text: string;
  try {
    text = await readFile(join(dataDir, "settings.json"), "utf8");
  } catch {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isPlainObject(parsed) || parsed["version"] !== 1) return null;
  const folder = parsed["statementsFolder"];
  return typeof folder === "string" && folder.length > 0 ? folder : null;
}

async function folderExists(folder: string): Promise<boolean> {
  try {
    return (await stat(folder)).isDirectory();
  } catch {
    return false;
  }
}

function decodeUtf8(bytes: Buffer): string {
  const start =
    bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 3 : 0;
  return new TextDecoder("utf-8").decode(bytes.subarray(start));
}

function yearlyTotalsOf(entries: UndeadEntry[]): YearlyTotals {
  const totals: YearlyTotals = {};
  for (const entry of entries) {
    const total = (totals[entry.currency] ??= { yearlyCostCents: 0, guessedCount: 0 });
    if (entry.cadenceAssumed) total.guessedCount += 1;
    else total.yearlyCostCents += entry.yearlyCostCents;
  }
  return totals;
}

function undeadEntryOf(s: ClassifiedSubscription): UndeadEntry {
  const labels: ReaperLabel[] = [];
  if (s.labels.includes("possessed")) labels.push("possessed");
  if (s.labels.includes("trial-trap")) labels.push("trial-trap");
  return {
    ref: refOf(s.id),
    name: displayName(s.merchant),
    serviceId: s.serviceId,
    currency: s.currency,
    cadence: s.cadence,
    amountCents: s.currentAmountCents,
    yearlyCostCents: s.yearlyCostCents,
    cadenceAssumed: s.evidence.cadenceAssumed,
    labels,
    firstChargeDate: s.evidence.firstChargeDate,
    lastChargeDate: s.evidence.lastChargeDate,
    buried: false,
  };
}

function scanIdOf(now: Date): string {
  const stamp = now
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d+Z$/, "Z");
  return `scan-${stamp}-${randomBytes(3).toString("hex")}`;
}

/** The existing history file, as far as the skeleton needs it: tombstones and earlier scans. */
async function readExisting(
  path: string,
): Promise<{ tombstones: Tombstone[]; scans: ScanRecord[] }> {
  try {
    const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
    if (!isPlainObject(parsed)) return { tombstones: [], scans: [] };
    const tombstones = parsed["tombstones"];
    const scans = parsed["scans"];
    return {
      // Interim: the arrays are kept as read, without checking their records. Task 12 adds the
      // History codec that validates them; until then this file is only written by this skeleton.
      tombstones: Array.isArray(tombstones) ? (tombstones as Tombstone[]) : [],
      scans: Array.isArray(scans) ? (scans as ScanRecord[]) : [],
    };
  } catch {
    return { tombstones: [], scans: [] };
  }
}

export async function scanStatements(context: ToolContext): Promise<ToolResult<ScanSummary>> {
  const folder = await readStatementsFolder(context.dataDir);
  if (folder === null) return { ok: false, reason: "not-configured" };
  if (!(await folderExists(folder))) return { ok: false, reason: "folder-missing" };

  const entries = await readdir(folder, { withFileTypes: true });
  const names = entries
    .filter((e) => e.isFile() && !e.name.startsWith(".") && STATEMENT_NAME.test(e.name))
    .map((e) => e.name)
    .sort(compareCodeUnits)
    .slice(0, MAX_FILES);

  const skipped: Partial<Record<SkipKind, number>> = {};
  const skip = (kind: SkipKind): void => {
    skipped[kind] = (skipped[kind] ?? 0) + 1;
  };
  const transactions: NormalizedTransaction[] = [];
  let read = 0;
  for (const name of names) {
    const result = parseStatement(decodeUtf8(await readFile(join(folder, name))));
    if (result.status === "mapped") {
      read += 1;
      transactions.push(...normalizeTransactions(result.transactions));
    } else if (result.status === "mapping-required") skip("unknown-columns");
    else skip("parse-error");
  }
  if (read === 0) return { ok: false, reason: "no-statements" };

  const detection = detectSubscriptions(transactions);
  const { firstDate, lastDate } = detection.statement;
  if (firstDate === null || lastDate === null) return { ok: false, reason: "no-statements" };
  const active = detection.subscriptions.filter((s) => s.status === "active");
  const classified = classifySubscriptions(active, new Map());

  const undead = classified
    .map((s) => ({ s, entry: undeadEntryOf(s) }))
    .sort(
      (a, b) =>
        b.entry.yearlyCostCents - a.entry.yearlyCostCents ||
        compareCodeUnits(a.entry.name, b.entry.name) ||
        compareCodeUnits(a.s.id, b.s.id),
    );
  const undeadEntries = undead.map((u) => u.entry);
  const yearlyTotals = yearlyTotalsOf(undeadEntries);

  const now = context.now();
  const scanId = scanIdOf(now);
  const statementRange = { from: firstDate, to: lastDate };
  const trackedCharges: TrackedCharge[] = undead.map(({ s, entry }) => ({
    key: s.id,
    merchant: entry.name,
    serviceId: s.serviceId,
    currency: s.currency,
    cadence: s.cadence,
    merchantKey: s.merchantKey,
    amountCents: s.currentAmountCents,
    cadenceAssumed: s.evidence.cadenceAssumed,
    firstSeenScan: scanId,
    lastSeenScan: scanId,
    reportedRiseDate: s.priceRise?.latestRise?.date ?? null,
  }));

  const historyPath = join(context.dataDir, "history.json");
  const existing = await readExisting(historyPath);
  const record: ScanRecord = {
    scanId,
    scannedAt: now.toISOString(),
    statementRange,
    undeadCount: undeadEntries.length,
    yearlyTotals,
    newCount: 0,
    possessedCount: 0,
  };
  const history: History = {
    version: 1,
    coreSource: context.coreSource,
    trackedCharges,
    tombstones: existing.tombstones,
    scans: [...existing.scans, record],
    reportedTrials: [],
  };
  await mkdir(context.dataDir, { recursive: true, mode: 0o700 });
  const tmpPath = `${historyPath}.tmp-${process.pid}`;
  await writeFile(tmpPath, JSON.stringify(history), { mode: 0o600 });
  await rename(tmpPath, historyPath);

  const skippedTotal = Object.values(skipped).reduce((sum, n) => sum + n, 0);
  logCounts("scan", {
    read,
    skipped: skippedTotal,
    undead: undeadEntries.length,
    new: 0,
    possessed: 0,
  });

  const summary: ScanSummary = {
    scanId,
    firstScan: true,
    folderName: basename(folder),
    files: { read, skipped },
    statementRange,
    newUndead: [],
    possessed: [],
    trialTraps: [],
    risenAfterBurial: [],
    undead: undeadEntries,
    yearlyTotals,
    historyReset: false,
    historyDropped: 0,
  };
  return { ok: true, ...summary };
}
