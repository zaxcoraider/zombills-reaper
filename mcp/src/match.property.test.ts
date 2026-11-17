import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { matchRecords } from "./match.js";
import type { MatchRecord, MatchSub } from "./match.js";

const NUM_RUNS = 300;

const tripleArb = fc.record({
  currency: fc.constantFrom("USD", "EUR"),
  cadence: fc.constantFrom("monthly", "yearly"),
  merchantKey: fc.constantFrom("netflix", "spotify"),
});
const amountArb = fc.constantFrom(500, 999, 1549);

const subArb = (id: string): fc.Arbitrary<MatchSub> =>
  fc
    .record({
      triple: tripleArb,
      amounts: fc.uniqueArray(amountArb, { minLength: 1, maxLength: 3 }),
      assumed: fc.boolean(),
      status: fc.constantFrom("active", "ended"),
    })
    .map(({ triple, amounts, assumed, status }) => ({
      id,
      status,
      ...triple,
      priceHistory: amounts.map((amountCents) => ({ amountCents })),
      evidence: { cadenceAssumed: assumed },
    }));

const recordArb = (key: string): fc.Arbitrary<MatchRecord> =>
  fc
    .record({
      triple: tripleArb,
      amountCents: amountArb,
      cadenceAssumed: fc.boolean(),
      lastSeenScan: fc.constantFrom(undefined, "s1", "s2"),
    })
    .map(({ triple, amountCents, cadenceAssumed, lastSeenScan }) => ({
      key,
      ...triple,
      amountCents,
      cadenceAssumed,
      ...(lastSeenScan === undefined ? {} : { lastSeenScan }),
    }));

const IDS = ["a", "b", "c", "d", "e"];
const KEYS = ["a", "c", "k1", "k2", "k3", "k4"];

const inputArb = fc
  .tuple(
    fc.integer({ min: 0, max: IDS.length }).chain((n) => fc.tuple(...IDS.slice(0, n).map(subArb))),
    fc
      .integer({ min: 0, max: KEYS.length })
      .chain((n) => fc.tuple(...KEYS.slice(0, n).map(recordArb))),
    fc.constantFrom(null, "s1", "s2"),
  )
  .map(([subs, records, previous]) => ({
    subs: subs as MatchSub[],
    records: records as MatchRecord[],
    previous,
  }));

const qualifies = (s: MatchSub, r: MatchRecord): boolean =>
  s.currency === r.currency &&
  s.cadence === r.cadence &&
  s.merchantKey === r.merchantKey &&
  s.priceHistory.some((p) => p.amountCents === r.amountCents) &&
  (!s.evidence.cadenceAssumed || r.cadenceAssumed);

describe("matchRecords", () => {
  it("P6: no record is in two pairs and no subscription in two", () => {
    fc.assert(
      fc.property(inputArb, ({ subs, records, previous }) => {
        const { pairs } = matchRecords(subs, records, previous);
        const keys = [...pairs.values()].map((r) => r.key);
        expect(new Set(keys).size).toBe(keys.length);
        for (const id of pairs.keys()) expect(subs.filter((s) => s.id === id)).toHaveLength(1);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("P6: every pair qualifies or matches by key", () => {
    fc.assert(
      fc.property(inputArb, ({ subs, records, previous }) => {
        const { pairs } = matchRecords(subs, records, previous);
        for (const [id, r] of pairs) {
          const s = subs.find((x) => x.id === id);
          expect(s).toBeDefined();
          if (s !== undefined) expect(r.key === s.id || qualifies(s, r)).toBe(true);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("P6: a subscription or a record with two qualifying candidates in pass 2 is not paired", () => {
    fc.assert(
      fc.property(inputArb, ({ subs, records, previous }) => {
        const { pairs } = matchRecords(subs, records, previous);
        const byKey = new Set(subs.map((s) => s.id));
        const keyPaired = new Set(records.filter((r) => byKey.has(r.key)).map((r) => r.key));
        const leftSubs = subs.filter((s) => !keyPaired.has(s.id));
        const leftRecords = records.filter((r) => !keyPaired.has(r.key));
        for (const s of leftSubs) {
          const candidates = leftRecords.filter((r) => qualifies(s, r));
          if (candidates.length >= 2) expect(pairs.has(s.id)).toBe(false);
        }
        for (const r of leftRecords) {
          const candidates = leftSubs.filter((s) => qualifies(s, r));
          if (candidates.length >= 2) {
            for (const s of candidates) expect(pairs.get(s.id)?.key).not.toBe(r.key);
          }
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("P6: shuffling subs or records gives the same pairs and blocked", () => {
    const shuffledArb = inputArb.chain((input) =>
      fc
        .tuple(
          fc.shuffledSubarray(input.subs, {
            minLength: input.subs.length,
            maxLength: input.subs.length,
          }),
          fc.shuffledSubarray(input.records, {
            minLength: input.records.length,
            maxLength: input.records.length,
          }),
        )
        .map(([subs, records]) => ({ input, subs, records })),
    );
    fc.assert(
      fc.property(shuffledArb, ({ input, subs, records }) => {
        const a = matchRecords(input.subs, input.records, input.previous);
        const b = matchRecords(subs, records, input.previous);
        const pairsOf = (m: typeof a): [string, string][] =>
          [...m.pairs].map(([id, r]): [string, string] => [id, r.key]).sort();
        expect(pairsOf(b)).toEqual(pairsOf(a));
        expect([...b.blocked].sort()).toEqual([...a.blocked].sort());
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
