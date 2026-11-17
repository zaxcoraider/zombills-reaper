// History store (design "Load for write"). `loadHistoryForWrite` runs inside the lock.
import { readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { decodeHistory, emptyHistory, encodeHistory } from "../../shared/src/history-codec.ts";
import type { History } from "../../shared/src/types.ts";
import { rotateKeep3, stampedName, writeFileAtomic } from "./data-files.js";

const HISTORY_FILE = "history.json";
const BACKUP_PREFIX = "history.backup";
const UNREADABLE_PREFIX = "history.unreadable";
const FILE_MODE = 0o600;

export type LoadForWrite =
  | { history: History; reset: boolean; dropped: number }
  | { error: "history-newer" | "history-unreadable" };

export type ReadHistory = { history: History } | { error: "history-newer" | "history-unreadable" };

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === "ENOENT";
}

export async function loadHistoryForWrite(dataDir: string, now: Date): Promise<LoadForWrite> {
  const path = join(dataDir, HISTORY_FILE);
  let bytes: Buffer;
  try {
    bytes = await readFile(path);
  } catch (error) {
    if (isMissing(error)) return { history: emptyHistory(), reset: false, dropped: 0 };
    return { error: "history-unreadable" };
  }
  const decoded = decodeHistory(bytes.toString("utf8"));
  switch (decoded.kind) {
    case "newer":
      return { error: "history-newer" };
    case "ok": {
      if (decoded.dropped > 0) {
        const name = await stampedName(dataDir, BACKUP_PREFIX, now);
        // The original bytes, exactly; `wx` never overwrites an earlier backup.
        await writeFile(join(dataDir, name), bytes, { flag: "wx", mode: FILE_MODE });
        await rotateKeep3(dataDir, BACKUP_PREFIX);
      }
      return { history: decoded.history, reset: false, dropped: decoded.dropped };
    }
    case "unreadable": {
      const name = await stampedName(dataDir, UNREADABLE_PREFIX, now);
      await rename(path, join(dataDir, name));
      await rotateKeep3(dataDir, UNREADABLE_PREFIX);
      return { history: emptyHistory(), reset: true, dropped: 0 };
    }
  }
}

/** Decodes without side effects: no backup, no rename. */
export async function readHistory(dataDir: string): Promise<ReadHistory> {
  let text: string;
  try {
    text = await readFile(join(dataDir, HISTORY_FILE), "utf8");
  } catch (error) {
    if (isMissing(error)) return { history: emptyHistory() };
    return { error: "history-unreadable" };
  }
  const decoded = decodeHistory(text);
  if (decoded.kind === "ok") return { history: decoded.history };
  return { error: decoded.kind === "newer" ? "history-newer" : "history-unreadable" };
}

export async function saveHistory(dataDir: string, history: History): Promise<void> {
  await writeFileAtomic(dataDir, HISTORY_FILE, encodeHistory(history));
}
