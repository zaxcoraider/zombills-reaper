import { describe, expect, it } from "vitest";
import { localDate, localMonth } from "./local-date.ts";

const INSTANT = "2026-12-01T00:30:00Z";

describe("localDate", () => {
  it("uses the given time zone", () => {
    const date = new Date(INSTANT);
    expect(localDate(date, "America/Los_Angeles")).toBe("2026-11-30");
    expect(localDate(date, "Europe/London")).toBe("2026-12-01");
    expect(localDate(date, "UTC")).toBe("2026-12-01");
  });
});

describe("localMonth", () => {
  it("is the first 7 characters of the local date", () => {
    expect(localMonth(INSTANT, "America/Los_Angeles")).toBe("2026-11");
    expect(localMonth(INSTANT, "Europe/London")).toBe("2026-12");
    expect(localMonth(new Date(INSTANT), "UTC")).toBe("2026-12");
  });
});
