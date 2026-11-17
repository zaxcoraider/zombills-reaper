import { classifySubscriptions } from "@zombills/core";
import { describe, expect, it, vi } from "vitest";
import { emptyHistory } from "../../shared/src/history-codec.ts";
import { refOf } from "../../shared/src/ref.ts";
import type { History, Tombstone } from "../../shared/src/types.ts";
import { daysBetween } from "./scan-diff.js";
import { csvOf, flat, monthsFrom, runDiff, subsOf, TEST_CORE_SOURCE } from "./test-scan-input.js";
import type { TestSeries } from "./test-scan-input.js";

// The real classifier, wrapped so a test can see the answers `diffScan` passes to it (Req 6.6).
vi.mock("@zombills/core", async (importOriginal) => {
  const original = await importOriginal<typeof import("@zombills/core")>();
  return { ...original, classifySubscriptions: vi.fn(original.classifySubscriptions) };
});

const scanId = (n: number): string => `scan-20260701T0000${String(n).padStart(2, "0")}Z-00000${n}`;

/** One scan of `series` against `history`; `n` makes the scan id and the scan time distinct. */
function step(history: History, series: TestSeries[], n: number, over = {}) {
  return runDiff(subsOf([csvOf(series)]), history, {
    scanId: scanId(n),
    now: new Date(`2026-07-01T00:00:${String(n).padStart(2, "0")}.000Z`),
    ...over,
  });
}

const dropbox = (count = 8): TestSeries => flat("DROPBOX*PLUS", "2026-01", count, "11.99");
const netflix = (amounts: string[]): TestSeries => ({
  description: "NETFLIX.COM",
  months: monthsFrom("2026-01", amounts.length),
  amounts,
});
const rep = (amount: string, n: number): string[] => Array.from({ length: n }, () => amount);
/** Spotify with an intro charge and three full ones (a trial trap), ending in 2026-08. */
const spotifyTrial = (): TestSeries => ({
  description: "SPOTIFY USA",
  months: monthsFrom("2026-05", 4),
  amounts: ["1.00", "11.99", "11.99", "11.99"],
});

function buryTracked(history: History, name: string, buriedAt: string): History {
  const t = history.trackedCharges.find((c) => c.merchant === name);
  if (t === undefined) throw new Error(`no tracked charge ${name}`);
  const tomb: Tombstone = {
    key: t.key,
    name: t.merchant,
    serviceId: t.serviceId,
    currency: t.currency,
    cadence: t.cadence,
    merchantKey: t.merchantKey,
    amountCents: t.amountCents,
    cadenceAssumed: t.cadenceAssumed,
    yearlySavingCents: t.amountCents * 12,
    buriedAt,
    risenReportedThrough: null,
  };
  return { ...history, tombstones: [...history.tombstones, tomb] };
}

describe("daysBetween", () => {
  it("counts calendar days without a time zone", () => {
    expect(daysBetween("2026-03-01", "2026-03-04")).toBe(3);
    expect(daysBetween("2026-02-27", "2026-03-02")).toBe(3);
    expect(daysBetween("2026-03-04", "2026-03-01")).toBe(-3);
    expect(daysBetween("2026-03-29", "2026-03-30")).toBe(1);
  });
});

describe("diffScan: first scan and re-baseline", () => {
  it("first scan reports nothing and records trials and rises", () => {
    const { summary, nextHistory } = step(
      emptyHistory(),
      [dropbox(), netflix([...rep("15.49", 4), ...rep("17.99", 4)]), spotifyTrial()],
      1,
    );
    expect(summary.firstScan).toBe(true);
    expect(summary.newUndead).toEqual([]);
    expect(summary.possessed).toEqual([]);
    expect(summary.trialTraps).toEqual([]);
    expect(summary.risenAfterBurial).toEqual([]);
    expect(summary.undead.map((u) => u.name).sort()).toEqual(["Dropbox", "Netflix", "Spotify"]);
    const nf = nextHistory.trackedCharges.find((c) => c.merchant === "Netflix");
    expect(nf?.reportedRiseDate).toBe("2026-05-10");
    const sp = summary.undead.find((u) => u.name === "Spotify");
    expect(sp?.labels).toEqual(["trial-trap"]);
    expect(nextHistory.reportedTrials).toHaveLength(1);
    expect(nextHistory.trackedCharges).toHaveLength(3);
    expect(nextHistory.coreSource).toBe(TEST_CORE_SOURCE);
    expect(nextHistory.scans).toHaveLength(1);
  });

  it("a different coreSource re-baselines: Tracked charges rebuilt, Tombstones kept, nothing reported", () => {
    const series = [dropbox(), netflix(rep("15.49", 8))];
    let h = step(emptyHistory(), series, 1).nextHistory;
    h = buryTracked(h, "Netflix", "2026-02-01");
    const before = h.trackedCharges.map((c) => c.firstSeenScan);
    const { summary, nextHistory } = step(h, [...series, spotifyTrial()], 2, {
      coreSource: "b".repeat(40),
    });
    expect(before).toEqual([scanId(1), scanId(1)]);
    expect(summary.firstScan).toBe(true);
    expect(summary.newUndead).toEqual([]);
    expect(summary.possessed).toEqual([]);
    expect(summary.trialTraps).toEqual([]);
    expect(nextHistory.coreSource).toBe("b".repeat(40));
    expect(nextHistory.trackedCharges).toHaveLength(3);
    expect(nextHistory.trackedCharges.every((c) => c.firstSeenScan === scanId(2))).toBe(true);
    expect(nextHistory.tombstones).toHaveLength(1);
    expect(summary.undead.find((u) => u.name === "Netflix")?.buried).toBe(true);
    expect(nextHistory.reportedTrials).toHaveLength(1);
  });
});

describe("diffScan: new undead, possessed, trial trap", () => {
  it("reports a new undead once", () => {
    const h1 = step(emptyHistory(), [dropbox()], 1).nextHistory;
    const second = step(h1, [dropbox(), netflix(rep("15.49", 8))], 2);
    expect(second.summary.firstScan).toBe(false);
    expect(second.summary.newUndead.map((u) => u.name)).toEqual(["Netflix"]);
    expect(second.summary.newUndead[0]?.ref).toBe(
      refOf(second.nextHistory.trackedCharges.find((c) => c.merchant === "Netflix")?.key ?? ""),
    );
    const third = step(second.nextHistory, [dropbox(), netflix(rep("15.49", 8))], 3);
    expect(third.summary.newUndead).toEqual([]);
    expect(third.nextHistory.trackedCharges).toHaveLength(2);
  });

  it("reports a price rise once and not again after a dip", () => {
    const h1 = step(emptyHistory(), [dropbox(6), netflix(rep("15.49", 6))], 1).nextHistory;
    const rise = [...rep("15.49", 4), ...rep("17.99", 2)];
    const second = step(h1, [dropbox(6), netflix(rise)], 2);
    expect(second.summary.possessed).toEqual([
      {
        ref: refOf(
          second.nextHistory.trackedCharges.find((c) => c.merchant === "Netflix")?.key ?? "",
        ),
        name: "Netflix",
        currency: "USD",
        cadence: "monthly",
        fromAmountCents: 1549,
        toAmountCents: 1799,
        increasePerYearCents: 3000,
      },
    ]);
    expect(second.summary.undead.find((u) => u.name === "Netflix")?.labels).toEqual(["possessed"]);
    const dip = [...rise, ...rep("16.49", 2)];
    const third = step(second.nextHistory, [dropbox(8), netflix(dip)], 3);
    expect(third.summary.possessed).toEqual([]);
    const fourth = step(third.nextHistory, [dropbox(8), netflix(dip)], 4);
    expect(fourth.summary.possessed).toEqual([]);
  });

  it("a charge already possessed when first seen is new undead now and not possessed on the re-scan", () => {
    const h1 = step(emptyHistory(), [dropbox()], 1).nextHistory;
    const series = [dropbox(), netflix([...rep("15.49", 4), ...rep("17.99", 4)])];
    const second = step(h1, series, 2);
    expect(second.summary.newUndead.map((u) => u.name)).toEqual(["Netflix"]);
    expect(second.summary.newUndead[0]?.labels).toEqual(["possessed"]);
    expect(second.summary.possessed).toEqual([]);
    const third = step(second.nextHistory, series, 3);
    expect(third.summary.newUndead).toEqual([]);
    expect(third.summary.possessed).toEqual([]);
  });

  it("reports a trial trap once", () => {
    const h1 = step(emptyHistory(), [dropbox()], 1).nextHistory;
    const second = step(h1, [dropbox(), spotifyTrial()], 2);
    expect(second.summary.trialTraps).toHaveLength(1);
    expect(second.summary.trialTraps[0]).toMatchObject({
      name: "Spotify",
      currency: "USD",
      cadence: "monthly",
      amountCents: 1199,
      firstFullChargeDate: "2026-06-10",
    });
    expect(second.summary.newUndead.map((u) => u.name)).toEqual(["Spotify"]);
    expect(second.nextHistory.reportedTrials).toHaveLength(1);
    const third = step(second.nextHistory, [dropbox(), spotifyTrial()], 3);
    expect(third.summary.trialTraps).toEqual([]);
    expect(third.nextHistory.reportedTrials).toHaveLength(1);
  });
});

describe("diffScan: risen after burial", () => {
  const series = [dropbox(), netflix(rep("15.49", 8))];
  // The last Netflix charge is 2026-08-10.
  function buriedOn(date: string): History {
    const h1 = step(emptyHistory(), series, 1).nextHistory;
    return buryTracked(h1, "Netflix", date);
  }

  it("does not report a charge 3 days after burial", () => {
    const { summary } = step(buriedOn("2026-08-07"), series, 2);
    expect(summary.risenAfterBurial).toEqual([]);
    expect(summary.newUndead).toEqual([]);
    expect(summary.undead.find((u) => u.name === "Netflix")?.buried).toBe(true);
  });

  it("reports a charge 4 days after burial, then not again for the same date", () => {
    const second = step(buriedOn("2026-08-06"), series, 2);
    expect(second.summary.risenAfterBurial).toHaveLength(1);
    expect(second.summary.risenAfterBurial[0]).toMatchObject({
      name: "Netflix",
      currency: "USD",
      amountCents: 1549,
      buriedAt: "2026-08-06",
      lastChargeDate: "2026-08-10",
    });
    expect(second.nextHistory.tombstones[0]?.risenReportedThrough).toBe("2026-08-10");
    const third = step(second.nextHistory, series, 3);
    expect(third.summary.risenAfterBurial).toEqual([]);
    const later = [dropbox(9), netflix(rep("15.49", 9))];
    const fourth = step(third.nextHistory, later, 4);
    expect(fourth.summary.risenAfterBurial).toHaveLength(1);
    expect(fourth.summary.risenAfterBurial[0]?.lastChargeDate).toBe("2026-09-10");
  });

  it("reports on a first scan too, so a re-baseline hides nothing", () => {
    const { summary } = step(buriedOn("2026-08-06"), series, 2, { coreSource: "c".repeat(40) });
    expect(summary.firstScan).toBe(true);
    expect(summary.risenAfterBurial).toHaveLength(1);
  });

  it("passes not-using answers for buried active subscriptions to the classifier (Req 6.6)", () => {
    const mocked = vi.mocked(classifySubscriptions);
    const history = buriedOn("2026-08-07");
    mocked.mockClear();
    step(history, series, 2);
    const answers = mocked.mock.calls[0]?.[1];
    expect(answers).toBeInstanceOf(Map);
    expect([...(answers as Map<string, string>).values()]).toEqual(["not-using"]);
    expect((answers as Map<string, string>).size).toBe(1);
  });
});

describe("diffScan: blocked subscriptions and ended series", () => {
  it("a Tracked charge seen last scan that cannot be matched blocks a same-Triple subscription", () => {
    const h1 = step(emptyHistory(), [dropbox(6), netflix(rep("15.49", 6))], 1).nextHistory;
    const changed: History = {
      ...h1,
      trackedCharges: h1.trackedCharges.map((c) =>
        c.merchant === "Netflix" ? { ...c, key: "gone", amountCents: 999 } : c,
      ),
    };
    const { summary, nextHistory } = step(changed, [dropbox(6), netflix(rep("15.49", 6))], 2);
    expect(summary.newUndead).toEqual([]);
    expect(summary.possessed).toEqual([]);
    expect(summary.undead.map((u) => u.name)).toContain("Netflix");
    // History for the blocked subscription is unchanged: the old record stays, no new one is added.
    expect(nextHistory.trackedCharges.filter((c) => c.merchant === "Netflix")).toEqual(
      changed.trackedCharges.filter((c) => c.merchant === "Netflix"),
    );
    expect(nextHistory.trackedCharges).toHaveLength(2);
  });

  it("a Tracked charge missing for two scans blocks nothing", () => {
    const h1 = step(emptyHistory(), [dropbox(6), netflix(rep("15.49", 6))], 1).nextHistory;
    const h2 = step(h1, [dropbox(6)], 2).nextHistory;
    expect(h2.trackedCharges.find((c) => c.merchant === "Netflix")?.lastSeenScan).toBe(scanId(1));
    const third = step(h2, [dropbox(6), netflix(rep("15.49", 6))], 3);
    // Netflix returned with the same price: the old record is matched, not reported as new.
    expect(third.summary.newUndead).toEqual([]);
    const stale: History = {
      ...h2,
      trackedCharges: h2.trackedCharges.map((c) =>
        c.merchant === "Netflix" ? { ...c, key: "gone", amountCents: 999 } : c,
      ),
    };
    const fourth = step(stale, [dropbox(6), netflix(rep("15.49", 6))], 3);
    expect(fourth.summary.newUndead.map((u) => u.name)).toEqual(["Netflix"]);
  });

  it("an ended buried Netflix plus a new active Netflix: the new one is new undead", () => {
    const h1 = buryTracked(
      step(emptyHistory(), [dropbox(3), netflix(rep("15.49", 3))], 1).nextHistory,
      "Netflix",
      "2026-03-20",
    );
    const resub: TestSeries = {
      description: "NETFLIX.COM",
      months: [...monthsFrom("2026-01", 3), ...monthsFrom("2026-06", 3)],
      amounts: [...rep("15.49", 3), ...rep("17.99", 3)],
    };
    const { summary, nextHistory } = step(h1, [dropbox(8), resub], 2);
    const ended = subsOf([csvOf([dropbox(8), resub])]).find((s) => s.status === "ended");
    expect(ended).toBeDefined();
    expect(summary.newUndead.map((u) => u.name)).toEqual(["Netflix"]);
    expect(summary.newUndead[0]?.amountCents).toBe(1799);
    expect(summary.newUndead[0]?.buried).toBe(false);
    expect(summary.risenAfterBurial).toEqual([]);
    expect(nextHistory.tombstones).toHaveLength(1);
    expect(nextHistory.tombstones[0]?.key).toBe(ended?.id);
    expect(nextHistory.trackedCharges.filter((c) => c.merchant === "Netflix")).toHaveLength(2);
  });

  it("an ended iCloud and a new Apple Arcade on APPLE.COM/BILL: Apple Arcade is reported", () => {
    const apple = (start: string, count: number, amount: string): TestSeries => ({
      ...flat("APPLE.COM/BILL", start, count, amount),
      day: "11",
    });
    const first = [dropbox(3), apple("2026-01", 3, "2.99")];
    const h1 = step(emptyHistory(), first, 1).nextHistory;
    const later: TestSeries = {
      description: "APPLE.COM/BILL",
      months: [...monthsFrom("2026-01", 3), ...monthsFrom("2026-06", 3)],
      amounts: [...rep("2.99", 3), ...rep("6.99", 3)],
      day: "11",
    };
    const { summary, nextHistory } = step(h1, [dropbox(8), later], 2);
    expect(summary.newUndead).toHaveLength(1);
    expect(summary.newUndead[0]?.amountCents).toBe(699);
    const ended = nextHistory.trackedCharges.find((c) => c.amountCents === 299);
    expect(ended?.lastSeenScan).toBe(scanId(1));
    expect(nextHistory.trackedCharges).toHaveLength(3);
  });
});

describe("diffScan: the Scan record and entries", () => {
  it("builds the Scan record, totals and entry fields", () => {
    const h1 = step(emptyHistory(), [dropbox(6)], 1).nextHistory;
    const rise = [...rep("15.49", 4), ...rep("17.99", 2)];
    const series = [dropbox(6), netflix(rise)];
    const second = step(h1, series, 2, { folderName: "my-folder" });
    expect(second.nextHistory.scans).toHaveLength(2);
    expect(second.nextHistory.scans[1]).toEqual({
      scanId: scanId(2),
      scannedAt: "2026-07-01T00:00:02.000Z",
      statementRange: { from: "2026-01-01", to: "2026-06-30" },
      undeadCount: 2,
      yearlyTotals: { USD: { yearlyCostCents: (1199 + 1799) * 12, guessedCount: 0 } },
      newCount: 1,
      possessedCount: 0,
    });
    expect(second.summary.folderName).toBe("my-folder");
    expect(second.summary.historyReset).toBe(false);
    expect(second.summary.historyDropped).toBe(0);
    const [first, secondEntry] = second.summary.undead;
    expect(first).toEqual({
      ref: refOf(
        second.nextHistory.trackedCharges.find((c) => c.merchant === "Netflix")?.key ?? "",
      ),
      name: "Netflix",
      serviceId: "netflix",
      currency: "USD",
      cadence: "monthly",
      amountCents: 1799,
      yearlyCostCents: 1799 * 12,
      cadenceAssumed: false,
      labels: ["possessed"],
      firstChargeDate: "2026-01-10",
      lastChargeDate: "2026-06-10",
      buried: false,
    });
    expect(secondEntry?.name).toBe("Dropbox");
    expect(JSON.stringify(second.summary)).not.toMatch(/"(key|merchantKey|id)"/);
  });

  it("records a possessed scan in possessedCount", () => {
    const h1 = step(emptyHistory(), [dropbox(6), netflix(rep("15.49", 6))], 1).nextHistory;
    const rise = [...rep("15.49", 4), ...rep("17.99", 2)];
    const second = step(h1, [dropbox(6), netflix(rise)], 2);
    expect(second.nextHistory.scans[1]?.possessedCount).toBe(1);
    expect(
      second.nextHistory.trackedCharges.find((c) => c.merchant === "Netflix")?.reportedRiseDate,
    ).toBe("2026-05-10");
  });
});
