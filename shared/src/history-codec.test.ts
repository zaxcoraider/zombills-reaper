import { describe, expect, it } from "vitest";
import { decodeHistory, emptyHistory, encodeHistory, LIMITS } from "./history-codec.ts";
import type { History, ScanRecord, Tombstone, TrackedCharge } from "./types.ts";

function scan(id: string, overrides: Partial<ScanRecord> = {}): ScanRecord {
  return {
    scanId: id,
    scannedAt: "2026-12-01T09:00:12.481Z",
    statementRange: { from: "2026-01-02", to: "2026-06-28" },
    undeadCount: 2,
    yearlyTotals: { USD: { yearlyCostCents: 1000, guessedCount: 1 } },
    newCount: 1,
    possessedCount: 0,
    ...overrides,
  };
}

function tracked(key: string, overrides: Partial<TrackedCharge> = {}): TrackedCharge {
  return {
    key,
    merchant: "Netflix",
    serviceId: "netflix",
    currency: "USD",
    cadence: "monthly",
    merchantKey: "netflix",
    amountCents: 1549,
    cadenceAssumed: false,
    firstSeenScan: "s1",
    lastSeenScan: "s1",
    reportedRiseDate: null,
    ...overrides,
  };
}

function stone(key: string, overrides: Partial<Tombstone> = {}): Tombstone {
  return {
    key,
    name: "Gym",
    serviceId: null,
    currency: "USD",
    cadence: "monthly",
    merchantKey: "gym",
    amountCents: 2000,
    cadenceAssumed: false,
    yearlySavingCents: 24000,
    buriedAt: "2026-05-04",
    risenReportedThrough: null,
    ...overrides,
  };
}

function history(overrides: Partial<History> = {}): History {
  return { ...emptyHistory(), ...overrides };
}

function ok(text: string): { history: History; dropped: number } {
  const result = decodeHistory(text);
  if (result.kind !== "ok") throw new Error(`expected ok, got ${result.kind}`);
  return { history: result.history, dropped: result.dropped };
}

/** Encodes the History with one section replaced by raw (possibly broken) values. */
function withRaw(section: string, raw: unknown[], base: History = history()): string {
  return JSON.stringify({ ...base, [section]: raw });
}

describe("decodeHistory: unreadable", () => {
  const goodRest = {
    coreSource: null,
    trackedCharges: [],
    tombstones: [],
    scans: [],
    reportedTrials: [],
  };
  it.each([
    ["not JSON", "{nope"],
    ["empty text", ""],
    ["an array", "[]"],
    ["null", "null"],
    ["a string", '"history"'],
    ["a number", "7"],
    ["missing version", JSON.stringify(goodRest)],
    ["version 0", JSON.stringify({ version: 0, ...goodRest })],
    ["version 1.5", JSON.stringify({ version: 1.5, ...goodRest })],
    ["version as a string", JSON.stringify({ version: "1", ...goodRest })],
    ["negative version", JSON.stringify({ version: -1, ...goodRest })],
    ["scans not an array", JSON.stringify({ version: 1, ...goodRest, scans: {} })],
    ["trackedCharges not an array", JSON.stringify({ version: 1, ...goodRest, trackedCharges: 1 })],
    [
      "tombstones missing",
      JSON.stringify({
        version: 1,
        coreSource: null,
        trackedCharges: [],
        scans: [],
        reportedTrials: [],
      }),
    ],
    [
      "reportedTrials not an array",
      JSON.stringify({ version: 1, ...goodRest, reportedTrials: "a" }),
    ],
    [
      "a coreSource of 65 characters",
      JSON.stringify({ version: 1, ...goodRest, coreSource: "a".repeat(65) }),
    ],
    ["a coreSource that is a number", JSON.stringify({ version: 1, ...goodRest, coreSource: 5 })],
  ])("returns unreadable for %s", (_label, text) => {
    expect(decodeHistory(text)).toEqual({ kind: "unreadable" });
  });

  it("accepts a coreSource of 64 characters", () => {
    const text = JSON.stringify({ version: 1, ...goodRest, coreSource: "a".repeat(64) });
    expect(ok(text).history.coreSource).toBe("a".repeat(64));
  });

  it("returns newer for version 2", () => {
    const text = JSON.stringify({ version: 2, whatever: true });
    expect(decodeHistory(text)).toEqual({ kind: "newer", version: 2 });
  });
});

describe("decodeHistory: record checks", () => {
  const brokenTracked: Array<[string, Partial<Record<keyof TrackedCharge, unknown>>]> = [
    ["a wrong-type key", { key: 5 }],
    ["an empty merchant", { merchant: "" }],
    ["a merchant of 81 code points", { merchant: "é".repeat(81) }],
    ["a non-string serviceId", { serviceId: 3 }],
    ["a lower-case currency", { currency: "usd" }],
    ["an unknown cadence", { cadence: "daily" }],
    ["negative cents", { amountCents: -1 }],
    ["fractional cents", { amountCents: 1.5 }],
    ["unsafe cents", { amountCents: 2 ** 60 }],
    ["a non-boolean cadenceAssumed", { cadenceAssumed: 1 }],
    ["a non-string scan id", { lastSeenScan: null }],
    ["a month 13 date", { reportedRiseDate: "2026-13-01" }],
    ["February 30", { reportedRiseDate: "2026-02-30" }],
  ];
  it.each(brokenTracked)("drops a Tracked charge with %s", (_label, change) => {
    const good = tracked("good");
    const result = ok(withRaw("trackedCharges", [good, { ...tracked("bad"), ...change }]));
    expect(result.history.trackedCharges).toEqual([good]);
    expect(result.dropped).toBe(1);
  });

  it("drops a Tracked charge with a missing field", () => {
    const rest = Object.fromEntries(
      Object.entries(tracked("bad")).filter(([field]) => field !== "merchantKey"),
    );
    const result = ok(withRaw("trackedCharges", [rest, tracked("good")]));
    expect(result.history.trackedCharges.map((c) => c.key)).toEqual(["good"]);
    expect(result.dropped).toBe(1);
  });

  it("drops a Tracked charge that is not an object", () => {
    const result = ok(withRaw("trackedCharges", [null, "x", [], 4, tracked("good")]));
    expect(result.history.trackedCharges.map((c) => c.key)).toEqual(["good"]);
    expect(result.dropped).toBe(4);
  });

  const brokenStones: Array<[string, Partial<Record<keyof Tombstone, unknown>>]> = [
    ["a wrong-type name", { name: 4 }],
    ["a name of 81 code points", { name: "x".repeat(81) }],
    ["a bad currency", { currency: "US" }],
    ["an unknown cadence", { cadence: "weekly-ish" }],
    ["negative cents", { amountCents: -2000 }],
    ["a bad buriedAt", { buriedAt: "2026-13-01" }],
    ["an impossible buriedAt", { buriedAt: "2026-02-30" }],
    ["a date-time as buriedAt", { buriedAt: "2026-05-04T00:00:00Z" }],
    ["a bad risenReportedThrough", { risenReportedThrough: "nope" }],
    ["a saving that does not match amount and cadence", { yearlySavingCents: 23999 }],
    ["a null saving when the cadence is known", { yearlySavingCents: null }],
    ["a saving when the cadence is assumed", { cadenceAssumed: true }],
  ];
  it.each(brokenStones)("drops a Tombstone with %s", (_label, change) => {
    const good = stone("good");
    const result = ok(withRaw("tombstones", [{ ...stone("bad"), ...change }, good]));
    expect(result.history.tombstones).toEqual([good]);
    expect(result.dropped).toBe(1);
  });

  it("keeps a Tombstone with an assumed cadence and a null saving", () => {
    const assumed = stone("a", { cadenceAssumed: true, yearlySavingCents: null });
    expect(ok(withRaw("tombstones", [assumed])).history.tombstones).toEqual([assumed]);
  });

  it("checks the saving against each cadence factor", () => {
    const weekly = stone("w", { cadence: "weekly", amountCents: 100, yearlySavingCents: 5200 });
    const yearly = stone("y", { cadence: "yearly", amountCents: 100, yearlySavingCents: 100 });
    const result = ok(withRaw("tombstones", [weekly, yearly]));
    expect(result.history.tombstones).toEqual([weekly, yearly]);
    expect(result.dropped).toBe(0);
  });

  const brokenScans: Array<[string, Partial<Record<keyof ScanRecord, unknown>>]> = [
    ["a wrong-type scanId", { scanId: 1 }],
    ["a date as scannedAt", { scannedAt: "2026-12-01" }],
    ["an impossible scannedAt", { scannedAt: "2026-12-01T25:00:00.000Z" }],
    ["a bad range date", { statementRange: { from: "2026-13-01", to: "2026-06-28" } }],
    ["a range that is not an object", { statementRange: "x" }],
    ["a negative count", { undeadCount: -1 }],
    ["a fractional count", { newCount: 0.5 }],
    ["a string count", { possessedCount: "0" }],
    [
      "a lower-case currency in the totals",
      { yearlyTotals: { usd: { yearlyCostCents: 1, guessedCount: 0 } } },
    ],
    ["negative totals", { yearlyTotals: { USD: { yearlyCostCents: -1, guessedCount: 0 } } }],
    ["totals that are an array", { yearlyTotals: [] }],
  ];
  it.each(brokenScans)("drops a Scan record with %s", (_label, change) => {
    const good = scan("good");
    const result = ok(withRaw("scans", [good, { ...scan("bad"), ...change }]));
    expect(result.history.scans).toEqual([good]);
    expect(result.dropped).toBe(1);
  });

  it("accepts a name of exactly 80 code points", () => {
    const name = "😀".repeat(80);
    const result = ok(withRaw("tombstones", [stone("a", { name })]));
    expect(result.history.tombstones[0]?.name).toBe(name);
    expect(result.dropped).toBe(0);
  });

  it("drops a non-string or empty reportedTrials entry", () => {
    const result = ok(withRaw("reportedTrials", ["a", 5, "", null, "b"]));
    expect(result.history.reportedTrials).toEqual(["a", "b"]);
    expect(result.dropped).toBe(3);
  });

  it("accepts a leap day and rejects a non-leap one", () => {
    const leap = stone("l", { buriedAt: "2028-02-29" });
    const notLeap = stone("n", { buriedAt: "2026-02-29" });
    const result = ok(withRaw("tombstones", [leap, notLeap]));
    expect(result.history.tombstones.map((s) => s.key)).toEqual(["l"]);
  });
});

describe("decodeHistory: duplicates", () => {
  it("drops and counts a repeated Tracked charge key", () => {
    const first = tracked("k", { amountCents: 1 });
    const result = ok(withRaw("trackedCharges", [first, tracked("k", { amountCents: 2 })]));
    expect(result.history.trackedCharges).toEqual([first]);
    expect(result.dropped).toBe(1);
  });

  it("drops and counts a repeated Tombstone key", () => {
    const first = stone("k", { name: "First" });
    const result = ok(withRaw("tombstones", [first, stone("k", { name: "Second" })]));
    expect(result.history.tombstones).toEqual([first]);
    expect(result.dropped).toBe(1);
  });

  it("drops and counts a repeated scan id", () => {
    const first = scan("s", { undeadCount: 1 });
    const result = ok(withRaw("scans", [first, scan("s", { undeadCount: 2 })]));
    expect(result.history.scans).toEqual([first]);
    expect(result.dropped).toBe(1);
  });

  it("drops and counts a repeated reportedTrials key", () => {
    const result = ok(withRaw("reportedTrials", ["a", "b", "a", "a"]));
    expect(result.history.reportedTrials).toEqual(["a", "b"]);
    expect(result.dropped).toBe(2);
  });
});

describe("limits", () => {
  it("keeps the 36 newest scans and does not count the cut ones", () => {
    const scans = Array.from({ length: 40 }, (_v, i) => scan(`s${i}`));
    const result = ok(withRaw("scans", scans));
    expect(result.history.scans.map((s) => s.scanId)).toEqual(scans.slice(4).map((s) => s.scanId));
    expect(result.dropped).toBe(0);
  });

  it("keeps the 1,000 Tracked charges with the newest lastSeenScan", () => {
    const scans = [scan("old"), scan("mid"), scan("new")];
    const charges = [
      ...Array.from({ length: 500 }, (_v, i) => tracked(`o${i}`, { lastSeenScan: "old" })),
      ...Array.from({ length: 600 }, (_v, i) => tracked(`n${i}`, { lastSeenScan: "new" })),
      ...Array.from({ length: 500 }, (_v, i) => tracked(`m${i}`, { lastSeenScan: "mid" })),
    ];
    const result = ok(withRaw("trackedCharges", charges, history({ scans })));
    const kept = result.history.trackedCharges;
    expect(kept).toHaveLength(LIMITS.trackedCharges);
    expect(kept.filter((c) => c.lastSeenScan === "new")).toHaveLength(600);
    expect(kept.filter((c) => c.lastSeenScan === "mid")).toHaveLength(400);
    expect(kept.filter((c) => c.lastSeenScan === "old")).toHaveLength(0);
    expect(result.dropped).toBe(0);
  });

  it("ranks a lastSeenScan that names no kept scan as oldest, ties in array order", () => {
    const scans = [scan("a")];
    const charges = [
      ...Array.from({ length: 999 }, (_v, i) => tracked(`x${i}`, { lastSeenScan: "gone" })),
      tracked("known", { lastSeenScan: "a" }),
      tracked("late-unknown", { lastSeenScan: "gone" }),
    ];
    const result = ok(withRaw("trackedCharges", charges, history({ scans })));
    const keys = result.history.trackedCharges.map((c) => c.key);
    expect(keys).toHaveLength(LIMITS.trackedCharges);
    expect(keys).toContain("known");
    expect(keys).toContain("x0");
    expect(keys).not.toContain("late-unknown");
  });

  it("keeps the 1,000 newest Tombstones by buriedAt", () => {
    const stones = [
      ...Array.from({ length: 1000 }, (_v, i) => stone(`n${i}`, { buriedAt: "2026-06-01" })),
      stone("older", { buriedAt: "2025-01-01" }),
      stone("newest", { buriedAt: "2026-07-01" }),
    ];
    const result = ok(withRaw("tombstones", stones));
    const keys = result.history.tombstones.map((s) => s.key);
    expect(keys).toHaveLength(LIMITS.tombstones);
    expect(keys).toContain("newest");
    expect(keys).not.toContain("older");
    expect(keys).not.toContain("n999");
    expect(result.dropped).toBe(0);
  });

  it("encodeHistory applies the same limits", () => {
    const scans = Array.from({ length: 40 }, (_v, i) => scan(`s${i}`));
    const text = encodeHistory(history({ scans }));
    expect(ok(text).history.scans).toHaveLength(LIMITS.scans);
  });
});

describe("emptyHistory and encodeHistory", () => {
  it("emptyHistory round-trips", () => {
    expect(decodeHistory(encodeHistory(emptyHistory()))).toEqual({
      kind: "ok",
      history: emptyHistory(),
      dropped: 0,
    });
  });

  it("writes one line of JSON with a final newline", () => {
    const text = encodeHistory(emptyHistory());
    expect(text.endsWith("}\n")).toBe(true);
    expect(text.trimEnd()).not.toContain("\n");
  });

  it("round-trips a full History", () => {
    const full = history({
      coreSource: "6d20c3eef19ba749a795b75a1e64b9573e2fedad",
      trackedCharges: [tracked("a")],
      tombstones: [stone("b")],
      scans: [scan("s1")],
      reportedTrials: ["a"],
    });
    expect(decodeHistory(encodeHistory(full))).toEqual({ kind: "ok", history: full, dropped: 0 });
  });
});
