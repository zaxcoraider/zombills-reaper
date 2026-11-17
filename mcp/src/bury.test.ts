import {
  cp,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  utimes,
  writeFile,
} from "node:fs/promises";
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

  it("returns history-newer and leaves the file byte-equal", async () => {
    await scanRound1();
    const path = join(dataDir, "history.json");
    await writeFile(path, '{"version":2,"future":true}\n');
    const before = await readFile(path);
    expect(await call("bury", { service: "Netflix" })).toEqual({
      ok: false,
      reason: "history-newer",
    });
    expect((await readFile(path)).equals(before)).toBe(true);
  });

  it("returns history-busy while a fresh lock is held", async () => {
    await scanRound1();
    const t = Date.now();
    let slept = 0;
    const clock = {
      now: () => t + slept,
      sleep: (ms: number): Promise<void> => {
        slept += ms;
        return Promise.resolve();
      },
    };
    const lockPath = join(dataDir, "history.lock");
    await writeFile(lockPath, JSON.stringify({ pid: process.pid, at: "x" }));
    await utimes(lockPath, t / 1000, t / 1000);
    const before = await readFile(join(dataDir, "history.json"));
    const tool = createReaperTools({
      dataDir,
      appRoot: root,
      now: () => new Date("2026-07-01T09:00:00Z"),
      timeZone: "UTC",
      coreSource: "test-core-source",
      lock: { timings: { pollMs: 50, waitMs: 500, staleMs: 30_000 }, clock },
    }).get("bury");
    expect(await tool?.handler({ service: "Netflix" })).toEqual({
      ok: false,
      reason: "history-busy",
    });
    expect((await readFile(join(dataDir, "history.json"))).equals(before)).toBe(true);
  });

  it("reports historyDropped beside ok when its load dropped a record", async () => {
    await scanRound1();
    const path = join(dataDir, "history.json");
    const history = JSON.parse(await readFile(path, "utf8")) as History;
    history.scans.push({ scanId: "bad", scannedAt: "nope" } as unknown as History["scans"][number]);
    await writeFile(path, JSON.stringify(history));
    const result = await call("bury", { service: "Spotify" });
    expect(result["ok"]).toBe(true);
    expect(result["historyDropped"]).toBe(1);
    expect(result).not.toHaveProperty("historyReset");
    expect((await readdir(dataDir)).some((n) => n.startsWith("history.backup-"))).toBe(true);
  });
});

describe("bury (resolver)", () => {
  it("names only History charges in ambiguous candidates, closest first", async () => {
    await scanRound1();
    const path = join(dataDir, "history.json");
    const history = JSON.parse(await readFile(path, "utf8")) as History;
    const netflix = history.trackedCharges.find((c) => c.serviceId === "netflix");
    if (netflix === undefined) throw new Error("no netflix charge");
    history.trackedCharges.push({ ...netflix, key: "k-2", amountCents: 999 });
    await writeFile(path, JSON.stringify(history));
    const result = await call("bury", { service: "net" });
    expect(result["reason"]).toBe("ambiguous");
    const names = (result["candidates"] as { name: string }[]).map((c) => c.name);
    expect(names).toEqual([netflix.merchant, netflix.merchant]);
    expect(result["candidates"]).toEqual([
      { name: netflix.merchant, amountText: "$9.99", cadence: "monthly" },
      { name: netflix.merchant, amountText: "$15.49", cadence: "monthly" },
    ]);
    const picked = await call("bury", { service: "Netflix 9.99" });
    expect(picked["ok"]).toBe(true);
  });

  it("does not treat a charge missing from the last scan as a Current charge", async () => {
    await scanRound1();
    const path = join(dataDir, "history.json");
    const history = JSON.parse(await readFile(path, "utf8")) as History;
    const netflix = history.trackedCharges.find((c) => c.serviceId === "netflix");
    if (netflix === undefined) throw new Error("no netflix charge");
    netflix.lastSeenScan = "scan-older";
    await writeFile(path, JSON.stringify(history));
    const before = await readFile(path);
    expect(await call("bury", { service: "Netflix" })).toEqual({
      ok: false,
      reason: "not-found",
      candidates: [],
    });
    expect((await readFile(path)).equals(before)).toBe(true);
  });

  it("finds an existing Tombstone through pass 2 after the subscription id changed", async () => {
    await scanRound1();
    await call("bury", { service: "Netflix" });
    const path = join(dataDir, "history.json");
    const history = JSON.parse(await readFile(path, "utf8")) as History;
    const [tomb] = history.tombstones;
    if (tomb === undefined) throw new Error("no tombstone");
    tomb.key = "an-older-subscription-id";
    await writeFile(path, JSON.stringify(history));
    const before = await readFile(path);
    const result = await call("bury", { service: "Netflix" });
    expect(result["ok"]).toBe(true);
    expect(result["alreadyBuried"]).toBe(true);
    expect((await readFile(path)).equals(before)).toBe(true);
  });
});
