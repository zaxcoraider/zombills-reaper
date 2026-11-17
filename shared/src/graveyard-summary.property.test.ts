import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { validHistoryArb } from "../../mcp/fixtures/generators.ts";
import { graveyardView } from "./graveyard-summary.ts";

const RUNS = 300;

describe("graveyard summary properties", () => {
  it("P8: savings per currency match the Tombstones", () => {
    fc.assert(
      fc.property(validHistoryArb, (history) => {
        const view = graveyardView(history, "UTC");
        const currencies = new Set(history.tombstones.map((t) => t.currency));
        expect(new Set(Object.keys(view.savings))).toEqual(currencies);
        for (const currency of currencies) {
          const own = history.tombstones.filter((t) => t.currency === currency);
          const sum = own.reduce((total, t) => total + (t.yearlySavingCents ?? 0), 0);
          expect(view.savings[currency]).toEqual({
            yearlySavingCents: sum,
            guessedCount: own.filter((t) => t.yearlySavingCents === null).length,
          });
        }
      }),
      { numRuns: RUNS },
    );
  });

  it("P8: the last month's buriedCount equals the number of Tombstones", () => {
    fc.assert(
      fc.property(validHistoryArb, (history) => {
        const view = graveyardView(history, "UTC");
        expect(view.tombstones).toHaveLength(history.tombstones.length);
        const last = view.months[view.months.length - 1];
        if (history.tombstones.length > 0)
          expect(last?.buriedCount).toBe(history.tombstones.length);
        for (const [i, month] of view.months.entries()) {
          if (i > 0) expect((view.months[i - 1]?.month ?? "") < month.month).toBe(true);
        }
        expect(JSON.stringify(view)).not.toContain("merchantKey");
      }),
      { numRuns: RUNS },
    );
  });
});
