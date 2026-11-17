import { chmod, mkdir, mkdtemp, readdir, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { listStatementFiles, MAX_STATEMENT_BYTES, readStatementFile } from "./statement-files.js";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "reaper-statement-files-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function snapshot(): Promise<string> {
  const names = (await readdir(root)).sort();
  const rows = await Promise.all(
    names.map(async (name) => {
      const info = await stat(join(root, name));
      return `${name}|${info.size}|${info.mtimeMs}`;
    }),
  );
  return rows.join("\n");
}

describe("listStatementFiles", () => {
  it("skips symlinks, sub-folders named x.csv, hidden files and other extensions", async () => {
    await writeFile(join(root, "real.csv"), "a");
    await writeFile(join(root, "link-target.csv"), "a");
    await symlink(join(root, "real.csv"), join(root, "link.csv"));
    await mkdir(join(root, "x.csv"));
    await writeFile(join(root, ".hidden.csv"), "a");
    await writeFile(join(root, "notes.txt"), "a");
    const list = await listStatementFiles(root);
    expect(list).toEqual({ names: ["link-target.csv", "real.csv"], tooMany: 0 });
  });

  it("accepts an upper-case extension", async () => {
    await writeFile(join(root, "A.CSV"), "a");
    expect((await listStatementFiles(root)).names).toEqual(["A.CSV"]);
  });

  it("sorts in code-unit order", async () => {
    for (const name of ["b.csv", "B-x.csv", "a.csv"]) await writeFile(join(root, name), "x");
    expect((await listStatementFiles(root)).names).toEqual(["B-x.csv", "a.csv", "b.csv"]);
  });

  it("reads 120 files and counts the 121st by code-unit order as too-many", async () => {
    for (let i = 0; i < 121; i += 1) {
      await writeFile(join(root, `s-${String(i).padStart(3, "0")}.csv`), "x");
    }
    const list = await listStatementFiles(root);
    expect(list.names).toHaveLength(120);
    expect(list.names[0]).toBe("s-000.csv");
    expect(list.names.at(-1)).toBe("s-119.csv");
    expect(list.names).not.toContain("s-120.csv");
    expect(list.tooMany).toBe(1);
  });
});

describe("readStatementFile", () => {
  it("reads a file of exactly 5 MiB", async () => {
    await writeFile(join(root, "big.csv"), Buffer.alloc(MAX_STATEMENT_BYTES, 0x61));
    const result = await readStatementFile(root, "big.csv");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.bytes.length).toBe(MAX_STATEMENT_BYTES);
  });

  it("marks a file of 5 MiB + 1 byte as too-large", async () => {
    await writeFile(join(root, "huge.csv"), Buffer.alloc(MAX_STATEMENT_BYTES + 1, 0x61));
    expect(await readStatementFile(root, "huge.csv")).toEqual({ ok: false, kind: "too-large" });
  });

  it("marks a missing file and a symlink as unreadable", async () => {
    await writeFile(join(root, "real.csv"), "a");
    await symlink(join(root, "real.csv"), join(root, "link.csv"));
    expect(await readStatementFile(root, "missing.csv")).toEqual({ ok: false, kind: "unreadable" });
    expect(await readStatementFile(root, "link.csv")).toEqual({ ok: false, kind: "unreadable" });
  });

  it.skipIf(process.getuid?.() === 0)("marks a chmod 000 file as unreadable", async () => {
    const path = join(root, "locked.csv");
    await writeFile(path, "a");
    await chmod(path, 0o000);
    expect(await readStatementFile(root, "locked.csv")).toEqual({ ok: false, kind: "unreadable" });
  });
});

describe("folder is left alone (Req 4.1)", () => {
  it("keeps names, sizes and mtimes unchanged after listing and reading", async () => {
    await writeFile(join(root, "a.csv"), "Date,Description,Amount\n");
    await writeFile(join(root, "b.csv"), "x");
    const before = await snapshot();
    const { names } = await listStatementFiles(root);
    for (const name of names) await readStatementFile(root, name);
    expect(await snapshot()).toBe(before);
  });
});
