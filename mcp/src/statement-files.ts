// Lists and reads Statement files (design "Scan algorithm" steps 3 and 4). Read-only.
import { constants } from "node:fs";
import { open, readdir } from "node:fs/promises";
import { join } from "node:path";

export const MAX_STATEMENT_FILES = 120;
export const MAX_STATEMENT_BYTES = 5 * 1024 * 1024;

const CSV_NAME = /\.csv$/iu;

export interface StatementList {
  /** The first 120 Statement file names in code-unit order. */
  names: string[];
  /** Statement files beyond the first 120. */
  tooMany: number;
}

export type StatementFileRead =
  { ok: true; bytes: Uint8Array } | { ok: false; kind: "too-large" | "unreadable" };

function compareCodeUnits(a: string, b: string): number {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

/** A symlink reports `isSymbolicLink()` and not `isFile()`, so links are never listed. */
export async function listStatementFiles(folder: string): Promise<StatementList> {
  const entries = await readdir(folder, { withFileTypes: true });
  const names = entries
    .filter((e) => e.isFile() && CSV_NAME.test(e.name) && !e.name.startsWith("."))
    .map((e) => e.name)
    .sort(compareCodeUnits);
  return {
    names: names.slice(0, MAX_STATEMENT_FILES),
    tooMany: Math.max(0, names.length - MAX_STATEMENT_FILES),
  };
}

export async function readStatementFile(folder: string, name: string): Promise<StatementFileRead> {
  let handle;
  try {
    handle = await open(join(folder, name), constants.O_RDONLY | constants.O_NOFOLLOW);
    const info = await handle.stat();
    if (info.size > MAX_STATEMENT_BYTES) return { ok: false, kind: "too-large" };
    const buffer = await handle.readFile();
    return { ok: true, bytes: new Uint8Array(buffer) };
  } catch {
    return { ok: false, kind: "unreadable" };
  } finally {
    await handle?.close().catch(() => undefined);
  }
}
