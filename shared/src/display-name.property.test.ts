import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { displayName, foldName } from "./display-name.ts";

const WHITE_SPACE = fc.constantFrom(" ", "  ", "\t", "\n", "\u00a0", "\u2003");

const TEXT = fc.oneof(
  fc.string({ unit: "grapheme" }),
  fc.string({ unit: "binary" }),
  fc
    .array(fc.oneof(fc.string({ unit: "grapheme", maxLength: 12 }), WHITE_SPACE), {
      maxLength: 30,
    })
    .map((parts) => parts.join("")),
  fc.string({ unit: "grapheme", minLength: 81, maxLength: 200 }),
  fc.string({ unit: "binary", minLength: 81, maxLength: 200 }),
);

const length = (s: string): number => [...s].length;
const collapsed = (s: string): string => s.normalize("NFC").trim().replace(/\s+/gu, " ");

describe("P12: display names", () => {
  it("P12: output is never longer than 80 code points", () => {
    fc.assert(
      fc.property(TEXT, (x) => {
        expect(length(displayName(x))).toBeLessThanOrEqual(80);
      }),
      { numRuns: 500 },
    );
  });

  it("P12: displayName is a fixed point", () => {
    fc.assert(
      fc.property(TEXT, (x) => {
        expect(displayName(displayName(x))).toBe(displayName(x));
      }),
      { numRuns: 500 },
    );
  });

  it("P12: foldName(displayName(x)) equals foldName(x) when x is short enough", () => {
    fc.assert(
      fc.property(TEXT, (x) => {
        fc.pre(length(collapsed(x)) <= 80);
        expect(foldName(displayName(x))).toBe(foldName(x));
      }),
      { numRuns: 500 },
    );
  });
});

describe("displayName and foldName fixed cases", () => {
  it("keeps exactly 80 code points whole", () => {
    const s = "a".repeat(80);
    expect(displayName(s)).toBe(s);
  });

  it("cuts 81 code points to 79 plus an ellipsis", () => {
    expect(displayName("a".repeat(81))).toBe("a".repeat(79) + "…");
  });

  it("does not split a surrogate pair at position 79", () => {
    const s = "a".repeat(78) + "😀" + "bc";
    const out = displayName(s);
    expect(out).toBe("a".repeat(78) + "😀…");
    expect(length(out)).toBe(80);
  });

  it("trims and collapses white space", () => {
    expect(displayName("  Net\t\nflix  ")).toBe("Net flix");
  });

  it("folds case and white space", () => {
    expect(foldName("NETFLIX ")).toBe("netflix");
  });
});
