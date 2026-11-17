// Match of subscriptions to stored records (design "Scan algorithm" step 9). Generic over Tracked
// charges and Tombstones; `bury` also calls it with a one-element list built from a Tracked charge.

/** The part of a Core subscription that matching reads. */
export interface MatchSub {
  id: string;
  status?: string;
  currency: string;
  cadence: string;
  merchantKey: string;
  priceHistory: { amountCents: number }[];
  evidence: { cadenceAssumed: boolean };
}

/** The part of a Tracked charge or Tombstone that matching reads. Only Tracked charges have `lastSeenScan`. */
export interface MatchRecord {
  key: string;
  currency: string;
  cadence: string;
  merchantKey: string;
  amountCents: number;
  cadenceAssumed: boolean;
  lastSeenScan?: string;
}

export interface MatchResult<S extends MatchSub, R extends MatchRecord> {
  pairs: Map<string, R>;
  unmatchedSubs: S[];
  unmatchedRecords: R[];
  blocked: Set<string>;
}

const compareText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

const tripleOf = (x: { currency: string; cadence: string; merchantKey: string }): string =>
  JSON.stringify([x.currency, x.cadence, x.merchantKey]);

function qualifies(s: MatchSub, r: MatchRecord): boolean {
  return (
    s.currency === r.currency &&
    s.cadence === r.cadence &&
    s.merchantKey === r.merchantKey &&
    s.priceHistory.some((p) => p.amountCents === r.amountCents) &&
    (!s.evidence.cadenceAssumed || r.cadenceAssumed)
  );
}

export function matchRecords<S extends MatchSub, R extends MatchRecord>(
  subs: readonly S[],
  records: readonly R[],
  previousScanId: string | null,
): MatchResult<S, R> {
  const orderedSubs = [...subs].sort((a, b) => compareText(a.id, b.id));
  const orderedRecords = [...records].sort((a, b) => compareText(a.key, b.key));
  const pairs = new Map<string, R>();
  const takenKeys = new Set<string>();

  // Pass 1: by key.
  const byKey = new Map<string, R>();
  for (const r of orderedRecords) byKey.set(r.key, r);
  for (const s of orderedSubs) {
    const r = byKey.get(s.id);
    if (r !== undefined && !takenKeys.has(r.key)) {
      pairs.set(s.id, r);
      takenKeys.add(r.key);
    }
  }

  // Pass 2: the full qualifying relation over what is left, then mutually unique pairs only.
  const leftSubs = orderedSubs.filter((s) => !pairs.has(s.id));
  const leftRecords = orderedRecords.filter((r) => !takenKeys.has(r.key));
  const forSub = new Map<string, R[]>();
  const forRecord = new Map<string, S[]>();
  for (const s of leftSubs) {
    for (const r of leftRecords) {
      if (!qualifies(s, r)) continue;
      forSub.set(s.id, [...(forSub.get(s.id) ?? []), r]);
      forRecord.set(r.key, [...(forRecord.get(r.key) ?? []), s]);
    }
  }
  for (const s of leftSubs) {
    const candidates = forSub.get(s.id);
    const only = candidates?.length === 1 ? candidates[0] : undefined;
    if (only === undefined) continue;
    if (forRecord.get(only.key)?.length === 1) {
      pairs.set(s.id, only);
      takenKeys.add(only.key);
    }
  }

  const unmatchedSubs = orderedSubs.filter((s) => !pairs.has(s.id));
  const unmatchedRecords = orderedRecords.filter((r) => !takenKeys.has(r.key));

  // Blocking records: a Tracked charge seen in the previous scan, or a Tombstone left by ambiguity.
  const blockingTriples = new Set<string>();
  for (const r of unmatchedRecords) {
    const blocks =
      r.lastSeenScan === undefined
        ? forRecord.has(r.key)
        : previousScanId !== null && r.lastSeenScan === previousScanId;
    if (blocks) blockingTriples.add(tripleOf(r));
  }
  const blocked = new Set<string>();
  for (const s of unmatchedSubs) {
    if (s.status === "active" && blockingTriples.has(tripleOf(s))) blocked.add(s.id);
  }

  return { pairs, unmatchedSubs, unmatchedRecords, blocked };
}
