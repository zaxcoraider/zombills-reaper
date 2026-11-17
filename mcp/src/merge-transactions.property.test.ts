import { normalizeTransactions, parseStatement } from "@zombills/core";
import type { NormalizedTransaction } from "@zombills/core";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { statementSetArb } from "../fixtures/generators.ts";
import type { StatementSet } from "../fixtures/generators.ts";
import { mergeOverlap } from "./merge-transactions.js";

const NUM_RUNS = 200;

function perFileOf(texts: string[]): NormalizedTransaction[][] {
  const lists: NormalizedTransaction[][] = [];
  for (const text of texts) {
    const result = parseStatement(text);
    if (result.status === "mapped") lists.push(normalizeTransactions(result.transactions));
  }
  return lists;
}

const textsOf = (set: StatementSet): string[] => set.files.map((file) => file.text);

const setWithOrderArb = fc.tuple(statementSetArb).chain(([set]) =>
  fc
    .shuffledSubarray(textsOf(set), {
      minLength: set.files.length,
      maxLength: set.files.length,
    })
    .map((shuffled) => ({ set, shuffled })),
);

describe("mergeOverlap", () => {
  it("P1: every permutation of the per-file lists gives a deeply equal merged list", () => {
    fc.assert(
      fc.property(setWithOrderArb, ({ set, shuffled }) => {
        expect(mergeOverlap(perFileOf(shuffled))).toEqual(mergeOverlap(perFileOf(textsOf(set))));
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("P2: [a] and [a, a] merge to the same list, and a duplicated file adds nothing", () => {
    fc.assert(
      fc.property(statementSetArb, (set) => {
        const lists = perFileOf(textsOf(set));
        for (const list of lists) {
          expect(mergeOverlap([list, list])).toEqual(mergeOverlap([list]));
        }
        const unique = [...new Set(textsOf(set))];
        expect(mergeOverlap(lists)).toEqual(mergeOverlap(perFileOf(unique)));
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("keeps a key that occurs 2 times in one file and 1 time in another 2 times", () => {
    fc.assert(
      fc.property(statementSetArb, (set) => {
        const first = perFileOf(textsOf(set)).flat()[0];
        fc.pre(first !== undefined);
        if (first === undefined) return;
        const merged = mergeOverlap([[first, first], [first]]);
        expect(merged).toEqual([first, first]);
        expect(mergeOverlap([[first], [first, first]])).toEqual([first, first]);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("sorts by the JSON of the key and then by the JSON of the transaction", () => {
    fc.assert(
      fc.property(statementSetArb, (set) => {
        const merged = mergeOverlap(perFileOf(textsOf(set)));
        const keyOf = (t: NormalizedTransaction): string =>
          JSON.stringify([t.date, t.merchant.key, t.amountCents, t.currency]);
        for (let i = 1; i < merged.length; i++) {
          const a = merged[i - 1];
          const b = merged[i];
          if (a === undefined || b === undefined) continue;
          const keys = [keyOf(a), keyOf(b)];
          expect(keys[0] !== undefined && keys[1] !== undefined && keys[0] <= keys[1]).toBe(true);
          if (keys[0] === keys[1]) expect(JSON.stringify(a) <= JSON.stringify(b)).toBe(true);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("keeps the smallest list when two lists for a key have the same length", () => {
    const base = perFileOf([
      "Date,Description,Amount\n2025-01-02,SHOP A,5.00\n2025-01-02,SHOP A,5.00\n",
    ])[0];
    expect(base).toHaveLength(2);
    const other = base?.map((t) => ({ ...t, description: `${t.description}~` })) ?? [];
    const forward = mergeOverlap([base ?? [], other]);
    expect(mergeOverlap([other, base ?? []])).toEqual(forward);
    expect(forward).toEqual(base);
  });
});
