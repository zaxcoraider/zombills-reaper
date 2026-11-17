// `bury` (design "`bury`"): resolves the service text against the Current charges, checks the
// Tombstones through `matchRecords`, and writes one Tombstone under the lock.
import { localDate } from "../../shared/src/local-date.ts";
import { CADENCE_FACTOR, moneyText } from "../../shared/src/money.ts";
import { refOf } from "../../shared/src/ref.ts";
import type {
  CancelDraft,
  Candidate,
  ScanRecord,
  ToolResult,
  Tombstone,
  TombstoneView,
  TrackedCharge,
} from "../../shared/src/types.ts";
import type { Cadence } from "@zombills/core";
import { cancelDraft } from "./cancel-draft.js";
import { ensureDataDir } from "./data-files.js";
import { withHistoryLock } from "./history-lock.js";
import { loadHistoryForWrite, saveHistory } from "./history-store.js";
import { logCounts } from "./log.js";
import { matchRecords } from "./match.js";
import { resolveService } from "./resolve-service.js";
import type { ToolContext } from "./tools.js";

export interface BuryResult {
  tombstone: TombstoneView;
  cancel: CancelDraft;
  alreadyBuried: boolean;
  /** Set only when this call's own load reset or dropped records (Req 7.3). */
  historyReset?: true;
  historyDropped?: number;
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

export function candidateOf(c: {
  merchant: string;
  amountCents: number;
  currency: string;
  cadence: Cadence;
}): Candidate {
  return {
    name: c.merchant,
    amountText: moneyText(c.amountCents, c.currency),
    cadence: c.cadence,
  };
}

/** Tracked charges seen in the last scan (design "Current charges"). */
export function currentCharges(history: {
  scans: ScanRecord[];
  trackedCharges: TrackedCharge[];
}): TrackedCharge[] {
  const last = history.scans[history.scans.length - 1];
  if (last === undefined) return [];
  return history.trackedCharges.filter((c) => c.lastSeenScan === last.scanId);
}

export async function bury(
  context: ToolContext,
  args: { service: string },
): Promise<ToolResult<BuryResult>> {
  await ensureDataDir(context.dataDir);
  const result = await withHistoryLock(
    context.dataDir,
    async (): Promise<ToolResult<BuryResult>> => {
      const loaded = await loadHistoryForWrite(context.dataDir, context.now());
      if ("error" in loaded) return { ok: false, reason: loaded.error };
      const { history } = loaded;
      const notes: Pick<BuryResult, "historyReset" | "historyDropped"> = {
        ...(loaded.reset ? { historyReset: true as const } : {}),
        ...(loaded.dropped > 0 ? { historyDropped: loaded.dropped } : {}),
      };
      const lastScan: ScanRecord | undefined = history.scans[history.scans.length - 1];
      if (lastScan === undefined) return { ok: false, reason: "no-scan" };

      const resolution = resolveService(args.service, currentCharges(history));
      if (resolution.kind !== "one") {
        const found = resolution.kind === "several" ? resolution.candidates.length : 0;
        logCounts("bury", { found, already: 0 });
        return {
          ok: false,
          reason: resolution.kind === "several" ? "ambiguous" : "not-found",
          candidates: resolution.candidates.map(candidateOf),
        };
      }
      const t = resolution.entry;

      const asSub = {
        id: t.key,
        currency: t.currency,
        cadence: t.cadence,
        merchantKey: t.merchantKey,
        priceHistory: [{ amountCents: t.amountCents }],
        evidence: { cadenceAssumed: t.cadenceAssumed },
      };
      const tombMatch = matchRecords([asSub], history.tombstones, lastScan.scanId);
      const existing = tombMatch.pairs.get(t.key);
      if (existing !== undefined) {
        logCounts("bury", { found: 1, already: 1 });
        return {
          ok: true,
          tombstone: viewOf(existing),
          cancel: cancelDraft(existing),
          alreadyBuried: true,
          ...notes,
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
      await saveHistory(context.dataDir, {
        ...history,
        tombstones: [...history.tombstones, tombstone],
      });

      logCounts("bury", { found: 1, already: 0 });
      return {
        ok: true,
        tombstone: viewOf(tombstone),
        cancel: cancelDraft(tombstone),
        alreadyBuried: false,
        ...notes,
      };
    },
    context.lock?.timings,
    context.lock?.clock,
  );
  return result;
}
