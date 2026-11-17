import { mkdir, mkdtemp, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { emptyHistory, encodeHistory } from "../../shared/src/history-codec.ts";
import type { History } from "../../shared/src/types.ts";
import { ReplayCache } from "./replay-cache.ts";
import { handle } from "./routes.ts";
import type { RouteContext, RouteRequest } from "./routes.ts";
import { referenceHeader } from "./test-proxy-signer.ts";

const SECRET = "test-secret-for-reaper";
const NOW = 1800000000;
let nonceCounter = 0;

function nextNonce(): string {
  nonceCounter += 1;
  return nonceCounter.toString(16).padStart(32, "0");
}

function signedRequest(method: string, url: string, body = Buffer.alloc(0)): RouteRequest {
  const nonce = nextNonce();
  const header = referenceHeader({
    secret: SECRET,
    tsStr: String(NOW),
    nonce,
    method,
    target: url,
    body,
  });
  return {
    method,
    url,
    headers: { "x-kirocrew-proxy-v2": header, "x-kirocrew-proxy-nonce": nonce },
    body,
  };
}

function historyWithOneBurial(): History {
  return {
    ...emptyHistory(),
    tombstones: [
      {
        key: "secret-core-key",
        name: "Netflix",
        serviceId: "netflix",
        currency: "USD",
        cadence: "monthly",
        merchantKey: "secret-merchant-key",
        amountCents: 1549,
        cadenceAssumed: false,
        yearlySavingCents: 18588,
        buriedAt: "2026-02-10",
        risenReportedThrough: null,
      },
    ],
    scans: [
      {
        scanId: "scan-20260201T100000Z-abc123",
        scannedAt: "2026-02-01T10:00:00.000Z",
        statementRange: { from: "2026-01-01", to: "2026-01-31" },
        undeadCount: 3,
        yearlyTotals: { USD: { yearlyCostCents: 50000, guessedCount: 0 } },
        newCount: 3,
        possessedCount: 0,
      },
    ],
  };
}

async function snapshot(dir: string): Promise<string> {
  const names = (await readdir(dir)).sort();
  const parts: string[] = [];
  for (const name of names) {
    const s = await stat(join(dir, name));
    parts.push(`${name}:${s.size}:${s.mtimeMs}`);
  }
  return parts.join("|");
}

describe("backend routes", () => {
  let tmp: string;
  let dataDir: string;
  let context: RouteContext;

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), "reaper-routes-"));
    dataDir = join(tmp, "data");
    await mkdir(dataDir);
    context = {
      dataDir,
      secret: SECRET,
      cache: new ReplayCache(),
      nowSeconds: NOW,
      timeZone: "UTC",
    };
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it("answers health without headers and without reading the Data dir", async () => {
    const reply = await handle(
      { method: "GET", url: "/api/health", headers: {}, body: Buffer.alloc(0) },
      { ...context, dataDir: join(tmp, "missing") },
    );
    expect(reply).toEqual({ status: 200, json: { ok: true } });
  });

  it("refuses with 401 when there are no headers, a bad signature or a replay", async () => {
    const none = await handle(
      { method: "GET", url: "/api/graveyard", headers: {}, body: Buffer.alloc(0) },
      context,
    );
    expect(none).toEqual({ status: 401, json: { error: "unauthorized" } });

    const good = signedRequest("GET", "/api/graveyard");
    const badHeaders = { ...good.headers, "x-kirocrew-proxy-v2": `${NOW}:${"0".repeat(64)}` };
    const bad = await handle({ ...good, headers: badHeaders }, context);
    expect(bad.status).toBe(401);

    expect((await handle(good, context)).status).toBe(200);
    const replay = await handle(good, context);
    expect(replay).toEqual({ status: 401, json: { error: "unauthorized" } });
  });

  it("answers 405 for a signed POST and 404 for another path", async () => {
    expect((await handle(signedRequest("POST", "/api/graveyard"), context)).status).toBe(405);
    expect((await handle(signedRequest("GET", "/api/other"), context)).status).toBe(404);
  });

  it("returns an empty graveyard for an empty Data dir", async () => {
    const reply = await handle(signedRequest("GET", "/api/graveyard"), context);
    expect(reply.status).toBe(200);
    expect(reply.json).toEqual({
      ok: true,
      tombstones: [],
      savings: {},
      months: [],
      lastScan: null,
    });
  });

  it("returns the view, the last scan and no key or merchantKey", async () => {
    await writeFile(join(dataDir, "history.json"), encodeHistory(historyWithOneBurial()));
    const reply = await handle(signedRequest("GET", "/api/graveyard?x=1"), context);
    expect(reply.status).toBe(200);
    const json = reply.json as {
      ok: boolean;
      tombstones: { name: string; ref: string }[];
      savings: Record<string, { yearlySavingCents: number }>;
      lastScan: { undeadCount: number } | null;
    };
    expect(json.ok).toBe(true);
    expect(json.tombstones).toHaveLength(1);
    expect(json.tombstones[0]?.name).toBe("Netflix");
    expect(json.savings["USD"]?.yearlySavingCents).toBe(18588);
    expect(json.lastScan?.undeadCount).toBe(3);
    const text = JSON.stringify(reply.json);
    expect(text).not.toContain("secret-core-key");
    expect(text).not.toContain("secret-merchant-key");
    expect(text).not.toContain('"key"');
    expect(text).not.toContain('"merchantKey"');
  });

  it("reports an unreadable file without renaming it", async () => {
    await writeFile(join(dataDir, "history.json"), "{ not json");
    const reply = await handle(signedRequest("GET", "/api/graveyard"), context);
    expect(reply).toEqual({ status: 200, json: { ok: false, reason: "history-unreadable" } });
    expect(await readdir(dataDir)).toEqual(["history.json"]);
  });

  it("reports a newer History version", async () => {
    await writeFile(join(dataDir, "history.json"), JSON.stringify({ version: 2 }));
    const reply = await handle(signedRequest("GET", "/api/graveyard"), context);
    expect(reply).toEqual({ status: 200, json: { ok: false, reason: "history-newer" } });
  });

  it("leaves the Data dir's names, sizes and mtimes unchanged (Req 11.6)", async () => {
    await writeFile(join(dataDir, "history.json"), encodeHistory(historyWithOneBurial()));
    await writeFile(join(dataDir, "settings.json"), "{}");
    const before = await snapshot(dataDir);
    await handle(signedRequest("GET", "/api/graveyard"), context);
    await handle(signedRequest("POST", "/api/graveyard"), context);
    await handle(signedRequest("GET", "/api/other"), context);
    await handle(
      { method: "GET", url: "/api/graveyard", headers: {}, body: Buffer.alloc(0) },
      context,
    );
    await writeFile(join(dataDir, "history.json"), "{ not json");
    const mid = await snapshot(dataDir);
    await handle(signedRequest("GET", "/api/graveyard"), context);
    expect(await snapshot(dataDir)).toBe(mid);
    expect(before).not.toBe(mid);
  });
});
