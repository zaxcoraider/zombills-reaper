import { describe, expect, it } from "vitest";
import { isGraveyardResponse } from "./graveyard-response.ts";

function valid(): Record<string, unknown> {
  return {
    ok: true,
    tombstones: [
      {
        ref: "abc123",
        name: "Netflix",
        serviceId: "netflix",
        currency: "USD",
        cadence: "monthly",
        amountCents: 1549,
        cadenceAssumed: false,
        yearlySavingCents: 18588,
        buriedAt: "2026-02-03",
        risenReportedThrough: null,
      },
    ],
    savings: { USD: { yearlySavingCents: 18588, guessedCount: 0 } },
    months: [
      {
        month: "2026-02",
        undeadCount: 6,
        yearlyTotals: { USD: { yearlyCostCents: 118140, guessedCount: 0 } },
        buriedCount: 1,
        cumulativeSavings: { USD: { yearlySavingCents: 18588, guessedCount: 0 } },
      },
    ],
    lastScan: {
      scannedAt: "2026-02-03T10:00:00.000Z",
      statementRange: { from: "2026-01-01", to: "2026-01-31" },
      undeadCount: 6,
      yearlyTotals: { USD: { yearlyCostCents: 118140, guessedCount: 0 } },
    },
  };
}

describe("isGraveyardResponse", () => {
  it("accepts a valid response", () => {
    expect(isGraveyardResponse(valid())).toBe(true);
  });

  it("accepts an empty response with no last scan", () => {
    expect(
      isGraveyardResponse({ ok: true, tombstones: [], savings: {}, months: [], lastScan: null }),
    ).toBe(true);
  });

  it("accepts a valid ok: false reply", () => {
    expect(isGraveyardResponse({ ok: false, reason: "history-unreadable" })).toBe(true);
  });

  it("refuses a missing field", () => {
    const value = valid();
    delete value["months"];
    expect(isGraveyardResponse(value)).toBe(false);
    const noLastScan = valid();
    delete noLastScan["lastScan"];
    expect(isGraveyardResponse(noLastScan)).toBe(false);
  });

  it("refuses a fractional cent value", () => {
    const value = valid();
    value["savings"] = { USD: { yearlySavingCents: 185.88, guessedCount: 0 } };
    expect(isGraveyardResponse(value)).toBe(false);
  });

  it("refuses a lower-case currency", () => {
    const value = valid();
    value["savings"] = { usd: { yearlySavingCents: 18588, guessedCount: 0 } };
    expect(isGraveyardResponse(value)).toBe(false);
  });

  it("refuses a non-array tombstones", () => {
    const value = valid();
    value["tombstones"] = {};
    expect(isGraveyardResponse(value)).toBe(false);
  });

  it("refuses an ok: false reply without a reason, and non-objects", () => {
    expect(isGraveyardResponse({ ok: false })).toBe(false);
    expect(isGraveyardResponse(null)).toBe(false);
    expect(isGraveyardResponse("ok")).toBe(false);
    expect(isGraveyardResponse({ ok: "yes" })).toBe(false);
  });
});
