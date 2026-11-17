import http from "node:http";
import https from "node:https";
import net from "node:net";
import { cp, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createReaperTools } from "./tools.js";

const ROUND_1 = new URL("../fixtures/demo/round-1/", import.meta.url).pathname;
const ROUND_2 = new URL("../fixtures/demo/round-2/", import.meta.url).pathname;

interface Original {
  restore: () => void;
}

let root: string;
let statements: string;
let networkCalls: string[];
let originals: Original[];

/** Replaces `target[key]` with a function that records the call and fails. */
function forbid(target: object, key: string, label: string): void {
  const record = target as Record<string, unknown>; // a test stub swaps a function by name
  const original = record[key];
  record[key] = () => {
    networkCalls.push(label);
    throw new Error(`network call: ${label}`);
  };
  originals.push({
    restore: () => {
      record[key] = original;
    },
  });
}

function tools() {
  return createReaperTools({
    dataDir: join(root, "data"),
    appRoot: join(root, "app"),
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

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "reaper-privacy-net-"));
  statements = join(root, "statements");
  await cp(ROUND_1, statements, { recursive: true });
  await mkdir(join(root, "app"), { recursive: true });
  networkCalls = [];
  originals = [];
  forbid(globalThis, "fetch", "fetch");
  forbid(http, "request", "http.request");
  forbid(https, "request", "https.request");
  forbid(net, "connect", "net.connect");
});

afterEach(async () => {
  for (const original of originals) original.restore();
  await rm(root, { recursive: true, force: true });
});

// Req 13.2: every tool works with the network functions replaced by failing stubs.
describe("tools make no network call", () => {
  it("runs the demo through every tool and calls no stub", async () => {
    const set = await call("set_statements_folder", { path: statements });
    expect(set["ok"]).toBe(true);

    const first = await call("scan_statements", {});
    expect(first["ok"]).toBe(true);
    expect(first["firstScan"]).toBe(true);

    await cp(ROUND_2, statements, { recursive: true });
    const second = await call("scan_statements", {});
    expect(second["ok"]).toBe(true);
    expect(second["firstScan"]).toBe(false);

    const buried = await call("bury", { service: "Netflix" });
    expect(buried["ok"]).toBe(true);
    const unburied = await call("unbury", { service: "Netflix" });
    expect(unburied["ok"]).toBe(true);
    const graveyard = await call("list_graveyard", {});
    expect(graveyard["ok"]).toBe(true);

    expect(networkCalls).toEqual([]);
  });
});
