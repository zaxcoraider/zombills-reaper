import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CHILD_PROCESS_TOKEN, findHits, NETWORK_TOKENS } from "./test-privacy-tokens.ts";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const RUNTIME_FOLDERS = ["shared", "mcp", "backend", "ui", "scripts"];
const SYNC_CORE = "scripts/sync-core.ts";
const ALLOWED_SDK_IMPORTS = [
  "@modelcontextprotocol/sdk/server/mcp.js",
  "@modelcontextprotocol/sdk/server/stdio.js",
];
const IMPORT_SPECIFIER = /(?:from\s*|import\s*\(\s*|import\s+)["']([^"']+)["']/g;

function isRuntimeSource(name: string): boolean {
  if (!name.endsWith(".ts") && !name.endsWith(".tsx")) return false;
  if (/\.test\.tsx?$/.test(name)) return false;
  return !/^test-[^/]*$/.test(name.split("/").pop() ?? "");
}

function walk(folder: string, found: string[]): void {
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist") continue;
    const path = join(folder, entry.name);
    if (entry.isDirectory()) walk(path, found);
    else if (isRuntimeSource(entry.name)) found.push(path);
  }
}

function runtimeFiles(): string[] {
  const found: string[] = [];
  for (const folder of RUNTIME_FOLDERS) walk(join(ROOT, folder), found);
  return found.sort();
}

// Req 13.1: no network call and no child process in runtime code.
describe("runtime source privacy scan", () => {
  const files = runtimeFiles();

  it("scans a non-empty set of runtime files and no test helper", () => {
    const names = files.map((file) => relative(ROOT, file));
    expect(names).toContain("mcp/src/tools.ts");
    expect(names).toContain("backend/src/server.ts");
    expect(names).toContain("scripts/build.ts");
    expect(names.filter((name) => name.includes(".test."))).toEqual([]);
    expect(names.filter((name) => /(^|\/)test-[^/]*$/.test(name))).toEqual([]);
  });

  it("holds no network token", () => {
    const found: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      for (const hit of findHits(text, NETWORK_TOKENS)) {
        found.push(`${relative(ROOT, file)}:${hit.line} ${hit.token}`);
      }
    }
    expect(found).toEqual([]);
  });

  it("uses child_process only in scripts/sync-core.ts", () => {
    const found: string[] = [];
    for (const file of files) {
      const name = relative(ROOT, file);
      if (name === SYNC_CORE) continue;
      const text = readFileSync(file, "utf8");
      for (const hit of findHits(text, [CHILD_PROCESS_TOKEN])) {
        found.push(`${name}:${hit.line} ${hit.token}`);
      }
    }
    expect(found).toEqual([]);
  });

  it("imports only server/mcp.js and server/stdio.js from the MCP SDK", () => {
    const found: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      for (const match of text.matchAll(IMPORT_SPECIFIER)) {
        const specifier = match[1] ?? "";
        if (!specifier.startsWith("@modelcontextprotocol/sdk")) continue;
        if (ALLOWED_SDK_IMPORTS.includes(specifier)) continue;
        const line = text.slice(0, match.index).split("\n").length;
        found.push(`${relative(ROOT, file)}:${line} ${specifier}`);
      }
    }
    expect(found).toEqual([]);
  });
});
