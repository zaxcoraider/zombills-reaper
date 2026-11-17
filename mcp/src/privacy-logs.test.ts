import { spawn } from "node:child_process";
import { cp, mkdir, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { request } from "node:http";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { referenceHeader } from "../../backend/src/test-proxy-signer.ts";
import { startMcpClient } from "./test-mcp-client.ts";
import type { McpTestClient } from "./test-mcp-client.ts";

const REPO_ROOT = new URL("../../", import.meta.url).pathname;
const ROUND_1 = join(REPO_ROOT, "mcp/fixtures/demo/round-1");
const ROUND_2 = join(REPO_ROOT, "mcp/fixtures/demo/round-2");
const SECRET = "logs-test-secret";
const NONCE = "00000000000000000000000000000def";
const MERCHANTS = [
  "Netflix",
  "Spotify",
  "Dropbox",
  "Planet Fitness",
  "ChatGPT Plus",
  "YouTube Premium",
  "Paramount+",
];

interface DemoRow {
  description: string;
  amount: string;
}

async function demoRows(): Promise<DemoRow[]> {
  const rows: DemoRow[] = [];
  for (const folder of [ROUND_1, ROUND_2]) {
    for (const name of await readdir(folder)) {
      const text = await readFile(join(folder, name), "utf8");
      for (const line of text.split("\n").slice(1)) {
        const [, description, amount] = line.split(",");
        if (description && amount) rows.push({ description, amount: amount.replace("-", "") });
      }
    }
  }
  return rows;
}

/** Every string that must stay out of the logs: descriptions, amounts in three forms, names. */
async function forbiddenTexts(folder: string): Promise<string[]> {
  const rows = await demoRows();
  const texts = new Set<string>(MERCHANTS);
  for (const row of rows) {
    texts.add(row.description);
    texts.add(row.amount);
    texts.add(`$${row.amount}`);
    texts.add(row.amount.replace(".", ""));
  }
  texts.add(folder);
  texts.add(basename(folder));
  return [...texts];
}

function leaks(output: string, forbidden: string[]): string[] {
  const lower = output.toLowerCase();
  return forbidden.filter((text) => lower.includes(text.toLowerCase()));
}

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

function get(port: number, path: string, headers: Record<string, string>): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port, method: "GET", path, headers }, (res) => {
      res.resume();
      res.on("end", () => resolve(res.statusCode ?? 0));
    });
    req.on("error", reject);
    req.end();
  });
}

async function waitForHealth(port: number): Promise<void> {
  for (let i = 0; i < 100; i += 1) {
    try {
      if ((await get(port, "/api/health", {})) === 200) return;
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error("backend did not start");
}

// Req 3.5, 4.6, 5.8, 13.3: the bundles write no description, amount, name or path to stdout or stderr.
describe("bundle output holds no statement data", () => {
  let tmp: string;
  let appRoot: string;
  let folder: string;
  let client: McpTestClient | null = null;

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), "reaper-privacy-logs-"));
    appRoot = join(tmp, "zombills-reaper");
    folder = join(tmp, "my-private-statements-folder");
    await mkdir(join(appRoot, "mcp", "dist"), { recursive: true });
    await mkdir(join(appRoot, "backend", "dist"), { recursive: true });
    await cp(join(REPO_ROOT, "mcp/dist/server.js"), join(appRoot, "mcp/dist/server.js"));
    await cp(join(REPO_ROOT, "backend/dist/server.js"), join(appRoot, "backend/dist/server.js"));
    await cp(ROUND_1, folder, { recursive: true });
  });

  afterEach(async () => {
    await client?.close();
    client = null;
    await rm(tmp, { recursive: true, force: true });
  });

  it("keeps the MCP bundle's stderr free of statement data", async () => {
    client = await startMcpClient({
      script: join(appRoot, "mcp/dist/server.js"),
      cwd: tmp,
      env: { PATH: process.env["PATH"] },
    });
    expect((await client.callTool("set_statements_folder", { path: folder })).isError).toBe(false);
    const first = await client.callTool("scan_statements");
    expect(first.value).toMatchObject({ ok: true, firstScan: true });
    await cp(ROUND_2, folder, { recursive: true });
    const second = await client.callTool("scan_statements");
    expect(second.value).toMatchObject({ ok: true, firstScan: false });
    expect(await client.callTool("bury", { service: "Netflix" })).toMatchObject({
      value: { ok: true },
    });
    expect(await client.callTool("bury", { service: "Planet Fitness" })).toMatchObject({
      value: { ok: true },
    });

    const stderr = client.stderr();
    expect(stderr).toContain("reaper: scan");
    expect(leaks(stderr, await forbiddenTexts(folder))).toEqual([]);
  });

  it("keeps the backend bundle's stdout and stderr free of statement data", async () => {
    client = await startMcpClient({
      script: join(appRoot, "mcp/dist/server.js"),
      cwd: tmp,
      env: { PATH: process.env["PATH"] },
    });
    await client.callTool("set_statements_folder", { path: folder });
    await client.callTool("scan_statements");
    await client.callTool("bury", { service: "Netflix" });
    await client.close();
    client = null;

    const port = await freePort();
    const child = spawn("node", [join(appRoot, "backend/dist/server.js")], {
      cwd: appRoot,
      env: { PATH: process.env["PATH"] ?? "", PORT: String(port), KIROCREW_PROXY_SECRET: SECRET },
    });
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => (output += chunk.toString("utf8")));
    child.stderr.on("data", (chunk: Buffer) => (output += chunk.toString("utf8")));
    const closed = new Promise<void>((resolve) => child.once("close", () => resolve()));
    try {
      await waitForHealth(port);
      const target = "/api/graveyard";
      const header = referenceHeader({
        secret: SECRET,
        tsStr: String(Math.floor(Date.now() / 1000)),
        nonce: NONCE,
        method: "GET",
        target,
        body: Buffer.alloc(0),
      });
      const status = await get(port, target, {
        "x-kirocrew-proxy-v2": header,
        "x-kirocrew-proxy-nonce": NONCE,
      });
      expect(status).toBe(200);
    } finally {
      child.kill();
      await closed;
    }
    expect(leaks(output, await forbiddenTexts(folder))).toEqual([]);
  });
});
