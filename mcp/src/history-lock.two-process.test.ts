// Req 7.6: two bundle processes share one Data dir; scans and burials never lose each other's write.
import { cp, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { decodeHistory } from "../../shared/src/history-codec.ts";
import type { ScanSummary } from "../../shared/src/types.ts";
import { startMcpClient } from "./test-mcp-client.ts";
import type { McpTestClient } from "./test-mcp-client.ts";

const REPO_ROOT = new URL("../../", import.meta.url).pathname;
const ROUND_1 = join(REPO_ROOT, "mcp/fixtures/demo/round-1");

async function runOnce(): Promise<void> {
  const tmp = await mkdtemp(join(tmpdir(), "reaper-two-process-"));
  const clients: McpTestClient[] = [];
  try {
    const appRoot = join(tmp, "zombills-reaper");
    await mkdir(join(appRoot, "mcp", "dist"), { recursive: true });
    await cp(join(REPO_ROOT, "app.json"), join(appRoot, "app.json"));
    await cp(join(REPO_ROOT, "agents"), join(appRoot, "agents"), { recursive: true });
    await cp(join(REPO_ROOT, "mcp/dist/server.js"), join(appRoot, "mcp/dist/server.js"));
    const statements = join(tmp, "statements");
    await cp(ROUND_1, statements, { recursive: true });
    const dataDir = join(appRoot, "data");
    await mkdir(dataDir, { recursive: true });
    await writeFile(
      join(dataDir, "settings.json"),
      JSON.stringify({ version: 1, statementsFolder: statements }),
    );

    const start = async (): Promise<McpTestClient> => {
      const client = await startMcpClient({
        script: join(appRoot, "mcp/dist/server.js"),
        cwd: tmp,
        env: { PATH: process.env["PATH"] },
      });
      clients.push(client);
      return client;
    };
    const [scanner, burier] = [await start(), await start()];

    const first = await scanner.callTool("scan_statements");
    const firstScan = first.value as { ok: boolean } & ScanSummary;
    expect(firstScan.ok).toBe(true);
    const services = firstScan.undead.map((u) => u.name);
    expect(services).toHaveLength(6);

    for (const service of services) {
      const [scan, buried] = await Promise.all([
        scanner.callTool("scan_statements"),
        burier.callTool("bury", { service }),
      ]);
      // A history-busy result fails the test: 5 s is far above one write.
      expect(scan.value).toMatchObject({ ok: true });
      expect(buried.value).toMatchObject({ ok: true, alreadyBuried: false });
    }

    const decoded = decodeHistory(await readFile(join(dataDir, "history.json"), "utf8"));
    expect(decoded.kind).toBe("ok");
    if (decoded.kind === "ok") {
      expect(decoded.dropped).toBe(0);
      expect(decoded.history.scans).toHaveLength(7);
      expect(decoded.history.tombstones).toHaveLength(6);
    }
    const files = await readdir(dataDir);
    expect(files).not.toContain("history.lock");
    expect(files.filter((n) => n.includes(".tmp-") || n.includes(".stale-"))).toEqual([]);
  } finally {
    await Promise.all(clients.map((c) => c.close()));
    await rm(tmp, { recursive: true, force: true });
  }
}

describe("History lock across two processes", () => {
  it("keeps 7 Scan records and 6 Tombstones, in 3 runs with fresh folders", async () => {
    for (let run = 0; run < 3; run += 1) await runOnce();
  }, 120_000);
});
