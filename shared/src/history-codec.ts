import type { Cadence } from "@zombills/core";
import { CADENCE_FACTOR } from "./money.ts";
import type { History, ScanRecord, TrackedCharge, Tombstone, YearlyTotals } from "./types.ts";

export type HistoryDecode =
  | { kind: "ok"; history: History; dropped: number }
  | { kind: "unreadable" }
  | { kind: "newer"; version: number };

export const LIMITS = { scans: 36, trackedCharges: 1000, tombstones: 1000, reportedTrials: 1000 };

const MAX_NAME_CODE_POINTS = 80;
const MAX_CORE_SOURCE_LENGTH = 64;
const CURRENCY = /^[A-Z]{3}$/u;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/u;
const DATE_TIME = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?Z$/u;

export function emptyHistory(): History {
  return {
    version: 1,
    coreSource: null,
    trackedCharges: [],
    tombstones: [],
    scans: [],
    reportedTrials: [],
  };
}

// ---------------------------------------------------------------------------
// Field readers. Every read goes through `own`, so a key that is only on the
// prototype chain is never seen, and nothing is ever copied from parsed JSON
// except through these checked values.

type Plain = Record<string, unknown>;

function isPlain(value: unknown): value is Plain {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function own(object: Plain, key: string): unknown {
  return Object.hasOwn(object, key) ? object[key] : undefined;
}

function isCents(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isLeap(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function isRealDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = DATE.exec(value);
  if (match === null) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const days = [31, isLeap(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= (days[month - 1] ?? 0);
}

function isIsoDateTime(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = DATE_TIME.exec(value);
  if (match === null || !isRealDate(match[1])) return false;
  return Number(match[2]) < 24 && Number(match[3]) < 60 && Number(match[4]) < 60;
}

function isCadence(value: unknown): value is Cadence {
  return value === "weekly" || value === "monthly" || value === "yearly";
}

function isCurrency(value: unknown): value is string {
  return typeof value === "string" && CURRENCY.test(value);
}

function isName(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && [...value].length <= MAX_NAME_CODE_POINTS;
}

function isText(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isNullOr<T>(value: unknown, check: (v: unknown) => v is T): value is T | null {
  return value === null || check(value);
}

// ---------------------------------------------------------------------------
// Record checks. Each returns a fresh object or null.

function readYearlyTotals(value: unknown): YearlyTotals | null {
  if (!isPlain(value)) return null;
  const result: YearlyTotals = {};
  for (const currency of Object.keys(value)) {
    if (!CURRENCY.test(currency)) return null;
    const entry = value[currency];
    if (!isPlain(entry)) return null;
    const yearlyCostCents = own(entry, "yearlyCostCents");
    const guessedCount = own(entry, "guessedCount");
    if (!isCents(yearlyCostCents) || !isCents(guessedCount)) return null;
    result[currency] = { yearlyCostCents, guessedCount };
  }
  return result;
}

function readTrackedCharge(raw: unknown): TrackedCharge | null {
  if (!isPlain(raw)) return null;
  const key = own(raw, "key");
  const merchant = own(raw, "merchant");
  const serviceId = own(raw, "serviceId");
  const currency = own(raw, "currency");
  const cadence = own(raw, "cadence");
  const merchantKey = own(raw, "merchantKey");
  const amountCents = own(raw, "amountCents");
  const cadenceAssumed = own(raw, "cadenceAssumed");
  const firstSeenScan = own(raw, "firstSeenScan");
  const lastSeenScan = own(raw, "lastSeenScan");
  const reportedRiseDate = own(raw, "reportedRiseDate");
  if (
    !isText(key) ||
    !isName(merchant) ||
    !isNullOr(serviceId, isText) ||
    !isCurrency(currency) ||
    !isCadence(cadence) ||
    typeof merchantKey !== "string" ||
    !isCents(amountCents) ||
    typeof cadenceAssumed !== "boolean" ||
    typeof firstSeenScan !== "string" ||
    typeof lastSeenScan !== "string" ||
    !isNullOr(reportedRiseDate, isRealDate)
  ) {
    return null;
  }
  return {
    key,
    merchant,
    serviceId,
    currency,
    cadence,
    merchantKey,
    amountCents,
    cadenceAssumed,
    firstSeenScan,
    lastSeenScan,
    reportedRiseDate,
  };
}

function readTombstone(raw: unknown): Tombstone | null {
  if (!isPlain(raw)) return null;
  const key = own(raw, "key");
  const name = own(raw, "name");
  const serviceId = own(raw, "serviceId");
  const currency = own(raw, "currency");
  const cadence = own(raw, "cadence");
  const merchantKey = own(raw, "merchantKey");
  const amountCents = own(raw, "amountCents");
  const cadenceAssumed = own(raw, "cadenceAssumed");
  const yearlySavingCents = own(raw, "yearlySavingCents");
  const buriedAt = own(raw, "buriedAt");
  const risenReportedThrough = own(raw, "risenReportedThrough");
  if (
    !isText(key) ||
    !isName(name) ||
    !isNullOr(serviceId, isText) ||
    !isCurrency(currency) ||
    !isCadence(cadence) ||
    typeof merchantKey !== "string" ||
    !isCents(amountCents) ||
    typeof cadenceAssumed !== "boolean" ||
    !isRealDate(buriedAt) ||
    !isNullOr(risenReportedThrough, isRealDate)
  ) {
    return null;
  }
  const expected = cadenceAssumed ? null : amountCents * CADENCE_FACTOR[cadence];
  if (yearlySavingCents !== expected) return null;
  return {
    key,
    name,
    serviceId,
    currency,
    cadence,
    merchantKey,
    amountCents,
    cadenceAssumed,
    yearlySavingCents: expected,
    buriedAt,
    risenReportedThrough,
  };
}

function readScanRecord(raw: unknown): ScanRecord | null {
  if (!isPlain(raw)) return null;
  const scanId = own(raw, "scanId");
  const scannedAt = own(raw, "scannedAt");
  const range = own(raw, "statementRange");
  const undeadCount = own(raw, "undeadCount");
  const yearlyTotals = readYearlyTotals(own(raw, "yearlyTotals"));
  const newCount = own(raw, "newCount");
  const possessedCount = own(raw, "possessedCount");
  if (!isText(scanId) || !isIsoDateTime(scannedAt) || !isPlain(range)) return null;
  const from = own(range, "from");
  const to = own(range, "to");
  if (!isRealDate(from) || !isRealDate(to)) return null;
  if (!isCents(undeadCount) || !isCents(newCount) || !isCents(possessedCount)) return null;
  if (yearlyTotals === null) return null;
  return {
    scanId,
    scannedAt,
    statementRange: { from, to },
    undeadCount,
    yearlyTotals,
    newCount,
    possessedCount,
  };
}

// ---------------------------------------------------------------------------
// Duplicates and limits.

/** Keeps the first record per id; returns the kept records and how many were dropped. */
function dedupe<T>(records: T[], id: (record: T) => string): { kept: T[]; dropped: number } {
  const seen = new Set<string>();
  const kept: T[] = [];
  for (const record of records) {
    const value = id(record);
    if (seen.has(value)) continue;
    seen.add(value);
    kept.push(record);
  }
  return { kept, dropped: records.length - kept.length };
}

/** The `max` records with the highest rank, in their original order; ties favour earlier ones. */
function keepTop<T>(records: T[], max: number, rank: (record: T) => number | string): T[] {
  if (records.length <= max) return records;
  const order = records.map((record, index) => ({ record, index, rank: rank(record) }));
  order.sort((a, b) => (a.rank < b.rank ? 1 : a.rank > b.rank ? -1 : a.index - b.index));
  return order
    .slice(0, max)
    .sort((a, b) => a.index - b.index)
    .map((entry) => entry.record);
}

function applyLimits(history: History): History {
  const scans = history.scans.slice(-LIMITS.scans);
  const position = new Map<string, number>();
  scans.forEach((scan, index) => position.set(scan.scanId, index));
  return {
    version: 1,
    coreSource: history.coreSource,
    trackedCharges: keepTop(
      history.trackedCharges,
      LIMITS.trackedCharges,
      (charge) => position.get(charge.lastSeenScan) ?? -1,
    ),
    tombstones: keepTop(history.tombstones, LIMITS.tombstones, (stone) => stone.buriedAt),
    scans,
    reportedTrials: history.reportedTrials.slice(-LIMITS.reportedTrials),
  };
}

// ---------------------------------------------------------------------------

function readRecords<T>(
  items: unknown[],
  read: (raw: unknown) => T | null,
): {
  records: T[];
  dropped: number;
} {
  const records: T[] = [];
  for (const item of items) {
    const record = read(item);
    if (record !== null) records.push(record);
  }
  return { records, dropped: items.length - records.length };
}

function readTrial(raw: unknown): string | null {
  return isText(raw) ? raw : null;
}

function decodeParsed(parsed: unknown): HistoryDecode {
  if (!isPlain(parsed)) return { kind: "unreadable" };
  const version = own(parsed, "version");
  if (typeof version !== "number" || !Number.isSafeInteger(version) || version < 1) {
    return { kind: "unreadable" };
  }
  if (version > 1) return { kind: "newer", version };
  const coreSource = own(parsed, "coreSource");
  const trackedRaw = own(parsed, "trackedCharges");
  const tombstonesRaw = own(parsed, "tombstones");
  const scansRaw = own(parsed, "scans");
  const trialsRaw = own(parsed, "reportedTrials");
  if (
    !(
      coreSource === null ||
      (typeof coreSource === "string" && coreSource.length <= MAX_CORE_SOURCE_LENGTH)
    ) ||
    !Array.isArray(trackedRaw) ||
    !Array.isArray(tombstonesRaw) ||
    !Array.isArray(scansRaw) ||
    !Array.isArray(trialsRaw)
  ) {
    return { kind: "unreadable" };
  }
  const tracked = readRecords(trackedRaw, readTrackedCharge);
  const stones = readRecords(tombstonesRaw, readTombstone);
  const scans = readRecords(scansRaw, readScanRecord);
  const trials = readRecords(trialsRaw, readTrial);
  const trackedUnique = dedupe(tracked.records, (charge) => charge.key);
  const stonesUnique = dedupe(stones.records, (stone) => stone.key);
  const scansUnique = dedupe(scans.records, (scan) => scan.scanId);
  const trialsUnique = dedupe(trials.records, (key) => key);
  const dropped =
    tracked.dropped +
    stones.dropped +
    scans.dropped +
    trials.dropped +
    trackedUnique.dropped +
    stonesUnique.dropped +
    scansUnique.dropped +
    trialsUnique.dropped;
  const history = applyLimits({
    version: 1,
    coreSource,
    trackedCharges: trackedUnique.kept,
    tombstones: stonesUnique.kept,
    scans: scansUnique.kept,
    reportedTrials: trialsUnique.kept,
  });
  return { kind: "ok", history, dropped };
}

/** Total: never throws (Req 7.10). */
export function decodeHistory(text: string): HistoryDecode {
  try {
    return decodeParsed(JSON.parse(text) as unknown);
  } catch {
    return { kind: "unreadable" };
  }
}

export function encodeHistory(history: History): string {
  return JSON.stringify(applyLimits(history)) + "\n";
}
