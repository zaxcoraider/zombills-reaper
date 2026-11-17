import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { build } from "./build.ts";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const BUNDLES = ["mcp/dist/server.js", "backend/dist/server.js", "ui/dist/index.mjs"];

const tempDirs: string[] = [];

async function freshBuild(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "reaper-build-"));
  tempDirs.push(dir);
  await build({ outDir: dir });
  return dir;
}

function firstDifferingLine(a: Buffer, b: Buffer): number {
  const left = a.toString("utf8").split("\n");
  const right = b.toString("utf8").split("\n");
  const max = Math.max(left.length, right.length);
  for (let i = 0; i < max; i++) {
    if (left[i] !== right[i]) return i + 1;
  }
  return 0;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("bundles", () => {
  it("on disk match a fresh build", async () => {
    const dir = await freshBuild();
    for (const file of BUNDLES) {
      const fresh = await readFile(join(dir, file));
      const onDisk = await readFile(join(REPO_ROOT, file));
      if (!fresh.equals(onDisk)) {
        const line = firstDifferingLine(fresh, onDisk);
        expect.fail(
          `Run npm run build and commit the bundles (${file}, first difference at line ${line})`,
        );
      }
    }
  });

  it("are byte-equal across two builds (Req 2.8)", async () => {
    const first = await freshBuild();
    const second = await freshBuild();
    for (const file of BUNDLES) {
      const a = await readFile(join(first, file));
      const b = await readFile(join(second, file));
      expect(a.equals(b), file).toBe(true);
    }
  });

  it("MCP bundle holds line 1 of SOURCE (Req 2.8)", async () => {
    const source = await readFile(join(REPO_ROOT, "vendor/zombills-core/SOURCE"), "utf8");
    const line1 = source.split("\n")[0] ?? "";
    expect(line1).toMatch(/^[0-9a-f]{40}(-dirty)?$/);
    const bundle = await readFile(join(REPO_ROOT, "mcp/dist/server.js"), "utf8");
    expect(bundle).toContain(line1);
  });
});

describe("package.json", () => {
  it("has no dependencies (Req 2.6)", async () => {
    const pkg = JSON.parse(await readFile(join(REPO_ROOT, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
    };
    expect(Object.keys(pkg.dependencies ?? {})).toEqual([]);
  });
});
