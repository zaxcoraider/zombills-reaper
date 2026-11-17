import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import fc from "fast-check";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { moneyText } from "../../shared/src/money.ts";
import type { ScanSummary } from "../../shared/src/types.ts";
import { markersOf, oneOffAmountsOf, statementSetArb } from "../fixtures/generators.ts";
import type { StatementFile, StatementSet } from "../fixtures/generators.ts";
import { createReaperTools } from "./tools.js";

// Each run executes the full Pipeline on temp folders, so the property tests use 100 runs
// (design "Correctness properties").
const NUM_RUNS = 100;
// Each property writes temp folders and scans them many times; the default 5 s is too tight.
const TEST_TIMEOUT_MS = 120_000;
const NOW = new Date("2026-07-01T09:00:00Z");

let base: string;
let counter = 0;

beforeAll(async () => {
  base = await mkdtemp(join(tmpdir(), "reaper-scan-prop-"));
  // The scan logs one count line per call; keep the test output readable.
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
});

afterAll(async () => {
  vi.restoreAllMocks();
  await rm(base, { recursive: true, force: true });
});

interface Sandbox {
  folder: string;
  dataDir: string;
  scan: () => Promise<ScanSummary>;
  remove: () => Promise<void>;
}

async function sandbox(files: StatementFile[], historyText: string | null): Promise<Sandbox> {
  counter += 1;
  const root = join(base, `run-${counter}`);
  const folder = join(root, "statements");
  const dataDir = join(root, "data");
  await mkdir(folder, { recursive: true });
  await mkdir(dataDir, { recursive: true });
  for (const file of files) await writeFile(join(folder, file.name), file.text);
  await writeFile(
    join(dataDir, "settings.json"),
    JSON.stringify({ version: 1, statementsFolder: folder }),
  );
  if (historyText !== null) await writeFile(join(dataDir, "history.json"), historyText);
  const tools = createReaperTools({
    dataDir,
    appRoot: root,
    now: () => NOW,
    timeZone: "UTC",
    coreSource: "test-core-source",
  });
  return {
    folder,
    dataDir,
    scan: async () => {
      const result = await tools.get("scan_statements")?.handler({});
      if (result === undefined || (result as { ok: boolean }).ok !== true) {
        throw new Error(`scan failed: ${JSON.stringify(result)}`);
      }
      return result as unknown as ScanSummary;
    },
    remove: () => rm(root, { recursive: true, force: true }),
  };
}

/** The History left by first scanning the first `count` distinct months of the set (null for 0). */
async function prefixHistory(set: StatementSet, count: number): Promise<string | null> {
  if (count === 0) return null;
  const distinct = [...new Map(set.files.map((f) => [f.text, f] as const)).values()].sort((a, b) =>
    a.text < b.text ? -1 : a.text > b.text ? 1 : 0,
  );
  const box = await sandbox(distinct.slice(0, count), null);
  try {
    await box.scan();
    return await readFile(join(box.dataDir, "history.json"), "utf8");
  } finally {
    await box.remove();
  }
}

/** A set with a history made from a random prefix of its months. */
const setWithPrefixArb = statementSetArb.chain((set) => {
  const months = new Set(set.files.map((f) => f.text)).size;
  return fc.record({ set: fc.constant(set), prefix: fc.integer({ min: 0, max: months }) });
});

/** The summary as plain data without the fields that legitimately differ between scans. */
function without(summary: ScanSummary, ...fields: (keyof ScanSummary)[]): Partial<ScanSummary> {
  const copy: Partial<ScanSummary> = { ...summary };
  for (const field of ["scanId", ...fields] as (keyof ScanSummary)[]) delete copy[field];
  return copy;
}

/** Visits every object in a JSON value. */
function* objectsIn(value: unknown): Generator<Record<string, unknown>> {
  if (Array.isArray(value)) {
    for (const item of value) yield* objectsIn(item);
  } else if (typeof value === "object" && value !== null) {
    yield value as Record<string, unknown>;
    for (const item of Object.values(value)) yield* objectsIn(item);
  }
}

describe("scan_statements properties", () => {
  it(
    "P1: shuffling files and names gives the same summary apart from scanId",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          setWithPrefixArb.chain(({ set, prefix }) =>
            fc.record({
              set: fc.constant(set),
              prefix: fc.constant(prefix),
              order: fc.shuffledSubarray(
                set.files.map((_, i) => i),
                { minLength: set.files.length, maxLength: set.files.length },
              ),
              names: fc.uniqueArray(fc.stringMatching(/^[a-z]{3,10}$/u), {
                minLength: set.files.length,
                maxLength: set.files.length,
              }),
            }),
          ),
          async ({ set, prefix, order, names }) => {
            const history = await prefixHistory(set, prefix);
            const shuffled = order.map((index, position) => ({
              name: `${names[position] ?? "x"}.csv`,
              text: set.files[index]?.text ?? "",
            }));
            const a = await sandbox(set.files, history);
            const b = await sandbox(shuffled, history);
            try {
              expect(without(await b.scan())).toEqual(without(await a.scan()));
            } finally {
              await a.remove();
              await b.remove();
            }
          },
        ),
        { numRuns: NUM_RUNS },
      );
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "P2: [a] and [a, a] give the same summary apart from scanId and files",
    async () => {
      await fc.assert(
        fc.asyncProperty(setWithPrefixArb, async ({ set, prefix }) => {
          const history = await prefixHistory(set, prefix);
          const once = [...new Set(set.files.map((f) => f.text))].map((text, i) => ({
            name: `m-${i}.csv`,
            text,
          }));
          const twice = [...once, ...once.map((f) => ({ ...f, name: `copy-${f.name}` }))];
          const a = await sandbox(once, history);
          const b = await sandbox(twice, history);
          try {
            const left = without(await a.scan(), "files");
            const right = without(await b.scan(), "files");
            expect(right).toEqual(left);
          } finally {
            await a.remove();
            await b.remove();
          }
        }),
        { numRuns: NUM_RUNS },
      );
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "P3: a second scan of unchanged files reports nothing new",
    async () => {
      await fc.assert(
        fc.asyncProperty(setWithPrefixArb, async ({ set, prefix }) => {
          const box = await sandbox(set.files, await prefixHistory(set, prefix));
          try {
            const first = await box.scan();
            const second = await box.scan();
            expect(second.newUndead).toEqual([]);
            expect(second.possessed).toEqual([]);
            expect(second.trialTraps).toEqual([]);
            expect(second.risenAfterBurial).toEqual([]);
            expect(second.undead).toEqual(first.undead);
            expect(second.yearlyTotals).toEqual(first.yearlyTotals);
          } finally {
            await box.remove();
          }
        }),
        { numRuns: NUM_RUNS },
      );
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "P4: no one-off marker, one-off amount, processor residue, key or id reaches the summary",
    async () => {
      await fc.assert(
        fc.asyncProperty(setWithPrefixArb, async ({ set, prefix }) => {
          const box = await sandbox(set.files, await prefixHistory(set, prefix));
          try {
            const summary = await box.scan();
            const names = new Set(summary.undead.map((entry) => entry.name));
            const allowed = (text: string): boolean => [...names].some((n) => n.includes(text));

            // Strings: names may keep a marker only if an undead entry's Display name does.
            const json = JSON.stringify(summary);
            for (const marker of markersOf(set)) {
              if (json.includes(marker)) expect(allowed(marker)).toBe(true);
            }

            // Numbers: a one-off amount is not an entry's amount, and no Money text holds it.
            // Totals and per-year increases are sums and differences of recurring amounts, which
            // the generator does not keep apart from one-off amounts, so they are not compared.
            const amounts = new Set(oneOffAmountsOf(set));
            for (const object of objectsIn(summary)) {
              for (const field of [
                "amountCents",
                "yearlyCostCents",
                "fromAmountCents",
                "toAmountCents",
              ]) {
                if (field === "yearlyCostCents" && !("ref" in object)) continue; // yearlyTotals entry
                const value = object[field];
                if (typeof value === "number") expect(amounts.has(value)).toBe(false);
              }
              for (const key of ["key", "merchantKey", "id"]) {
                expect(Object.hasOwn(object, key)).toBe(false);
              }
            }
            for (const cents of amounts) {
              expect(json.includes(moneyText(cents, "USD"))).toBe(false);
            }
          } finally {
            await box.remove();
          }
        }),
        { numRuns: NUM_RUNS },
      );
    },
    TEST_TIMEOUT_MS,
  );
});
