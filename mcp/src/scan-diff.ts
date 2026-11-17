// The pure part of a scan (design "Scan algorithm" steps 8 to 11): from Core's subscriptions and the
// History before the scan, build the Scan summary and the next History. No file, clock or random value
// is read here; the caller passes `scanId` and `now`.
import { classifySubscriptions } from "@zombills/core";
import type { ClassifiedSubscription, Subscription } from "@zombills/core";
import { displayName } from "../../shared/src/display-name.ts";
import { CADENCE_FACTOR } from "../../shared/src/money.ts";
import { refOf } from "../../shared/src/ref.ts";
import type {
  History,
  PossessedEntry,
  ReaperLabel,
  RisenEntry,
  ScanRecord,
  ScanSummary,
  SkipKind,
  Tombstone,
  TrackedCharge,
  TrialTrapEntry,
  UndeadEntry,
  YearlyTotals,
} from "../../shared/src/types.ts";
import { matchRecords } from "./match.js";

/** A buried service is reported as still charging only when its last charge is later than this many days. */
const POSTING_LAG_DAYS = 3;
const MS_PER_DAY = 86_400_000;

export interface DiffInput {
  /** Every Core subscription, active and ended. */
  subs: readonly Subscription[];
  history: History;
  coreSource: string;
  scanId: string;
  now: Date;
  folderName: string;
  files: { read: number; skipped: Partial<Record<SkipKind, number>> };
  statementRange: { from: string; to: string };
  historyReset: boolean;
  historyDropped: number;
}

export interface DiffResult {
  summary: ScanSummary;
  nextHistory: History;
}

const compareText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Calendar days from `a` to `b` (ISO dates), counted with `Date.UTC` so no time zone enters. */
export function daysBetween(a: string, b: string): number {
  const toUtc = (iso: string): number => {
    const [year, month, day] = iso.split("-").map(Number);
    return Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1);
  };
  return Math.round((toUtc(b) - toUtc(a)) / MS_PER_DAY);
}

/** Per currency: the sum of non-guessed yearly costs, and how many guessed entries were left out. */
export function yearlyTotalsOf(
  entries: readonly Pick<UndeadEntry, "currency" | "cadenceAssumed" | "yearlyCostCents">[],
): YearlyTotals {
  const totals: YearlyTotals = {};
  for (const entry of entries) {
    const total = (totals[entry.currency] ??= { yearlyCostCents: 0, guessedCount: 0 });
    if (entry.cadenceAssumed) total.guessedCount += 1;
    else total.yearlyCostCents += entry.yearlyCostCents;
  }
  return totals;
}

function undeadEntryOf(s: ClassifiedSubscription, buried: boolean): UndeadEntry {
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
    buried,
  };
}

export function diffScan(input: DiffInput): DiffResult {
  const { subs, history, scanId } = input;

  // Step 8: re-baseline check.
  const rebaseline = history.scans.length > 0 && history.coreSource !== input.coreSource;
  const firstScan = history.scans.length === 0 || rebaseline;
  const previousScanId = history.scans[history.scans.length - 1]?.scanId ?? null;

  // Step 9: match over all subscriptions, active and ended.
  const tombMatch = matchRecords(subs, history.tombstones, previousScanId);
  const trackMatch = matchRecords(subs, rebaseline ? [] : history.trackedCharges, previousScanId);
  const blocked = new Set<string>([...tombMatch.blocked, ...trackMatch.blocked]);

  // Step 10: classify and diff.
  const active = subs.filter((s) => s.status === "active");
  const answers = new Map<string, "not-using">();
  for (const s of active) if (tombMatch.pairs.has(s.id)) answers.set(s.id, "not-using");
  const classified = classifySubscriptions(active, answers);

  const rows = classified
    .map((s) => ({ s, entry: undeadEntryOf(s, tombMatch.pairs.has(s.id)) }))
    .sort(
      (a, b) =>
        b.entry.yearlyCostCents - a.entry.yearlyCostCents ||
        compareText(a.entry.name, b.entry.name) ||
        compareText(a.s.id, b.s.id),
    );
  const undead = rows.map((r) => r.entry);

  const reportedTrials = new Set(history.reportedTrials);
  const newUndead: UndeadEntry[] = [];
  const possessed: PossessedEntry[] = [];
  const trialTraps: TrialTrapEntry[] = [];
  const risenAfterBurial: RisenEntry[] = [];
  /** Tracked charge key to the rise date this scan reports for it. */
  const reportedRise = new Map<string, string>();
  /** Tombstone key to the last charge date this scan reports as risen. */
  const reportedRisen = new Map<string, string>();
  const reportedTrialIds: string[] = [];

  for (const { s, entry } of rows) {
    const isBlocked = blocked.has(s.id);
    const track = trackMatch.pairs.get(s.id);
    const tomb = tombMatch.pairs.get(s.id);

    if (!firstScan && track === undefined && tomb === undefined && !isBlocked) {
      newUndead.push(entry);
    }

    const rise = s.priceRise?.latestRise ?? null;
    if (
      !firstScan &&
      track !== undefined &&
      !isBlocked &&
      rise !== null &&
      (track.reportedRiseDate === null || rise.date > track.reportedRiseDate)
    ) {
      possessed.push({
        ref: entry.ref,
        name: entry.name,
        currency: s.currency,
        cadence: s.cadence,
        fromAmountCents: rise.fromAmountCents,
        toAmountCents: rise.toAmountCents,
        increasePerYearCents:
          (rise.toAmountCents - rise.fromAmountCents) * CADENCE_FACTOR[s.cadence],
      });
      reportedRise.set(track.key, rise.date);
    }

    if (
      !firstScan &&
      !isBlocked &&
      s.trial !== null &&
      entry.labels.includes("trial-trap") &&
      !reportedTrials.has(s.id)
    ) {
      trialTraps.push({
        ref: entry.ref,
        name: entry.name,
        currency: s.currency,
        cadence: s.cadence,
        amountCents: s.currentAmountCents,
        firstFullChargeDate: s.trial.firstFullCharge.date,
      });
      reportedTrialIds.push(s.id);
    }

    if (
      tomb !== undefined &&
      !isBlocked &&
      daysBetween(tomb.buriedAt, s.evidence.lastChargeDate) > POSTING_LAG_DAYS &&
      (tomb.risenReportedThrough === null || s.evidence.lastChargeDate > tomb.risenReportedThrough)
    ) {
      risenAfterBurial.push({
        ref: entry.ref,
        name: entry.name,
        currency: s.currency,
        amountCents: s.currentAmountCents,
        buriedAt: tomb.buriedAt,
        lastChargeDate: s.evidence.lastChargeDate,
      });
      reportedRisen.set(tomb.key, s.evidence.lastChargeDate);
    }
  }

  const yearlyTotals = yearlyTotalsOf(undead);

  // Step 11: the next History.
  const classifiedById = new Map(rows.map((r) => [r.s.id, r] as const));
  const subById = new Map(subs.map((s) => [s.id, s] as const));
  const subOfTracked = new Map<string, Subscription>();
  for (const [subId, record] of trackMatch.pairs) {
    const s = subById.get(subId);
    if (s !== undefined) subOfTracked.set(record.key, s);
  }
  const subOfTomb = new Map<string, Subscription>();
  for (const [subId, record] of tombMatch.pairs) {
    const s = subById.get(subId);
    if (s !== undefined) subOfTomb.set(record.key, s);
  }

  const keptTracked: TrackedCharge[] = rebaseline ? [] : history.trackedCharges;
  const trackedCharges: TrackedCharge[] = keptTracked.map((t) => {
    const s = subOfTracked.get(t.key);
    if (s === undefined) return t;
    const row = classifiedById.get(s.id);
    if (s.status !== "active" || row === undefined) return { ...t, key: s.id };
    const rise = row.s.priceRise?.latestRise ?? null;
    const reportedRiseDate =
      reportedRise.get(t.key) ?? (firstScan ? (rise?.date ?? null) : t.reportedRiseDate);
    return {
      ...t,
      key: s.id,
      merchant: row.entry.name,
      amountCents: s.currentAmountCents,
      cadenceAssumed: s.evidence.cadenceAssumed,
      lastSeenScan: scanId,
      reportedRiseDate,
    };
  });
  for (const { s, entry } of rows) {
    if (trackMatch.pairs.has(s.id) || blocked.has(s.id)) continue;
    trackedCharges.push({
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
    });
  }

  const tombstones: Tombstone[] = history.tombstones.map((b) => {
    const s = subOfTomb.get(b.key);
    if (s === undefined) return b;
    const through = reportedRisen.get(b.key);
    return { ...b, key: s.id, ...(through === undefined ? {} : { risenReportedThrough: through }) };
  });

  const nextTrials = [...history.reportedTrials];
  const seenTrials = new Set(nextTrials);
  const addTrial = (id: string): void => {
    if (seenTrials.has(id)) return;
    seenTrials.add(id);
    nextTrials.push(id);
  };
  reportedTrialIds.forEach(addTrial);
  if (firstScan) {
    for (const { s, entry } of rows) if (entry.labels.includes("trial-trap")) addTrial(s.id);
  }

  const record: ScanRecord = {
    scanId,
    scannedAt: input.now.toISOString(),
    statementRange: input.statementRange,
    undeadCount: undead.length,
    yearlyTotals,
    newCount: newUndead.length,
    possessedCount: possessed.length,
  };

  const nextHistory: History = {
    version: 1,
    coreSource: input.coreSource,
    trackedCharges,
    tombstones,
    scans: [...history.scans, record],
    reportedTrials: nextTrials,
  };

  const summary: ScanSummary = {
    scanId,
    firstScan,
    folderName: input.folderName,
    files: input.files,
    statementRange: input.statementRange,
    newUndead,
    possessed,
    trialTraps,
    risenAfterBurial,
    undead,
    yearlyTotals,
    historyReset: input.historyReset,
    historyDropped: input.historyDropped,
  };
  return { summary, nextHistory };
}
