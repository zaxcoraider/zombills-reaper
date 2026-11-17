import { spawn } from "node:child_process";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { cp, mkdir, mkdtemp, rm } from "node:fs/promises";
import { request } from "node:http";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { referenceHeader } from "./test-proxy-signer.ts";

const REPO_ROOT = new URL("../../", import.meta.url).pathname;
const SECRET = "bundle-test-secret";
const NONCE = "00000000000000000000000000000abc";

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const port = typeof address === "object" && address !== null ? address.port : 0;
      probe.close(() => resolve(port));
    });
  });
}

interface Reply {
  status: number;
  text: string;
}

function call(
  port: number,
  method: string,
  path: string,
  headers: Record<string, string> = {},
  body: Buffer = Buffer.alloc(0),
): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        host: "127.0.0.1",
        port,
        method,
        path,
        headers: { ...headers, "content-length": body.length },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () =>
          resolve({ status: res.statusCode ?? 0, text: Buffer.concat(chunks).toString("utf8") }),
        );
      },
    );
    req.on("error", reject);
    req.end(body);
  });
}

async function waitForHealth(port: number): Promise<void> {
  for (let i = 0; i < 100; i += 1) {
    try {
      const reply = await call(port, "GET", "/api/health");
      if (reply.status === 200) return;
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error("backend did not start");
}

// Req 2.10, 11.2: the committed bundle starts from a bare App root with no node_modules.
describe("backend bundle", () => {
  let tmp: string;
  let appRoot: string;
  let child: ChildProcessWithoutNullStreams | null = null;

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), "reaper-backend-bundle-"));
    appRoot = join(tmp, "zombills-reaper");
    await mkdir(join(appRoot, "backend", "dist"), { recursive: true });
    await cp(join(REPO_ROOT, "backend/dist/server.js"), join(appRoot, "backend/dist/server.js"));
  });

  afterEach(async () => {
    child?.kill();
    child = null;
    await rm(tmp, { recursive: true, force: true });
  });

  function start(env: Record<string, string>): ChildProcessWithoutNullStreams {
    return spawn("node", [join(appRoot, "backend/dist/server.js")], {
      cwd: appRoot,
      env: { PATH: process.env["PATH"] ?? "", ...env },
    });
  }

  it("serves health, refuses unsigned and oversized requests and accepts a signed one", async () => {
    const port = await freePort();
    child = start({ PORT: String(port), KIROCREW_PROXY_SECRET: SECRET });
    await waitForHealth(port);

    const health = await call(port, "GET", "/api/health");
    expect(health.status).toBe(200);
    expect(JSON.parse(health.text)).toEqual({ ok: true });

    const unsigned = await call(port, "GET", "/api/graveyard");
    expect(unsigned.status).toBe(401);

    const target = "/api/graveyard";
    const tsStr = String(Math.floor(Date.now() / 1000));
    const header = referenceHeader({
      secret: SECRET,
      tsStr,
      nonce: NONCE,
      method: "GET",
      target,
      body: Buffer.alloc(0),
    });
    const signed = await call(port, "GET", target, {
      "x-kirocrew-proxy-v2": header,
      "x-kirocrew-proxy-nonce": NONCE,
    });
    expect(signed.status).toBe(200);
    expect(JSON.parse(signed.text)).toEqual({
      ok: true,
      tombstones: [],
      savings: {},
      months: [],
      lastScan: null,
    });

    const big = await call(port, "POST", "/api/graveyard", {}, Buffer.alloc(16385, 0x61));
    expect(big.status).toBe(413);
  });

  it("exits with code 2 and names PORT, not its value, when PORT is bad", async () => {
    child = start({ PORT: "0", KIROCREW_PROXY_SECRET: SECRET });
    let stderr = "";
    child.stderr.on("data", (c: Buffer) => (stderr += c.toString("utf8")));
    const code = await new Promise<number | null>((resolve) => child?.on("close", resolve));
    expect(code).toBe(2);
    expect(stderr).toContain("PORT");
    expect(stderr).not.toContain("PORT=0");
    expect(stderr).not.toContain(SECRET);
    expect(stderr.trim()).toBe("reaper-backend: bad env PORT");
  });
});
