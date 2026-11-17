import { cp, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readAll } from "./read-statements.js";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "reaper-read-statements-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const HEADER = "Date,Description,Amount\n";

describe("readAll", () => {
  it("reads the six round-1 fixtures with no skips", async () => {
    await cp(join(import.meta.dirname, "../fixtures/demo/round-1"), root, { recursive: true });
    const result = await readAll(root);
    expect(result.files).toEqual({ read: 6, skipped: {} });
    expect(result.perFile).toHaveLength(6);
    expect(result.perFile.every((rows) => rows.length > 0)).toBe(true);
    expect(result.rowErrorCount).toBe(0);
  });

  it("maps each kind of unusable file to its skip kind", async () => {
    await writeFile(join(root, "unknown.csv"), "Foo,Bar,Baz\n1,2,3\n");
    await writeFile(join(root, "empty.csv"), "");
    await writeFile(join(root, "header-only.csv"), HEADER);
    await writeFile(join(root, "ambiguous.csv"), `${HEADER}03/04/2026,SHOP A,-5.00\n`);
    await writeFile(
      join(root, "broken.csv"),
      `${HEADER}13/01/2026,SHOP A,-5.00
01/13/2026,SHOP B,-6.00
`,
    );
    const result = await readAll(root);
    expect(result.perFile).toEqual([]);
    expect(result.files.read).toBe(0);
    expect(result.files.skipped["unknown-columns"]).toBe(1);
    expect(result.files.skipped["ambiguous-dates"]).toBe(1);
    expect(result.files.skipped["parse-error"]).toBe(1);
    expect(result.files.skipped.empty).toBe(2);
    const total = Object.values(result.files.skipped).reduce((a, b) => a + b, 0);
    expect(total).toBe(5);
  });

  it("counts a bad row without exposing it", async () => {
    await writeFile(
      join(root, "one.csv"),
      `${HEADER}2026-01-02,SHOP A,-5.00\n2026-01-03,SHOP B,not-a-number\n`,
    );
    const result = await readAll(root);
    expect(result.files.read).toBe(1);
    expect(result.rowErrorCount).toBe(1);
    expect(result.perFile[0]).toHaveLength(1);
    expect(JSON.stringify(result)).not.toContain("not-a-number");
  });

  it("counts files beyond 120 as too-many", async () => {
    for (let i = 0; i < 121; i += 1) {
      await writeFile(
        join(root, `s-${String(i).padStart(3, "0")}.csv`),
        `${HEADER}2026-01-02,SHOP A,-5.00\n`,
      );
    }
    const result = await readAll(root);
    expect(result.files.read).toBe(120);
    expect(result.files.skipped).toEqual({ "too-many": 1 });
  });
});
