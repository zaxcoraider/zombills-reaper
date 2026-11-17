import { cp, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseStatement } from "@zombills/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createReaperTools } from "./tools.js";

const ROUND_1 = new URL("../fixtures/demo/round-1/", import.meta.url).pathname;
const ROUND_2 = new URL("../fixtures/demo/round-2/", import.meta.url).pathname;

let root: string;
let dataDir: string;
let statements: string;

function tools() {
  return createReaperTools({
    dataDir,
    appRoot: root,
    now: () => new Date("2026-07-01T09:00:00Z"),
    timeZone: "UTC",
    coreSource: "test-core-source",
  });
}

async function call(name: string, args: unknown): Promise<Record<string, unknown>> {
  const tool = tools().get(name);
  if (!tool) throw new Error(`${name} is not registered`);
  return (await tool.handler(args)) as Record<string, unknown>;
}

async function scanRound1(): Promise<Record<string, unknown>> {
  statements = join(root, "statements");
  await cp(ROUND_1, statements, { recursive: true });
  await mkdir(dataDir, { recursive: true });
  await writeFile(
    join(dataDir, "settings.json"),
    JSON.stringify({ version: 1, statementsFolder: statements }),
  );
  return call("scan_statements", {});
}

async function scanRound2(): Promise<Record<string, unknown>> {
  await cp(ROUND_2, statements, { recursive: true });
  return call("scan_statements", {});
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "reaper-demo-"));
  dataDir = join(root, "data");
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("demo statements", () => {
  it("has six round-1 files and three round-2 files", async () => {
    expect(await readdir(ROUND_1)).toHaveLength(6);
    expect((await readdir(ROUND_2)).sort()).toEqual(["2026-07.csv", "2026-08.csv", "2026-09.csv"]);
  });

  it("parses every demo file as mapped with the positive-out convention", async () => {
    for (const folder of [ROUND_1, ROUND_2]) {
      for (const name of await readdir(folder)) {
        const result = parseStatement(await readFile(join(folder, name), "utf8"));
        expect(result.status, name).toBe("mapped");
        if (result.status === "mapped") {
          expect(result.detectedSignConvention?.convention, name).toBe("positive-out");
        }
      }
    }
  });

  it("round 1 gives a first scan with 6 undead and USD 1181.40 a year", async () => {
    const result = await scanRound1();
    expect(result["ok"]).toBe(true);
    expect(result["firstScan"]).toBe(true);
    expect(result["undead"]).toHaveLength(6);
    expect(result["yearlyTotals"]).toEqual({ USD: { yearlyCostCents: 118140, guessedCount: 0 } });
  });

  it("round 2 gives one new undead (Paramount+) and one possessed (Netflix)", async () => {
    await scanRound1();
    const result = await scanRound2();
    expect(result["ok"]).toBe(true);
    expect(result["firstScan"]).toBe(false);
    const newUndead = result["newUndead"] as Record<string, unknown>[];
    expect(newUndead).toHaveLength(1);
    expect(newUndead[0]).toMatchObject({
      name: "Paramount+",
      amountCents: 1199,
      yearlyCostCents: 14388,
    });
    const possessed = result["possessed"] as Record<string, unknown>[];
    expect(possessed).toHaveLength(1);
    expect(possessed[0]).toMatchObject({
      name: "Netflix",
      fromAmountCents: 1549,
      toAmountCents: 1799,
      increasePerYearCents: 3000,
    });
    expect(result["trialTraps"]).toEqual([]);
    expect(result["risenAfterBurial"]).toEqual([]);
  });

  it("gives every undead a service id, in both rounds", async () => {
    const first = await scanRound1();
    for (const entry of first["undead"] as { serviceId: string | null }[]) {
      expect(entry.serviceId).not.toBeNull();
    }
    const second = await scanRound2();
    const undead = second["undead"] as { serviceId: string | null }[];
    expect(undead).toHaveLength(7);
    for (const entry of undead) expect(entry.serviceId).not.toBeNull();
  });

  it("bury Netflix gives a link and bury Planet Fitness gives an email", async () => {
    await scanRound1();
    await scanRound2();
    const netflix = await call("bury", { service: "Netflix" });
    expect(netflix["ok"]).toBe(true);
    expect((netflix["cancel"] as { kind: string }).kind).toBe("link");
    const gym = await call("bury", { service: "Planet Fitness" });
    expect(gym["ok"]).toBe(true);
    expect((gym["cancel"] as { kind: string }).kind).toBe("email");
  });
});
