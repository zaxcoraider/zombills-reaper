import { cp, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startMcpClient } from "./test-mcp-client.ts";
import type { McpTestClient } from "./test-mcp-client.ts";

const REPO_ROOT = new URL("../../", import.meta.url).pathname;

// Req 2.10: the committed bundle starts from a bare App root with no node_modules.
describe("MCP bundle", () => {
  let tmp: string;
  let appRoot: string;
  let client: McpTestClient | null = null;

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), "reaper-bundle-"));
    appRoot = join(tmp, "zombills-reaper");
    await mkdir(join(appRoot, "mcp", "dist"), { recursive: true });
    await cp(join(REPO_ROOT, "app.json"), join(appRoot, "app.json"));
    await cp(join(REPO_ROOT, "agents"), join(appRoot, "agents"), { recursive: true });
    await cp(join(REPO_ROOT, "mcp/dist/server.js"), join(appRoot, "mcp/dist/server.js"));
  });

  afterEach(async () => {
    await client?.close();
    client = null;
    await rm(tmp, { recursive: true, force: true });
  });

  it("lists exactly the registered tools and reads the Data dir next to the bundle", async () => {
    client = await startMcpClient({
      script: join(appRoot, "mcp/dist/server.js"),
      cwd: tmp,
      env: { PATH: process.env["PATH"] },
    });
    expect((await client.listTools()).sort()).toEqual(["bury", "scan_statements"]);
    const result = await client.callTool("scan_statements");
    expect(result.isError).toBe(false);
    expect(result.value).toEqual({ ok: false, reason: "not-configured" });
  });

  it("rejects an unknown input key before the handler runs", async () => {
    client = await startMcpClient({
      script: join(appRoot, "mcp/dist/server.js"),
      cwd: tmp,
      env: { PATH: process.env["PATH"] },
    });
    const result = await client.callTool("scan_statements", { extra: 1 });
    expect(result.isError).toBe(true);
  });
});
