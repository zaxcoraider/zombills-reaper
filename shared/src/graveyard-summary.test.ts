import { describe, expect, it } from "vitest";
import { graveyardView } from "./graveyard-summary.ts";
import type { History, ScanRecord, Tombstone } from "./types.ts";

function scan(scanId: string, scannedAt: string, undeadCount: number, usdCost: number): ScanRecord {
  return {
    scanId,
    scannedAt,
    statementRange: { from: "2026-01-01", to: "2026-01-31" },
    undeadCount,
    yearlyTotals: { USD: { yearlyCostCents: usdCost, guessedCount: 0 } },
    newCount: 0,
    possessedCount: 0,
  };
}

function tombstone(key: string, name: string, buriedAt: string, saving: number | null): Tombstone {
  return {
    key,
    name,
    serviceId: null,
    currency: "USD",
    cadence: "monthly",
    merchantKey: `mk-${key}`,
    amountCents: 1000,
    cadenceAssumed: saving === null,
    yearlySavingCents: saving,
    buriedAt,
    risenReportedThrough: null,
  };
}

function historyOf(parts: Partial<History>): History {
  return {
    version: 1,
    coreSource: null,
    trackedCharges: [],
    tombstones: [],
    scans: [],
    reportedTrials: [],
    ...parts,
  };
}

describe("graveyardView", () => {
  it("carries the previous month's values forward for a month with a burial and no scan", () => {
    const view = graveyardView(
      historyOf({
        scans: [scan("s1", "2026-03-10T12:00:00Z", 4, 50_000)],
        tombstones: [tombstone("k1", "Netflix", "2026-04-15", 12_000)],
      }),
      "UTC",
    );
    expect(view.months.map((m) => m.month)).toEqual(["2026-03", "2026-04"]);
    const april = view.months[1];
    expect(april?.undeadCount).toBe(4);
    expect(april?.yearlyTotals).toEqual({ USD: { yearlyCostCents: 50_000, guessedCount: 0 } });
    expect(april?.buriedCount).toBe(1);
    expect(april?.cumulativeSavings).toEqual({
      USD: { yearlySavingCents: 12_000, guessedCount: 0 },
    });
    expect(view.months[0]?.buriedCount).toBe(0);
    expect(view.months[0]?.cumulativeSavings).toEqual({});
  });

  it("gives null for months before the first scan", () => {
    const view = graveyardView(
      historyOf({
        scans: [scan("s1", "2026-05-02T12:00:00Z", 3, 1000)],
        tombstones: [tombstone("k1", "Gym", "2026-02-20", 5000)],
      }),
      "UTC",
    );
    expect(view.months.map((m) => m.month)).toEqual(["2026-02", "2026-05"]);
    expect(view.months[0]?.undeadCount).toBeNull();
    expect(view.months[0]?.yearlyTotals).toBeNull();
    expect(view.months[0]?.buriedCount).toBe(1);
    expect(view.months[1]?.undeadCount).toBe(3);
    expect(view.months[1]?.buriedCount).toBe(1);
  });

  it("places a scan at 2026-12-01T03:00:00Z in November in Los Angeles and December in UTC", () => {
    const history = historyOf({ scans: [scan("s1", "2026-12-01T03:00:00Z", 2, 1000)] });
    expect(graveyardView(history, "America/Los_Angeles").months.map((m) => m.month)).toEqual([
      "2026-11",
    ]);
    expect(graveyardView(history, "UTC").months.map((m) => m.month)).toEqual(["2026-12"]);
  });

  it("uses the last scan when a month has two", () => {
    const view = graveyardView(
      historyOf({
        scans: [
          scan("s1", "2026-06-02T12:00:00Z", 2, 1000),
          scan("s2", "2026-06-20T12:00:00Z", 5, 9000),
        ],
      }),
      "UTC",
    );
    expect(view.months).toHaveLength(1);
    expect(view.months[0]?.undeadCount).toBe(5);
    expect(view.months[0]?.yearlyTotals?.["USD"]?.yearlyCostCents).toBe(9000);
  });

  it("counts a guessed Tombstone in guessedCount and not in yearlySavingCents", () => {
    const view = graveyardView(
      historyOf({
        tombstones: [
          tombstone("k1", "Netflix", "2026-04-15", 12_000),
          tombstone("k2", "Gym", "2026-04-16", null),
        ],
      }),
      "UTC",
    );
    expect(view.savings).toEqual({ USD: { yearlySavingCents: 12_000, guessedCount: 1 } });
    expect(view.months[0]?.cumulativeSavings).toEqual({
      USD: { yearlySavingCents: 12_000, guessedCount: 1 },
    });
  });

  it("sorts Tombstones by buriedAt descending, then name, then key", () => {
    const view = graveyardView(
      historyOf({
        tombstones: [
          tombstone("k3", "B", "2026-04-15", 1),
          tombstone("k2", "A", "2026-04-15", 1),
          tombstone("k1", "A", "2026-04-15", 1),
          tombstone("k4", "Z", "2026-05-01", 1),
        ],
      }),
      "UTC",
    );
    expect(view.tombstones.map((t) => t.name)).toEqual(["Z", "A", "A", "B"]);
    expect(new Set(view.tombstones.map((t) => t.ref)).size).toBe(4);
    const first = view.tombstones[1];
    const second = view.tombstones[2];
    expect(first?.ref).not.toBe(second?.ref);
  });

  it("returns no key or merchantKey anywhere in the output", () => {
    const view = graveyardView(
      historyOf({ tombstones: [tombstone("secret-key", "Netflix", "2026-04-15", 100)] }),
      "UTC",
    );
    const text = JSON.stringify(view);
    expect(text).not.toContain("secret-key");
    expect(text).not.toContain("mk-secret-key");
    expect(text).not.toContain('"key"');
    expect(text).not.toContain("merchantKey");
  });

  it("returns nothing for an empty History", () => {
    expect(graveyardView(historyOf({}), "UTC")).toEqual({
      tombstones: [],
      savings: {},
      months: [],
    });
  });
});
