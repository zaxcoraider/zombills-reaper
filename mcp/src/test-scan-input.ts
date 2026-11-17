// Test helper for the scan diff: runs Core in memory on small CSV texts and calls `diffScan`.
import { detectSubscriptions, normalizeTransactions, parseStatement } from "@zombills/core";
import type { Subscription } from "@zombills/core";
import { emptyHistory } from "../../shared/src/history-codec.ts";
import type { History } from "../../shared/src/types.ts";
import { mergeOverlap } from "./merge-transactions.js";
import { diffScan } from "./scan-diff.js";
import type { DiffInput, DiffResult } from "./scan-diff.js";

export interface TestSeries {
  description: string;
  /** `yyyy-mm` of each charge, in order. */
  months: string[];
  /** Amount text of each charge (`"15.49"`), one per month. */
  amounts: string[];
  day?: string;
}

/** `yyyy-mm` for `count` months from `start` (`yyyy-mm`). */
export function monthsFrom(start: string, count: number): string[] {
  const [year = 2026, month = 1] = start.split("-").map(Number);
  return Array.from({ length: count }, (_, i) => {
    const index = year * 12 + (month - 1) + i;
    const y = Math.floor(index / 12);
    const m = (index % 12) + 1;
    return `${y}-${String(m).padStart(2, "0")}`;
  });
}

/** A series with one amount for every month. */
export function flat(
  description: string,
  start: string,
  count: number,
  amount: string,
): TestSeries {
  return {
    description,
    months: monthsFrom(start, count),
    amounts: Array.from({ length: count }, () => amount),
  };
}

/** One CSV text in the round-1 format with the rows of every series. */
export function csvOf(series: TestSeries[]): string {
  const rows: string[] = [];
  for (const s of series) {
    s.months.forEach((month, i) => {
      rows.push(`${month}-${s.day ?? "10"},${s.description},${s.amounts[i] ?? "0.00"}`);
    });
  }
  rows.sort();
  return ["Date,Description,Amount", ...rows].join("\n") + "\n";
}

/** Core's subscriptions (active and ended) for the given CSV texts, as the scan builds them. */
export function subsOf(texts: string[]): Subscription[] {
  const perFile = texts.map((text) => {
    const parsed = parseStatement(text);
    if (parsed.status !== "mapped") throw new Error("test CSV did not parse");
    return normalizeTransactions(parsed.transactions);
  });
  return detectSubscriptions(mergeOverlap(perFile)).subscriptions;
}

export const TEST_CORE_SOURCE = "a".repeat(40);

/** Runs `diffScan` with defaults for everything the tests do not care about. */
export function runDiff(
  subs: Subscription[],
  history: History = emptyHistory(),
  over: Partial<DiffInput> = {},
): DiffResult {
  return diffScan({
    subs,
    history,
    coreSource: TEST_CORE_SOURCE,
    scanId: "scan-20260701T000000Z-000001",
    now: new Date("2026-07-01T00:00:00.000Z"),
    folderName: "statements",
    files: { read: 1, skipped: {} },
    statementRange: { from: "2026-01-01", to: "2026-06-30" },
    historyReset: false,
    historyDropped: 0,
    ...over,
  });
}
