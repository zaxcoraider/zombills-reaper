import { normalizeTransactions, parseStatement } from "@zombills/core";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { oneOffDescription, oneOffMarker, statementSetArb } from "./generators.ts";

const ONE_OFF_PREFIX = "SHOP ZQ";

function merchantKeyOf(description: string): string {
  const result = parseStatement(`Date,Description,Amount\n2025-01-01,${description},1.00\n`);
  if (result.status !== "mapped") throw new Error("statement did not map");
  const [row] = normalizeTransactions(result.transactions);
  if (row === undefined) throw new Error("no row");
  return row.merchant.key;
}

describe("statementSetArb one-off rows", () => {
  it("gives the first 700 one-off descriptions pairwise different merchant keys", () => {
    const keys = Array.from({ length: 700 }, (_, index) => merchantKeyOf(oneOffDescription(index)));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("builds markers from letters only", () => {
    for (let index = 0; index < 700; index += 1) {
      expect(oneOffMarker(index)).toMatch(/^ZQ[A-Z]+$/u);
    }
  });

  it("keeps the old digit style distinguishable: digit markers do merge", () => {
    expect(merchantKeyOf("SHOP ZQ10000000")).toBe(merchantKeyOf("SHOP ZQ10000001"));
  });

  it("never shares a normalized merchant between two one-off rows of a set", () => {
    let seen = 0;
    fc.assert(
      fc.property(statementSetArb, (set) => {
        const merchantOfDescription = new Map<string, string>();
        for (const file of set.files) {
          const result = parseStatement(file.text);
          if (result.status !== "mapped") continue;
          for (const row of normalizeTransactions(result.transactions)) {
            if (!row.description.startsWith(ONE_OFF_PREFIX)) continue;
            merchantOfDescription.set(row.description, row.merchant.key);
          }
        }
        const keys = [...merchantOfDescription.values()];
        seen += keys.length;
        expect(new Set(keys).size).toBe(keys.length);
      }),
      { numRuns: 200 },
    );
    expect(seen).toBeGreaterThan(0);
  });
});
