import { describe, expect, it } from "vitest";
import { resolveService } from "./resolve-service.js";
import type { Resolvable } from "./resolve-service.js";

function entry(
  key: string,
  merchant: string,
  amountCents: number,
  serviceId: string | null = null,
): Resolvable {
  return { key, merchant, serviceId, amountCents };
}

const SPOTIFY = entry("k-spotify", "Spotify", 1699, "spotify");

describe("resolveService levels", () => {
  it("lets the service id win over a merchant of the same text", () => {
    const byId = entry("a", "Some Other Name", 500, "prime");
    const byName = entry("b", "Prime", 700, null);
    expect(resolveService("prime", [byName, byId])).toEqual({ kind: "one", entry: byId });
  });

  it("lets an exact merchant win over a prefix", () => {
    const exact = entry("a", "Apple", 500);
    const longer = entry("b", "Apple Music", 700);
    expect(resolveService("apple", [longer, exact])).toEqual({ kind: "one", entry: exact });
  });

  it("falls back to a prefix of at least 2 code points", () => {
    const e = entry("a", "Planet Fitness", 2499);
    expect(resolveService("Planet", [e])).toEqual({ kind: "one", entry: e });
    expect(resolveService("pl", [e])).toEqual({ kind: "one", entry: e });
  });

  it("gives no prefix hits for a one-letter text", () => {
    const e = entry("a", "Planet Fitness", 2499);
    const result = resolveService("p", [e]);
    expect(result.kind).toBe("none");
    // The contains group still offers it as a candidate.
    expect(result).toEqual({ kind: "none", candidates: [e] });
    const other = resolveService("z", [e]);
    expect(other).toEqual({ kind: "none", candidates: [] });
  });

  it("folds case and white space", () => {
    expect(resolveService("  SPOTIFY  ", [SPOTIFY])).toEqual({ kind: "one", entry: SPOTIFY });
  });

  it("returns none with no candidates for blank text", () => {
    expect(resolveService("   ", [entry("a", "", 100, null)])).toEqual({
      kind: "none",
      candidates: [],
    });
  });
});

describe("resolveService amount suffix", () => {
  it.each(["Spotify 16.99", "Spotify $16.99", "Spotify USD 16.99", "Spotify 16,99"])(
    "reads %s as Spotify at 1699",
    (text) => {
      expect(resolveService(text, [SPOTIFY])).toEqual({ kind: "one", entry: SPOTIFY });
    },
  );

  it("reads 16,9 as 1690 and 17 as 1700", () => {
    const at1690 = entry("a", "Spotify", 1690);
    const at1700 = entry("b", "Spotify", 1700);
    expect(resolveService("Spotify 16,9", [at1690, at1700])).toEqual({
      kind: "one",
      entry: at1690,
    });
    expect(resolveService("Spotify 17", [at1690, at1700])).toEqual({
      kind: "one",
      entry: at1700,
    });
  });

  it("resolves Xbox 360 as a name before any amount split", () => {
    const xbox = entry("a", "Xbox 360", 999);
    const other = entry("b", "Xbox", 36000);
    expect(resolveService("Xbox 360", [other, xbox])).toEqual({ kind: "one", entry: xbox });
  });

  it("returns none with candidates from the name part when the amount does not match", () => {
    expect(resolveService("Spotify 5.00", [SPOTIFY])).toEqual({
      kind: "none",
      candidates: [SPOTIFY],
    });
  });
});

describe("resolveService several and candidates", () => {
  const low = entry("k1", "Spotify", 999);
  const high = entry("k2", "Spotify", 1699);

  it("returns several for two Spotify entries, then one with the amount", () => {
    expect(resolveService("Spotify", [high, low])).toEqual({
      kind: "several",
      candidates: [low, high],
    });
    expect(resolveService("Spotify 9.99", [high, low])).toEqual({ kind: "one", entry: low });
  });

  it("returns none with no candidates for 201 code points", () => {
    const long = "a".repeat(201);
    expect(resolveService(long, [entry("a", long, 100)])).toEqual({ kind: "none", candidates: [] });
    const ok = "a".repeat(200);
    expect(resolveService(ok, [entry("a", ok, 100)]).kind).toBe("one");
  });

  it("counts code points, not UTF-16 units", () => {
    const long = "😀".repeat(200);
    expect(resolveService(long, [entry("a", long, 100)]).kind).toBe("one");
  });

  it("orders candidates contains first, then shared prefix, by name, amount, key", () => {
    const entries = [
      entry("k5", "Zeta Spot", 100),
      entry("k4", "Alpha Spot", 300),
      entry("k3", "Alpha Spot", 200),
      entry("k2", "Spoilers Weekly", 100),
      entry("k1", "Unrelated", 100),
    ];
    const result = resolveService("spot", entries);
    // "spot" is a prefix of nobody and contained in three names; "Spoilers" shares "spo".
    expect(result).toEqual({
      kind: "none",
      candidates: [entries[2], entries[1], entries[0], entries[3]],
    });
  });

  it("caps candidates at 5", () => {
    const many = Array.from({ length: 8 }, (_, i) => entry(`k${i}`, `Big Show ${i}`, 100 + i));
    const result = resolveService("show", many);
    expect(result.kind).toBe("none");
    if (result.kind === "none") expect(result.candidates).toEqual(many.slice(0, 5));
    const several = resolveService("big show", [
      ...many.map((e) => ({ ...e, merchant: "Big Show" })),
    ]);
    expect(several.kind).toBe("several");
    if (several.kind === "several") expect(several.candidates).toHaveLength(5);
  });
});
