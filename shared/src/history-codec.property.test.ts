import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  jsonTextArb,
  rawRecordArb,
  validHistoryArb,
  withPrototypeKeys,
} from "../../mcp/fixtures/generators.ts";
import { decodeHistory, encodeHistory } from "./history-codec.ts";
import type { History } from "./types.ts";

const RUNS = 300;

describe("history codec properties", () => {
  it("P9: decode(encode(h)) is h", () => {
    fc.assert(
      fc.property(validHistoryArb, (h) => {
        expect(decodeHistory(encodeHistory(h))).toEqual({ kind: "ok", history: h, dropped: 0 });
      }),
      { numRuns: RUNS },
    );
  });

  it("P9: decode is total and returns ok, unreadable or newer", () => {
    fc.assert(
      fc.property(jsonTextArb, (text) => {
        const result = decodeHistory(text);
        expect(["ok", "unreadable", "newer"]).toContain(result.kind);
      }),
      { numRuns: RUNS },
    );
  });

  it("P9: a __proto__ key changes no prototype", () => {
    fc.assert(
      fc.property(jsonTextArb, (text) => {
        const result = decodeHistory(text);
        expect(({} as Record<string, unknown>)["polluted"]).toBeUndefined();
        if (result.kind !== "ok") return;
        const objects: object[] = [
          result.history,
          ...result.history.trackedCharges,
          ...result.history.tombstones,
          ...result.history.scans,
          ...result.history.scans.map((s) => s.statementRange),
          ...result.history.scans.map((s) => s.yearlyTotals),
        ];
        for (const object of objects) {
          expect(Object.getPrototypeOf(object)).toBe(Object.prototype);
          expect(Object.hasOwn(object, "__proto__")).toBe(false);
          expect(Object.hasOwn(object, "polluted")).toBe(false);
        }
      }),
      { numRuns: RUNS },
    );
  });

  it("P9: a text with prototype keys still decodes to the same History", () => {
    fc.assert(
      fc.property(validHistoryArb, (h) => {
        const text = withPrototypeKeys(h);
        expect(decodeHistory(text)).toEqual({ kind: "ok", history: h, dropped: 0 });
      }),
      { numRuns: RUNS },
    );
  });

  it("P9: one broken record is dropped and counted, the rest is unchanged", () => {
    fc.assert(
      fc.property(validHistoryArb, rawRecordArb, fc.nat(), (h, raw, position) => {
        const section = h[raw.section] as unknown[];
        const index = position % (section.length + 1);
        const withBroken: unknown[] = [
          ...section.slice(0, index),
          raw.record,
          ...section.slice(index),
        ];
        const text = JSON.stringify({ ...h, [raw.section]: withBroken });
        const expected: History = h;
        expect(decodeHistory(text)).toEqual({ kind: "ok", history: expected, dropped: 1 });
      }),
      { numRuns: RUNS },
    );
  });
});
