import { chmod, cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createReaperTools } from "./tools.js";

const ROUND_1 = new URL("../fixtures/demo/round-1/", import.meta.url).pathname;

let root: string;
let appRoot: string;
let dataDir: string;
let outside: string;
let stderrText: string;
const savedHome = process.env["HOME"];

async function call(name: string, args: unknown): Promise<Record<string, unknown>> {
  const tools = createReaperTools({
    dataDir,
    appRoot,
    now: () => new Date("2026-07-01T09:00:00Z"),
    timeZone: "UTC",
    coreSource: "test-core-source",
  });
  const tool = tools.get(name);
  if (!tool) throw new Error(`${name} is not registered`);
  return (await tool.handler(args)) as Record<string, unknown>;
}

async function settingsText(): Promise<string | null> {
  return readFile(join(dataDir, "settings.json"), "utf8").catch(() => null);
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "reaper-setfolder-"));
  appRoot = join(root, "app");
  dataDir = join(appRoot, "data");
  outside = join(root, "outside");
  await mkdir(dataDir, { recursive: true });
  await mkdir(outside);
  stderrText = "";
  vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
    stderrText += String(chunk);
    return true;
  });
});

afterEach(async () => {
  vi.restoreAllMocks();
  if (savedHome === undefined) delete process.env["HOME"];
  else process.env["HOME"] = savedHome;
  await rm(root, { recursive: true, force: true });
});

describe("set_statements_folder reasons", () => {
  it("rejects a relative path with not-absolute", async () => {
    expect(await call("set_statements_folder", { path: "some/where" })).toEqual({
      ok: false,
      reason: "not-absolute",
    });
    expect(await settingsText()).toBeNull();
  });

  it("rejects ~other/x with not-absolute", async () => {
    expect(await call("set_statements_folder", { path: "~other/x" })).toEqual({
      ok: false,
      reason: "not-absolute",
    });
    expect(await settingsText()).toBeNull();
  });

  it("returns not-found for a missing path", async () => {
    expect(await call("set_statements_folder", { path: join(outside, "missing") })).toEqual({
      ok: false,
      reason: "not-found",
    });
    expect(await settingsText()).toBeNull();
  });

  it("returns not-a-folder for a file", async () => {
    const file = join(outside, "a.csv");
    await writeFile(file, "x");
    expect(await call("set_statements_folder", { path: file })).toEqual({
      ok: false,
      reason: "not-a-folder",
    });
    expect(await settingsText()).toBeNull();
  });

  it("returns not-readable for a folder that cannot be listed", async () => {
    if (process.getuid?.() === 0) return; // root reads everything
    const locked = join(outside, "locked");
    await mkdir(locked, { mode: 0o000 });
    try {
      expect(await call("set_statements_folder", { path: locked })).toEqual({
        ok: false,
        reason: "not-readable",
      });
    } finally {
      await rm(locked, { recursive: true, force: true });
    }
    expect(await settingsText()).toBeNull();
  });

  it("returns not-readable when a parent folder cannot be searched", async () => {
    if (process.getuid?.() === 0) return;
    const locked = join(outside, "locked");
    await mkdir(join(locked, "inner"), { recursive: true });
    await chmod(locked, 0o000);
    try {
      expect(await call("set_statements_folder", { path: join(locked, "inner") })).toEqual({
        ok: false,
        reason: "not-readable",
      });
    } finally {
      await chmod(locked, 0o700);
    }
    expect(await settingsText()).toBeNull();
  });

  it("returns inside-app for the App root, a folder under it and the Data dir", async () => {
    await mkdir(join(appRoot, "sub"));
    for (const path of [appRoot, join(appRoot, "sub"), dataDir]) {
      expect(await call("set_statements_folder", { path })).toEqual({
        ok: false,
        reason: "inside-app",
      });
    }
    expect(await settingsText()).toBeNull();
  });

  it("returns inside-app for a symlink outside the app that points into the App root", async () => {
    const link = join(outside, "link");
    await symlink(dataDir, link);
    expect(await call("set_statements_folder", { path: link })).toEqual({
      ok: false,
      reason: "inside-app",
    });
    expect(await settingsText()).toBeNull();
  });

  it("leaves an existing settings.json byte-equal on failure", async () => {
    const before = JSON.stringify({ version: 1, statementsFolder: "/keep/me" }) + "\n";
    await writeFile(join(dataDir, "settings.json"), before);
    await call("set_statements_folder", { path: join(outside, "missing") });
    expect(await settingsText()).toBe(before);
  });

  it("rejects an unknown key and an empty path at the schema", async () => {
    const tools = createReaperTools({
      dataDir,
      appRoot,
      now: () => new Date(),
      timeZone: "UTC",
      coreSource: "x",
    });
    const schema = tools.get("set_statements_folder")?.inputSchema;
    expect(schema?.safeParse({ path: "/x", extra: 1 }).success).toBe(false);
    expect(schema?.safeParse({ path: "" }).success).toBe(false);
    expect(schema?.safeParse({ path: "x".repeat(4097) }).success).toBe(false);
  });
});

describe("set_statements_folder success", () => {
  it("expands ~/x to the home folder", async () => {
    const home = join(root, "home");
    await mkdir(join(home, "Statements"), { recursive: true });
    process.env["HOME"] = home;
    const result = await call("set_statements_folder", { path: "~/Statements" });
    expect(result).toEqual({ ok: true, folderName: "Statements", statementFileCount: 0 });
    expect(JSON.parse((await settingsText()) ?? "")).toEqual({
      version: 1,
      statementsFolder: join(home, "Statements"),
    });
  });

  it("returns the last segment and the CSV count, and a later scan reads that folder", async () => {
    const statements = join(root, "My Statements");
    await cp(ROUND_1, statements, { recursive: true });
    const result = await call("set_statements_folder", { path: statements });
    expect(result).toEqual({ ok: true, folderName: "My Statements", statementFileCount: 6 });
    expect((await call("scan_statements", {}))["ok"]).toBe(true);
  });

  it("stores the resolved path, not the real path of a link", async () => {
    const target = join(root, "target");
    await cp(ROUND_1, target, { recursive: true });
    const link = join(outside, "link");
    await symlink(target, link);
    const result = await call("set_statements_folder", { path: link + "/../link" });
    expect(result["ok"]).toBe(true);
    expect(JSON.parse((await settingsText()) ?? "")).toEqual({
      version: 1,
      statementsFolder: link,
    });
  });

  it("puts no path in a result or a stderr line", async () => {
    const statements = join(root, "Hidden-Folder-Name", "inner-dir");
    await mkdir(statements, { recursive: true });
    const results = [
      await call("set_statements_folder", { path: statements }),
      await call("set_statements_folder", { path: join(statements, "missing") }),
      await call("set_statements_folder", { path: appRoot }),
    ];
    const text = JSON.stringify(results) + stderrText;
    expect(text).not.toContain(root);
    expect(text).not.toContain("Hidden-Folder-Name");
    expect(stderrText).not.toContain("inner-dir");
    expect(stderrText).toContain("reaper: set-folder");
  });
});
