import { cp, mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { History } from "../../shared/src/types.ts";
import { createReaperTools } from "./tools.js";

const ROUND_1 = new URL("../fixtures/demo/round-1/", import.meta.url).pathname;

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

async function scanRound1(): Promise<void> {
  statements = join(root, "statements");
  await cp(ROUND_1, statements, { recursive: true });
  await mkdir(dataDir, { recursive: true });
  await writeFile(
    join(dataDir, "settings.json"),
    JSON.stringify({ version: 1, statementsFolder: statements }),
  );
  const result = await call("scan_statements", {});
  expect(result["ok"]).toBe(true);
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "reaper-bury-"));
  dataDir = join(root, "data");
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("bury (skeleton)", () => {
  it("returns no-scan on a fresh Data dir", async () => {
    expect(await call("bury", { service: "Netflix" })).toEqual({ ok: false, reason: "no-scan" });
  });

  it("buries Netflix with a link and a yearly saving", async () => {
    await scanRound1();
    const result = await call("bury", { service: "Netflix" });
    expect(result["ok"]).toBe(true);
    expect(result["alreadyBuried"]).toBe(false);
    expect((result["cancel"] as { kind: string }).kind).toBe("link");
    const tombstone = result["tombstone"] as Record<string, unknown>;
    expect(tombstone["yearlySavingCents"]).toBe(18588);
    expect(tombstone["buriedAt"]).toBe("2026-07-01");
    expect(tombstone).not.toHaveProperty("key");
    expect(tombstone).not.toHaveProperty("merchantKey");
    expect(typeof tombstone["ref"]).toBe("string");

    const history = JSON.parse(await readFile(join(dataDir, "history.json"), "utf8")) as History;
    expect(history.tombstones).toHaveLength(1);
    expect((await stat(join(dataDir, "history.json"))).mode & 0o777).toBe(0o600);
  });

  it("answers a second bury with alreadyBuried and writes nothing", async () => {
    await scanRound1();
    await call("bury", { service: "Netflix" });
    const before = await readFile(join(dataDir, "history.json"));
    const result = await call("bury", { service: "netflix" });
    expect(result["ok"]).toBe(true);
    expect(result["alreadyBuried"]).toBe(true);
    expect((result["cancel"] as { kind: string }).kind).toBe("link");
    expect((await readFile(join(dataDir, "history.json"))).equals(before)).toBe(true);
  });

  it("gives an email draft for Planet Fitness", async () => {
    await scanRound1();
    const result = await call("bury", { service: "Planet Fitness" });
    expect(result["ok"]).toBe(true);
    expect((result["cancel"] as { kind: string }).kind).toBe("email");
  });

  it("returns not-found with no candidates for a service that is not there", async () => {
    await scanRound1();
    expect(await call("bury", { service: "Hulu" })).toEqual({
      ok: false,
      reason: "not-found",
      candidates: [],
    });
  });

  it("returns ambiguous with candidates when two charges share a name", async () => {
    await scanRound1();
    const path = join(dataDir, "history.json");
    const history = JSON.parse(await readFile(path, "utf8")) as History;
    const netflix = history.trackedCharges.find((c) => c.serviceId === "netflix");
    if (netflix === undefined) throw new Error("no netflix charge");
    history.trackedCharges.push({ ...netflix, key: "other-key", amountCents: 1999 });
    await writeFile(path, JSON.stringify(history));
    const result = await call("bury", { service: "Netflix" });
    expect(result["ok"]).toBe(false);
    expect(result["reason"]).toBe("ambiguous");
    expect(result["candidates"]).toEqual([
      { name: netflix.merchant, amountText: "$15.49", cadence: "monthly" },
      { name: netflix.merchant, amountText: "$19.99", cadence: "monthly" },
    ]);
  });

  it("does not read the statements folder", async () => {
    await scanRound1();
    await rename(statements, join(root, "moved-away"));
    const result = await call("bury", { service: "Spotify" });
    expect(result["ok"]).toBe(true);
  });

  it("rejects an empty service and an unknown key", async () => {
    await scanRound1();
    expect((await call("bury", { service: "" }))["reason"]).toBe("internal-error");
    expect((await call("bury", { service: "x", extra: 1 }))["reason"]).toBe("internal-error");
  });
});
