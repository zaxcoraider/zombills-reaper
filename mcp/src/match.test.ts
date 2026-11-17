import { describe, expect, it } from "vitest";
import { matchRecords } from "./match.js";
import type { MatchRecord, MatchSub } from "./match.js";

function sub(
  id: string,
  over: Partial<MatchSub> & { amounts?: number[]; assumed?: boolean } = {},
): MatchSub {
  return {
    id,
    status: over.status ?? "active",
    currency: over.currency ?? "USD",
    cadence: over.cadence ?? "monthly",
    merchantKey: over.merchantKey ?? "netflix",
    priceHistory: (over.amounts ?? [1549]).map((amountCents) => ({ amountCents })),
    evidence: { cadenceAssumed: over.assumed ?? false },
  };
}

function rec(key: string, over: Partial<MatchRecord> = {}): MatchRecord {
  return {
    key,
    currency: "USD",
    cadence: "monthly",
    merchantKey: "netflix",
    amountCents: 1549,
    cadenceAssumed: false,
    ...over,
  };
}

describe("matchRecords", () => {
  it("pass 1 by key wins over pass 2", () => {
    const subs = [sub("a"), sub("b")];
    const records = [rec("b"), rec("zzz")];
    const result = matchRecords(subs, records, null);
    expect(result.pairs.get("b")?.key).toBe("b");
    // "a" qualifies only for "zzz" after pass 1, and "zzz" only for "a": mutually unique.
    expect(result.pairs.get("a")?.key).toBe("zzz");
    expect(result.unmatchedRecords).toEqual([]);
  });

  it("a price change keeps the pair through priceHistory", () => {
    const result = matchRecords([sub("new-id", { amounts: [1549, 1799] })], [rec("old-id")], null);
    expect(result.pairs.get("new-id")?.key).toBe("old-id");
    expect(result.unmatchedSubs).toEqual([]);
  });

  it("two subscriptions qualifying for one record leave all three unmatched and both blocked", () => {
    const result = matchRecords([sub("a"), sub("b")], [rec("old", { lastSeenScan: "s1" })], "s0");
    expect(result.pairs.size).toBe(0);
    expect(result.unmatchedSubs.map((s) => s.id)).toEqual(["a", "b"]);
    expect(result.unmatchedRecords.map((r) => r.key)).toEqual(["old"]);
    expect([...result.blocked].sort()).toEqual([]);
    const tomb = matchRecords([sub("a"), sub("b")], [rec("old")], null);
    expect(tomb.pairs.size).toBe(0);
    expect([...tomb.blocked].sort()).toEqual(["a", "b"]);
  });

  it("two records qualifying for one subscription leave all unmatched", () => {
    const result = matchRecords([sub("a")], [rec("x"), rec("y")], null);
    expect(result.pairs.size).toBe(0);
    expect([...result.blocked]).toEqual(["a"]);
  });

  it("a Tracked charge last seen in the previous scan blocks a new subscription with its Triple", () => {
    const result = matchRecords(
      [sub("a", { amounts: [999] })],
      [rec("old", { lastSeenScan: "s2" })],
      "s2",
    );
    expect(result.pairs.size).toBe(0);
    expect([...result.blocked]).toEqual(["a"]);
  });

  it("a Tracked charge last seen two scans ago blocks nothing", () => {
    const result = matchRecords(
      [sub("a", { amounts: [999] })],
      [rec("old", { lastSeenScan: "s1" })],
      "s2",
    );
    expect(result.pairs.size).toBe(0);
    expect(result.blocked.size).toBe(0);
  });

  it("with no previous scan a Tracked charge blocks nothing", () => {
    const result = matchRecords(
      [sub("a", { amounts: [999] })],
      [rec("old", { lastSeenScan: "s1" })],
      null,
    );
    expect(result.blocked.size).toBe(0);
  });

  it("an unmatched Tombstone with no qualifying subscription blocks nothing", () => {
    const result = matchRecords([sub("a", { amounts: [999] })], [rec("old")], "s2");
    expect(result.pairs.size).toBe(0);
    expect(result.blocked.size).toBe(0);
  });

  it("an ended subscription takes its own record, so a new active series is not blocked", () => {
    const ended = sub("netflix-old", { status: "ended" });
    const fresh = sub("netflix-new", { amounts: [1799] });
    const result = matchRecords([ended, fresh], [rec("netflix-old", { lastSeenScan: "s2" })], "s2");
    expect(result.pairs.get("netflix-old")?.key).toBe("netflix-old");
    expect(result.unmatchedSubs.map((s) => s.id)).toEqual(["netflix-new"]);
    expect(result.blocked.size).toBe(0);
  });

  it("a guessed-cadence subscription does not qualify for a record with cadenceAssumed false", () => {
    const result = matchRecords(
      [sub("a", { assumed: true })],
      [rec("old", { cadenceAssumed: false })],
      null,
    );
    expect(result.pairs.size).toBe(0);
    const ok = matchRecords(
      [sub("a", { assumed: true })],
      [rec("old", { cadenceAssumed: true })],
      null,
    );
    expect(ok.pairs.get("a")?.key).toBe("old");
  });

  it("does not match across currency, cadence or merchantKey", () => {
    for (const over of [{ currency: "EUR" }, { cadence: "yearly" }, { merchantKey: "other" }]) {
      const result = matchRecords([sub("a")], [rec("old", over)], null);
      expect(result.pairs.size).toBe(0);
    }
  });
});
