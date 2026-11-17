import { cp, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { emptyHistory, encodeHistory } from "../../shared/src/history-codec.ts";
import { createReaperTools } from "./tools.js";

const ROUND_1 = new URL("../fixtures/demo/round-1/", import.meta.url).pathname;
const CREW_FILE = "crew-owned.json";
const CREW_TEXT = '{"writtenBy":"crew"}\n';

let root: string;
let dataDir: string;
let statements: string;

function tools() {
  return createReaperTools({
    dataDir,
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

/** Names, sizes and mtimes of a folder's entries. */
async function snapshot(folder: string): Promise<string[]> {
  const lines: string[] = [];
  for (const name of (await readdir(folder)).sort()) {
    const info = await stat(join(folder, name));
    lines.push(`${name} ${info.size} ${info.mtimeMs}`);
  }
  return lines;
}

async function dataFiles(): Promise<string[]> {
  return (await readdir(dataDir)).filter((name) => name !== CREW_FILE).sort();
}

async function setFolderAndScan(): Promise<void> {
  expect((await call("set_statements_folder", { path: statements }))["ok"]).toBe(true);
  expect((await call("scan_statements", {}))["ok"]).toBe(true);
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "reaper-data-files-"));
  dataDir = join(root, "data");
  statements = join(root, "statements");
  await mkdir(join(root, "app"), { recursive: true });
  await cp(ROUND_1, statements, { recursive: true });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

// Req 13.4: the Reaper leaves only its own files in the Data dir and touches nothing else.
describe("Data dir files", () => {
  it("holds only settings.json and history.json after a folder change and a scan", async () => {
    await setFolderAndScan();
    expect(await dataFiles()).toEqual(["history.json", "settings.json"]);
  });

  it("adds one history.unreadable-* file after an unreadable History", async () => {
    await mkdir(dataDir, { recursive: true });
    await writeFile(join(dataDir, "history.json"), "not json{");
    await setFolderAndScan();
    const files = await dataFiles();
    expect(files).toHaveLength(3);
    expect(files.filter((name) => /^history\.unreadable-.+\.json$/.test(name))).toHaveLength(1);
    expect(files).toContain("history.json");
    expect(files).toContain("settings.json");
  });

  it("adds one history.backup-* file after a History with a bad record", async () => {
    await mkdir(dataDir, { recursive: true });
    const parsed = JSON.parse(encodeHistory(emptyHistory())) as Record<string, unknown>;
    parsed["trackedCharges"] = [{ key: 5 }];
    await writeFile(join(dataDir, "history.json"), `${JSON.stringify(parsed)}\n`);
    await setFolderAndScan();
    const files = await dataFiles();
    expect(files).toHaveLength(3);
    expect(files.filter((name) => /^history\.backup-.+\.json$/.test(name))).toHaveLength(1);
    expect(files).toContain("history.json");
    expect(files).toContain("settings.json");
  });

  it("leaves a file written by Crew alone", async () => {
    await mkdir(dataDir, { recursive: true });
    await writeFile(join(dataDir, CREW_FILE), CREW_TEXT);
    await setFolderAndScan();
    expect(await dataFiles()).toEqual(["history.json", "settings.json"]);
    expect(await readFile(join(dataDir, CREW_FILE), "utf8")).toBe(CREW_TEXT);
  });

  it("leaves the Statements folder's names, sizes and mtimes unchanged", async () => {
    const before = await snapshot(statements);
    await setFolderAndScan();
    await call("scan_statements", {});
    expect(await snapshot(statements)).toEqual(before);
  });
});
