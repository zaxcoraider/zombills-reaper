import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { emptyHistory } from "../../shared/src/history-codec.ts";
import { refOf } from "../../shared/src/ref.ts";
import type { YearlyTotals } from "../../shared/src/types.ts";
import { statementSetArb } from "../fixtures/generators.ts";
import { runDiff, subsOf } from "./test-scan-input.js";

// Each run executes the real Core pipeline, so the property tests use 100 runs (design "Correctness properties").
const NUM_RUNS = 100;

describe("diffScan properties", () => {
  it("P5: yearlyTotals are the defined sums and every entry keeps its Core yearly cost", () => {
    fc.assert(
      fc.property(statementSetArb, (set) => {
        const subs = subsOf(set.files.map((f) => f.text));
        const { summary } = runDiff(subs);

        const expected: YearlyTotals = {};
        for (const entry of summary.undead) {
          const total = (expected[entry.currency] ??= { yearlyCostCents: 0, guessedCount: 0 });
          if (entry.cadenceAssumed) total.guessedCount += 1;
          else total.yearlyCostCents += entry.yearlyCostCents;
        }
        expect(summary.yearlyTotals).toEqual(expected);

        const active = subs.filter((s) => s.status === "active");
        expect(summary.undead).toHaveLength(active.length);
        const byRef = new Map(active.map((s) => [refOf(s.id), s] as const));
        for (const entry of summary.undead) {
          const sub = byRef.get(entry.ref);
          expect(sub).toBeDefined();
          expect(entry.yearlyCostCents).toBe(sub?.yearlyCostCents);
          expect(entry.cadenceAssumed).toBe(sub?.evidence.cadenceAssumed);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("P11: a second scan of the same set leaves trackedCharges, tombstones and reportedTrials as one scan did", () => {
    fc.assert(
      fc.property(statementSetArb, (set) => {
        const subs = subsOf(set.files.map((f) => f.text));
        const one = runDiff(subs, emptyHistory(), { scanId: "scan-20260701T000001Z-000001" });
        const two = runDiff(subs, one.nextHistory, {
          scanId: "scan-20260701T000002Z-000002",
          now: new Date("2026-07-01T00:00:02.000Z"),
        });
        const withoutLastSeen = (h: typeof one.nextHistory) =>
          h.trackedCharges.map((t) => ({ ...t, lastSeenScan: "" }));
        expect(withoutLastSeen(two.nextHistory)).toEqual(withoutLastSeen(one.nextHistory));
        expect(two.nextHistory.tombstones).toEqual(one.nextHistory.tombstones);
        expect(two.nextHistory.reportedTrials).toEqual(one.nextHistory.reportedTrials);
        expect(two.summary.newUndead).toEqual([]);
        expect(two.summary.possessed).toEqual([]);
        expect(two.summary.trialTraps).toEqual([]);
        expect(two.nextHistory.scans).toHaveLength(2);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
