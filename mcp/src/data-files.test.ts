import { chmod, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ensureDataDir,
  rotateKeep3,
  stampedName,
  utcStamp,
  writeFileAtomic,
} from "./data-files.js";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "reaper-data-files-"));
});

afterEach(async () => {
  await chmod(root, 0o700).catch(() => undefined);
  await rm(root, { recursive: true, force: true });
});

async function mode(path: string): Promise<number> {
  return (await stat(path)).mode & 0o777;
}

function noTempFiles(names: string[]): boolean {
  return names.every((name) => !name.includes(".tmp-"));
}

describe("writeFileAtomic", () => {
  it("writes the text with mode 0600 and leaves no temp file", async () => {
    await writeFileAtomic(root, "history.json", "hello\n");
    expect(await readFile(join(root, "history.json"), "utf8")).toBe("hello\n");
    expect(await mode(join(root, "history.json"))).toBe(0o600);
    expect(noTempFiles(await readdir(root))).toBe(true);
  });

  it("replaces an existing file", async () => {
    await writeFileAtomic(root, "a.json", "one");
    await writeFileAtomic(root, "a.json", "two");
    expect(await readFile(join(root, "a.json"), "utf8")).toBe("two");
    expect(await readdir(root)).toEqual(["a.json"]);
  });

  it("leaves no temp file when the rename fails (target is a directory)", async () => {
    await mkdir(join(root, "history.json"));
    await expect(writeFileAtomic(root, "history.json", "x")).rejects.toThrow();
    expect(await readdir(root)).toEqual(["history.json"]);
  });

  it("leaves no temp file when the directory is read-only", async () => {
    await chmod(root, 0o500);
    await expect(writeFileAtomic(root, "history.json", "x")).rejects.toThrow();
    await chmod(root, 0o700);
    expect(await readdir(root)).toEqual([]);
  });
});

describe("ensureDataDir", () => {
  it("creates the directory with mode 0700", async () => {
    const dir = join(root, "nested", "data");
    await ensureDataDir(dir);
    expect(await mode(dir)).toBe(0o700);
  });

  it("leaves the mode of an existing directory alone", async () => {
    const dir = join(root, "data");
    await mkdir(dir, { mode: 0o750 });
    await chmod(dir, 0o750);
    await ensureDataDir(dir);
    expect(await mode(dir)).toBe(0o750);
  });
});

describe("stamps and rotation", () => {
  it("formats a UTC stamp", () => {
    expect(utcStamp(new Date("2026-12-01T09:00:12.481Z"))).toBe("20261201T090012");
  });

  it("appends -2 and -3 when the name is taken in the same second", async () => {
    const now = new Date("2026-12-01T09:00:12Z");
    const first = await stampedName(root, "history.backup", now);
    expect(first).toBe("history.backup-20261201T090012.json");
    await writeFile(join(root, first), "");
    const second = await stampedName(root, "history.backup", now);
    expect(second).toBe("history.backup-20261201T090012-2.json");
    await writeFile(join(root, second), "");
    expect(await stampedName(root, "history.backup", now)).toBe(
      "history.backup-20261201T090012-3.json",
    );
  });

  it("keeps the 3 newest of 5 stamped files and touches other names", async () => {
    const stamped = [
      "history.backup-20261201T090001.json",
      "history.backup-20261201T090002.json",
      "history.backup-20261201T090003.json",
      "history.backup-20261201T090004.json",
      "history.backup-20261201T090005.json",
    ];
    const others = [
      "history.json",
      "history.unreadable-20261201T090001.json",
      "history.backup-notes.json",
      "settings.json",
    ];
    for (const name of [...stamped, ...others]) await writeFile(join(root, name), "x");
    await rotateKeep3(root, "history.backup");
    expect((await readdir(root)).sort()).toEqual([...stamped.slice(2), ...others].sort());
  });

  it("ranks a clash suffix as newer than the plain name of the same second", async () => {
    const names = [
      "history.backup-20261201T090001.json",
      "history.backup-20261201T090001-2.json",
      "history.backup-20261201T090001-3.json",
      "history.backup-20261201T090000.json",
    ];
    for (const name of names) await writeFile(join(root, name), "x");
    await rotateKeep3(root, "history.backup");
    expect((await readdir(root)).sort()).toEqual(names.slice(0, 3).sort());
  });
});
