// File layer for the Data dir (design "Atomic write and modes").
import { randomBytes } from "node:crypto";
import { mkdir, open, readdir, rename, stat, unlink } from "node:fs/promises";
import { join } from "node:path";

const DATA_DIR_MODE = 0o700;
const FILE_MODE = 0o600;
const KEEP = 3;
const STAMP_FILE = /^(\d{8}T\d{6})(?:-(\d+))?\.json$/u;

export async function ensureDataDir(dataDir: string): Promise<void> {
  // `mkdir -p` leaves the mode of an existing directory alone.
  await mkdir(dataDir, { recursive: true, mode: DATA_DIR_MODE });
}

export async function writeFileAtomic(dataDir: string, name: string, text: string): Promise<void> {
  const tmpPath = join(dataDir, `${name}.tmp-${process.pid}-${randomBytes(3).toString("hex")}`);
  const finalPath = join(dataDir, name);
  try {
    const handle = await open(tmpPath, "wx", FILE_MODE);
    try {
      await handle.writeFile(text, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(tmpPath, finalPath);
  } catch (error) {
    await unlink(tmpPath).catch(() => undefined);
    throw error;
  }
  await syncDirectory(dataDir);
}

async function syncDirectory(dataDir: string): Promise<void> {
  try {
    const handle = await open(dataDir, "r");
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
  } catch {
    // Best effort: some platforms cannot fsync a directory.
  }
}

/** UTC stamp `yyyymmddThhmmss`. */
export function utcStamp(now: Date): string {
  return now.toISOString().slice(0, 19).replace(/[-:]/gu, "");
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

/**
 * `<prefix>-<stamp>.json`, or `<prefix>-<stamp>-2.json`, `-3`… when that name
 * is already taken in the same second.
 */
export async function stampedName(dataDir: string, prefix: string, now: Date): Promise<string> {
  const stamp = utcStamp(now);
  let name = `${prefix}-${stamp}.json`;
  for (let n = 2; await exists(join(dataDir, name)); n += 1) {
    name = `${prefix}-${stamp}-${n}.json`;
  }
  return name;
}

/** Keep the 3 newest `<prefix>-*.json` files and unlink the rest. */
export async function rotateKeep3(dataDir: string, prefix: string): Promise<void> {
  const lead = `${prefix}-`;
  const found: { name: string; stamp: string; n: number }[] = [];
  for (const name of await readdir(dataDir)) {
    if (!name.startsWith(lead)) continue;
    const match = STAMP_FILE.exec(name.slice(lead.length));
    if (match === null) continue;
    found.push({ name, stamp: match[1] ?? "", n: match[2] === undefined ? 1 : Number(match[2]) });
  }
  // Newest first: later stamp, then higher clash number.
  found.sort((a, b) => (a.stamp === b.stamp ? b.n - a.n : a.stamp < b.stamp ? 1 : -1));
  for (const old of found.slice(KEEP)) {
    await unlink(join(dataDir, old.name)).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
  }
}
