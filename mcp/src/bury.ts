// Skeleton of `bury` (design "`bury`"). Task 18 replaces it with the locked, validated version.
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { foldName } from "../../shared/src/display-name.ts";
import { localDate } from "../../shared/src/local-date.ts";
import { CADENCE_FACTOR, moneyText } from "../../shared/src/money.ts";
import { refOf } from "../../shared/src/ref.ts";
import type {
  CancelDraft,
  Candidate,
  History,
  ScanRecord,
  ToolResult,
  Tombstone,
  TombstoneView,
  TrackedCharge,
} from "../../shared/src/types.ts";
import { cancelDraft } from "./cancel-draft.js";
import { logCounts } from "./log.js";
import type { ToolContext } from "./tools.js";

export interface BuryResult {
  tombstone: TombstoneView;
  cancel: CancelDraft;
  alreadyBuried: boolean;
}

function isHistory(value: unknown): value is History {
  // Interim check: this file is only written by the skeleton scan and bury. Task 12 adds the
  // History codec that validates every record.
  return (
    typeof value === "object" &&
    value !== null &&
    "version" in value &&
    value.version === 1 &&
    "trackedCharges" in value &&
    Array.isArray(value.trackedCharges) &&
    "tombstones" in value &&
    Array.isArray(value.tombstones) &&
    "scans" in value &&
    Array.isArray(value.scans)
  );
}

async function readHistory(path: string): Promise<History | null> {
  try {
    const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
    return isHistory(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function viewOf(t: Tombstone): TombstoneView {
  return {
    ref: refOf(t.key),
    name: t.name,
    serviceId: t.serviceId,
    currency: t.currency,
    cadence: t.cadence,
    amountCents: t.amountCents,
    cadenceAssumed: t.cadenceAssumed,
    yearlySavingCents: t.yearlySavingCents,
    buriedAt: t.buriedAt,
    risenReportedThrough: t.risenReportedThrough,
  };
}

function candidateOf(c: TrackedCharge): Candidate {
  return {
    name: c.merchant,
    amountText: moneyText(c.amountCents, c.currency),
    cadence: c.cadence,
  };
}

function resolve(text: string, charges: TrackedCharge[]): TrackedCharge[] {
  const q = foldName(text);
  if (q === "") return [];
  const byServiceId = charges.filter((c) => c.serviceId !== null && foldName(c.serviceId) === q);
  if (byServiceId.length > 0) return byServiceId;
  return charges.filter((c) => foldName(c.merchant) === q);
}

export async function bury(
  context: ToolContext,
  args: { service: string },
): Promise<ToolResult<BuryResult>> {
  const historyPath = join(context.dataDir, "history.json");
  const history = await readHistory(historyPath);
  const lastScan: ScanRecord | undefined = history?.scans[history.scans.length - 1];
  if (history === null || lastScan === undefined) return { ok: false, reason: "no-scan" };

  const current = history.trackedCharges.filter((c) => c.lastSeenScan === lastScan.scanId);
  const hits = resolve(args.service, current);
  if (hits.length === 0) {
    logCounts("bury", { found: 0, already: 0 });
    return { ok: false, reason: "not-found", candidates: [] };
  }
  const [t] = hits;
  if (t === undefined || hits.length > 1) {
    logCounts("bury", { found: hits.length, already: 0 });
    return { ok: false, reason: "ambiguous", candidates: hits.slice(0, 5).map(candidateOf) };
  }

  const existing = history.tombstones.find((tomb) => tomb.key === t.key);
  if (existing !== undefined) {
    logCounts("bury", { found: 1, already: 1 });
    return {
      ok: true,
      tombstone: viewOf(existing),
      cancel: cancelDraft(existing),
      alreadyBuried: true,
    };
  }

  const tombstone: Tombstone = {
    key: t.key,
    name: t.merchant,
    serviceId: t.serviceId,
    currency: t.currency,
    cadence: t.cadence,
    merchantKey: t.merchantKey,
    amountCents: t.amountCents,
    cadenceAssumed: t.cadenceAssumed,
    yearlySavingCents: t.cadenceAssumed ? null : t.amountCents * CADENCE_FACTOR[t.cadence],
    buriedAt: localDate(context.now(), context.timeZone),
    risenReportedThrough: null,
  };
  const next: History = { ...history, tombstones: [...history.tombstones, tombstone] };
  await mkdir(context.dataDir, { recursive: true, mode: 0o700 });
  const tmpPath = `${historyPath}.tmp-${process.pid}`;
  await writeFile(tmpPath, JSON.stringify(next), { mode: 0o600 });
  await rename(tmpPath, historyPath);

  logCounts("bury", { found: 1, already: 0 });
  return {
    ok: true,
    tombstone: viewOf(tombstone),
    cancel: cancelDraft(tombstone),
    alreadyBuried: false,
  };
}
