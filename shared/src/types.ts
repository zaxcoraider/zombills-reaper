import type { Cadence } from "@zombills/core";

export type ReaperLabel = "possessed" | "trial-trap";

export interface Settings {
  version: 1;
  statementsFolder: string; // absolute path; never logged or returned
}

export interface TrackedCharge {
  key: string; // Core subscription id last matched
  merchant: string; // Display name, at most 80 code points
  serviceId: string | null;
  currency: string; // ISO 4217
  cadence: Cadence;
  merchantKey: string;
  amountCents: number; // current amount at the last match
  cadenceAssumed: boolean;
  firstSeenScan: string; // scanId
  lastSeenScan: string; // scanId
  reportedRiseDate: string | null; // latestRise.date last reported
}

export interface Tombstone {
  key: string;
  name: string; // Display name
  serviceId: string | null;
  currency: string;
  cadence: Cadence;
  merchantKey: string; // needed for the Triple in Match pass 2
  amountCents: number;
  cadenceAssumed: boolean;
  yearlySavingCents: number | null; // null when cadenceAssumed
  buriedAt: string; // local date
  risenReportedThrough: string | null;
}

export type YearlyTotals = Record<string, { yearlyCostCents: number; guessedCount: number }>;

export interface ScanRecord {
  scanId: string; // "scan-<yyyymmddThhmmssZ>-<6 hex>"
  scannedAt: string;
  statementRange: { from: string; to: string };
  undeadCount: number;
  yearlyTotals: YearlyTotals;
  newCount: number;
  possessedCount: number;
}

export interface History {
  version: 1;
  coreSource: string | null; // SOURCE line 1 of the last scan
  trackedCharges: TrackedCharge[];
  tombstones: Tombstone[];
  scans: ScanRecord[]; // oldest first
  reportedTrials: string[]; // keys
}

export type Reason =
  | "not-configured"
  | "folder-missing"
  | "no-statements"
  | "history-unreadable"
  | "history-newer"
  | "history-busy"
  | "not-absolute"
  | "not-found"
  | "not-a-folder"
  | "not-readable"
  | "inside-app"
  | "no-scan"
  | "ambiguous"
  | "internal-error";

export type ToolResult<T> =
  ({ ok: true } & T) | { ok: false; reason: Reason; candidates?: Candidate[] };

export type SkipKind =
  | "too-large"
  | "unreadable"
  | "unknown-columns"
  | "empty"
  | "parse-error"
  | "ambiguous-dates"
  | "too-many";

export interface UndeadEntry {
  ref: string;
  name: string;
  serviceId: string | null;
  currency: string;
  cadence: Cadence;
  amountCents: number;
  yearlyCostCents: number;
  cadenceAssumed: boolean;
  labels: ReaperLabel[];
  firstChargeDate: string;
  lastChargeDate: string;
  buried: boolean;
}

export interface PossessedEntry {
  ref: string;
  name: string;
  currency: string;
  cadence: Cadence;
  fromAmountCents: number;
  toAmountCents: number;
  increasePerYearCents: number;
}

export interface TrialTrapEntry {
  ref: string;
  name: string;
  currency: string;
  cadence: Cadence;
  amountCents: number;
  firstFullChargeDate: string;
}

export interface RisenEntry {
  ref: string;
  name: string;
  currency: string;
  amountCents: number;
  buriedAt: string;
  lastChargeDate: string;
}

/** A Tombstone as tools and the backend return it: no key, no merchantKey. */
export type TombstoneView = Omit<Tombstone, "key" | "merchantKey"> & { ref: string };

export interface ScanSummary {
  scanId: string;
  firstScan: boolean;
  folderName: string;
  files: { read: number; skipped: Partial<Record<SkipKind, number>> };
  statementRange: { from: string; to: string };
  newUndead: UndeadEntry[];
  possessed: PossessedEntry[];
  trialTraps: TrialTrapEntry[];
  risenAfterBurial: RisenEntry[];
  undead: UndeadEntry[];
  yearlyTotals: YearlyTotals;
  historyReset: boolean;
  historyDropped: number;
}

export interface Candidate {
  name: string;
  amountText: string;
  cadence: Cadence;
}

export type CancelDraft =
  | { kind: "link"; url: string; host: string; steps: string[]; appStoreMayApply: boolean }
  | { kind: "email"; subject: string; body: string; mailto: string };

export interface GraveyardMonth {
  month: string; // "yyyy-mm"
  undeadCount: number | null;
  yearlyTotals: YearlyTotals | null;
  buriedCount: number;
  cumulativeSavings: Record<string, { yearlySavingCents: number; guessedCount: number }>;
}

export interface GraveyardView {
  tombstones: TombstoneView[]; // newest buriedAt first, then name, then key (key not returned)
  savings: Record<string, { yearlySavingCents: number; guessedCount: number }>;
  months: GraveyardMonth[];
}

export interface GraveyardResponse extends GraveyardView {
  lastScan: Pick<
    ScanRecord,
    "scannedAt" | "statementRange" | "undeadCount" | "yearlyTotals"
  > | null;
}
