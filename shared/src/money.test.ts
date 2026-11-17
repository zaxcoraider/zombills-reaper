import { describe, expect, it } from "vitest";
import { CADENCE_FACTOR, moneyText } from "./money.ts";

describe("moneyText", () => {
  it("formats integer cents", () => {
    expect(moneyText(1799, "USD")).toBe("$17.99");
    expect(moneyText(499, "GBP")).toBe("£4.99");
    expect(moneyText(118140, "USD")).toBe("$1,181.40");
    expect(moneyText(0, "EUR")).toBe("€0.00");
  });
});

describe("CADENCE_FACTOR", () => {
  it("has the yearly multipliers", () => {
    expect(CADENCE_FACTOR).toEqual({ weekly: 52, monthly: 12, yearly: 1 });
  });
});
