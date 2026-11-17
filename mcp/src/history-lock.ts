// The History lock (design "Lock"). Every wait and age check goes through the clock.
import { randomBytes } from "node:crypto";
import { constants } from "node:fs";
import { open, readFile, rename, stat, unlink } from "node:fs/promises";
import { join } from "node:path";
import { logCounts } from "./log.js";

export const LOCK_TIMINGS = { pollMs: 50, waitMs: 5_000, staleMs: 30_000 };

export interface LockTimings {
  pollMs: number;
  waitMs: number;
  staleMs: number;
}

export interface LockClock {
  now(): number;
  sleep(ms: number): Promise<void>;
}

export const REAL_CLOCK: LockClock = {
  now: () => Date.now(),
  sleep: (ms) =>
    new Promise((resolve) => {
      setTimeout(resolve, ms);
    }),
};

const LOCK_FILE = "history.lock";
const LOCK_MODE = 0o600;

function codeOf(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : undefined;
}

/** Step 1. Returns false when the lock file already exists. */
async function tryCreate(lockPath: string, clock: LockClock): Promise<boolean> {
  let handle;
  try {
    handle = await open(
      lockPath,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
      LOCK_MODE,
    );
  } catch (error) {
    if (codeOf(error) === "EEXIST") return false;
    throw error;
  }
  try {
    await handle.writeFile(
      JSON.stringify({ pid: process.pid, at: new Date(clock.now()).toISOString() }),
    );
  } catch (error) {
    await handle.close();
    await unlink(lockPath).catch(() => undefined);
    throw error;
  }
  await handle.close();
  return true;
}

function namedPid(text: string): number | null {
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed === "object" && parsed !== null && "pid" in parsed) {
      const pid = parsed.pid;
      if (typeof pid === "number" && Number.isSafeInteger(pid) && pid > 0) return pid;
    }
  } catch {
    // An unparsable lock may be mid-write; it is judged by its age only.
  }
  return null;
}

function isDead(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return false;
  } catch (error) {
    return codeOf(error) === "ESRCH";
  }
}

/** Step 2. `gone` means the lock vanished between the failed create and the look. */
async function judge(
  lockPath: string,
  timings: LockTimings,
  clock: LockClock,
): Promise<"stale" | "fresh" | "gone"> {
  let text: string;
  let mtimeMs: number;
  try {
    text = await readFile(lockPath, "utf8");
    mtimeMs = (await stat(lockPath)).mtimeMs;
  } catch (error) {
    if (codeOf(error) === "ENOENT") return "gone";
    throw error;
  }
  if (clock.now() - mtimeMs > timings.staleMs) return "stale";
  const pid = namedPid(text);
  return pid !== null && isDead(pid) ? "stale" : "fresh";
}

/** Step 3. Moves the stale lock aside and removes it; false when another process was first. */
async function takeOver(dataDir: string, lockPath: string): Promise<boolean> {
  const aside = join(
    dataDir,
    `${LOCK_FILE}.stale-${process.pid}-${randomBytes(3).toString("hex")}`,
  );
  try {
    await rename(lockPath, aside);
  } catch (error) {
    if (codeOf(error) === "ENOENT") return false;
    throw error;
  }
  await unlink(aside).catch(() => undefined);
  logCounts("lock-takeover", { count: 1 });
  return true;
}

export async function withHistoryLock<T>(
  dataDir: string,
  fn: () => Promise<T>,
  timings: LockTimings = LOCK_TIMINGS,
  clock: LockClock = REAL_CLOCK,
): Promise<T | { ok: false; reason: "history-busy" }> {
  const lockPath = join(dataDir, LOCK_FILE);
  const startedAt = clock.now();
  for (;;) {
    if (await tryCreate(lockPath, clock)) break;
    const state = await judge(lockPath, timings, clock);
    if (state === "gone") continue;
    if (state === "stale") {
      await takeOver(dataDir, lockPath);
      continue;
    }
    if (clock.now() - startedAt >= timings.waitMs) return { ok: false, reason: "history-busy" };
    await clock.sleep(timings.pollMs);
  }
  try {
    return await fn();
  } finally {
    await unlink(lockPath).catch((error: unknown) => {
      if (codeOf(error) !== "ENOENT") throw error;
    });
  }
}
