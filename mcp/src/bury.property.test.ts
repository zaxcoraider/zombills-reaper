import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import fc from "fast-check";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { History, TrackedCharge } from "../../shared/src/types.ts";
import { statementSetArb } from "../fixtures/generators.ts";
import type { StatementSet } from "../fixtures/generators.ts";
import { currentCharges } from "./bury.js";
import { resolveService } from "./resolve-service.js";
import { createReaperTools } from "./tools.js";

// Each run executes the full Pipeline on temp folders, so the property tests use 100 runs
// (design "Correctness properties").
const NUM_RUNS = 100;
// Each run scans and calls bury and unbury many times; the default 5 s is too tight.
const TEST_TIMEOUT_MS = 120_000;
const NOW = new Date("2026-07-01T09:00:00Z");

let base: string;
let counter = 0;

beforeAll(async () => {
  base = await mkdtemp(join(tmpdir(), "reaper-bury-prop-"));
  // Every call logs one count line; keep the test output readable.
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
});

afterAll(async () => {
  vi.restoreAllMocks();
  await rm(base, { recursive: true, force: true });
});

interface Sandbox {
  dataDir: string;
  call: (name: string, args: unknown) => Promise<Record<string, unknown>>;
  history: () => Promise<History>;
  historyBytes: () => Promise<Buffer>;
  remove: () => Promise<void>;
}

/** Writes the set to a temp folder, scans it once and returns handles on the result. */
async function scannedSandbox(set: StatementSet): Promise<Sandbox> {
  counter += 1;
  const root = join(base, `run-${counter}`);
  const folder = join(root, "statements");
  const dataDir = join(root, "data");
  await mkdir(folder, { recursive: true });
  await mkdir(dataDir, { recursive: true });
  for (const file of set.files) await writeFile(join(folder, file.name), file.text);
  await writeFile(
    join(dataDir, "settings.json"),
    JSON.stringify({ version: 1, statementsFolder: folder }),
  );
  const tools = createReaperTools({
    dataDir,
    appRoot: root,
    now: () => NOW,
    timeZone: "UTC",
    coreSource: "test-core-source",
  });
  const call = async (name: string, args: unknown): Promise<Record<string, unknown>> => {
    const tool = tools.get(name);
    if (tool === undefined) throw new Error(`${name} is not registered`);
    return (await tool.handler(args)) as Record<string, unknown>;
  };
  const scan = await call("scan_statements", {});
  if (scan["ok"] !== true) throw new Error(`scan failed: ${JSON.stringify(scan)}`);
  const path = join(dataDir, "history.json");
  return {
    dataDir,
    call,
    history: async () => JSON.parse(await readFile(path, "utf8")) as History,
    historyBytes: () => readFile(path),
    remove: () => rm(root, { recursive: true, force: true }),
  };
}

interface Op {
  kind: "bury" | "unbury";
  pick: number;
  withAmount: boolean;
}

const opArb: fc.Arbitrary<Op> = fc.record({
  kind: fc.constantFrom("bury" as const, "unbury" as const),
  pick: fc.nat({ max: 50 }),
  withAmount: fc.boolean(),
});

/** The text a user might type for a charge: its name, optionally with its amount in cents / 100. */
function textFor(charge: TrackedCharge, withAmount: boolean): string {
  if (!withAmount) return charge.merchant;
  const cents = String(charge.amountCents % 100).padStart(2, "0");
  return `${charge.merchant} ${Math.floor(charge.amountCents / 100)}.${cents}`;
}

describe("bury and unbury properties", () => {
  it(
    "P7: bury then unbury of an unburied charge leaves the History deeply equal",
    async () => {
      await fc.assert(
        fc.asyncProperty(statementSetArb, fc.array(opArb, { maxLength: 6 }), async (set, setup) => {
          const box = await scannedSandbox(set);
          try {
            const charges = currentCharges(await box.history());
            for (const op of setup) {
              const target = charges[op.pick % Math.max(1, charges.length)];
              if (target === undefined) break;
              await box.call(op.kind, { service: textFor(target, op.withAmount) });
            }
            const start = await box.history();
            const buried = new Set(start.tombstones.map((t) => t.key));
            for (const e of currentCharges(start)) {
              if (buried.has(e.key)) continue;
              const found = resolveService(e.merchant, currentCharges(start));
              if (found.kind !== "one" || found.entry.key !== e.key) continue;
              const before = await box.historyBytes();
              const buryResult = await box.call("bury", { service: e.merchant });
              // Another Tombstone already covers this charge (match pass 2): nothing was added.
              if (buryResult["ok"] !== true || buryResult["alreadyBuried"] === true) continue;
              const result = await box.call("unbury", { service: e.merchant });
              expect(result["ok"]).toBe(true);
              expect((await box.historyBytes()).equals(before)).toBe(true);
              expect(await box.history()).toEqual(start);
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

  it(
    "P8: no sequence of bury and unbury calls leaves a Tombstone key twice",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          statementSetArb,
          fc.array(opArb, { minLength: 1, maxLength: 12 }),
          async (set, ops) => {
            const box = await scannedSandbox(set);
            try {
              const charges = currentCharges(await box.history());
              for (const op of ops) {
                const target = charges[op.pick % Math.max(1, charges.length)];
                if (target === undefined) break;
                await box.call(op.kind, { service: textFor(target, op.withAmount) });
                const keys = (await box.history()).tombstones.map((t) => t.key);
                expect(new Set(keys).size).toBe(keys.length);
              }
            } finally {
              await box.remove();
            }
          },
        ),
        { numRuns: NUM_RUNS },
      );
    },
    TEST_TIMEOUT_MS,
  );
});
