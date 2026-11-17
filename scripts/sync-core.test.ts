import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { lstat, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { syncCore } from "./sync-core.ts";

const BUILD_SCRIPT =
  "mkdir -p dist && echo 'export const a = 1;' > dist/index.js && echo t > dist/index.test.js " +
  "&& echo t > dist/a.property.test.js && echo m > dist/index.js.map";
const MARKER = "old marker\n";

let root: string;
let zombills: string;
let repo: string;

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, JSON.stringify(value, null, 2));
}

async function makeZombills(options: { name?: string; papaparse?: string; build?: string }) {
  await writeJson(join(zombills, "package.json"), { name: "root", workspaces: ["packages/*"] });
  await writeJson(join(zombills, "packages", "core", "package.json"), {
    name: options.name ?? "@zombills/core",
    version: "0.0.0",
    dependencies: { papaparse: options.papaparse ?? "5.7.1" },
    scripts: { build: options.build ?? BUILD_SCRIPT },
  });
  // Like the real Zombills repo, build output is not tracked.
  await writeFile(join(zombills, ".gitignore"), "dist/\n");
  const git = (...args: string[]) =>
    execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], {
      cwd: zombills,
      stdio: "ignore",
    });
  git("init");
  git("add", ".");
  git("commit", "-m", "init");
}

async function listFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true });
  return entries.sort();
}

async function readTree(dir: string): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  for (const name of await listFiles(dir)) {
    const info = await lstat(join(dir, name));
    if (info.isFile()) result[name] = await readFile(join(dir, name), "utf8");
  }
  return result;
}

const sync = () => syncCore({ repoRoot: repo, zombillsPath: zombills, today: "2026-01-02" });

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "sync-core-test-"));
  zombills = join(root, "zombills");
  repo = join(root, "reaper");
  await mkdir(zombills, { recursive: true });
  await writeJson(join(repo, "package.json"), { devDependencies: { papaparse: "5.7.1" } });
  await mkdir(join(repo, "vendor", "zombills-core"), { recursive: true });
  await writeFile(join(repo, "vendor", "zombills-core", "marker.txt"), MARKER);
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function expectOldVendorKept(): Promise<void> {
  expect(await readTree(join(repo, "vendor", "zombills-core"))).toEqual({
    "marker.txt": MARKER,
  });
  expect(await listFiles(join(repo, "vendor"))).toEqual([
    "zombills-core",
    "zombills-core/marker.txt",
  ]);
}

describe("syncCore", () => {
  it("copies dist and package.json, drops tests and maps, and writes SOURCE", async () => {
    await makeZombills({});
    await sync();
    const vendor = join(repo, "vendor", "zombills-core");
    const files = await listFiles(vendor);
    expect(files).toEqual(["SOURCE", "dist", "dist/index.js", "package.json"]);
    expect(await readFile(join(vendor, "dist", "index.js"), "utf8")).toBe("export const a = 1;\n");
    for (const name of files) {
      expect((await lstat(join(vendor, name))).isSymbolicLink()).toBe(false);
    }
    const source = await readFile(join(vendor, "SOURCE"), "utf8");
    expect(source).toMatch(/^[0-9a-f]{40}\n\d{4}-\d{2}-\d{2}\n$/);
    expect(source.endsWith("\n2026-01-02\n")).toBe(true);
    expect(await listFiles(join(repo, "vendor"))).toEqual(
      files
        .map((name) => `zombills-core/${name}`)
        .concat("zombills-core")
        .sort(),
    );
  });

  it("creates vendor/zombills-core when none exists", async () => {
    await makeZombills({});
    await rm(join(repo, "vendor"), { recursive: true });
    await sync();
    expect(existsSync(join(repo, "vendor", "zombills-core", "dist", "index.js"))).toBe(true);
  });

  it("adds -dirty when packages/core has uncommitted changes", async () => {
    await makeZombills({});
    await writeFile(join(zombills, "packages", "core", "extra.ts"), "export {};\n");
    await sync();
    const source = await readFile(join(repo, "vendor", "zombills-core", "SOURCE"), "utf8");
    expect(source).toMatch(/^[0-9a-f]{40}-dirty\n\d{4}-\d{2}-\d{2}\n$/);
  });

  it("refuses a path that is not a Zombills repo", async () => {
    await expect(sync()).rejects.toThrow(/^Not a Zombills repo: /);
    await expectOldVendorKept();
  });

  it("refuses a core with another name", async () => {
    await makeZombills({ name: "@other/core" });
    await expect(sync()).rejects.toThrow(/^Not a Zombills repo: /);
    await expectOldVendorKept();
  });

  it("refuses a papaparse mismatch and names both versions", async () => {
    await makeZombills({ papaparse: "5.7.0" });
    await expect(sync()).rejects.toThrow(
      "papaparse differs: Zombills core has 5.7.0, this repo has 5.7.1",
    );
    await expectOldVendorKept();
  });

  it("refuses when the build fails", async () => {
    await makeZombills({ build: "exit 1" });
    await expect(sync()).rejects.toThrow("Core build failed");
    await expectOldVendorKept();
  });
});

describe("committed vendor/zombills-core/SOURCE", () => {
  it("holds a 40-character hash, optionally -dirty, and a date", async () => {
    const path = fileURLToPath(new URL("../vendor/zombills-core/SOURCE", import.meta.url));
    expect(await readFile(path, "utf8")).toMatch(/^[0-9a-f]{40}(-dirty)?\n\d{4}-\d{2}-\d{2}\n?$/);
  });
});
