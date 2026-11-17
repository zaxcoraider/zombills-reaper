import { spawn } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LOCK_TIMINGS, withHistoryLock } from "./history-lock.js";
import type { LockClock } from "./history-lock.js";

let dataDir: string;
let lockPath: string;

/** A clock that never waits: `sleep` moves `now` forward and counts the call. */
function fakeClock(start: number): LockClock & { sleeps: number; time: () => number } {
  let t = start;
  const clock = {
    sleeps: 0,
    time: () => t,
    now: () => t,
    sleep: (ms: number): Promise<void> => {
      clock.sleeps += 1;
      t += ms;
      return Promise.resolve();
    },
  };
  return clock;
}

async function plantLock(content: string, mtimeMs: number): Promise<void> {
  await writeFile(lockPath, content);
  await utimes(lockPath, mtimeMs / 1000, mtimeMs / 1000);
}

async function deadPid(): Promise<number> {
  const child = spawn("node", ["-e", ""]);
  const pid = child.pid;
  await new Promise<void>((resolve) => child.once("close", () => resolve()));
  if (pid === undefined) throw new Error("no pid");
  return pid;
}

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), "reaper-lock-"));
  lockPath = join(dataDir, "history.lock");
});

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true });
});

describe("withHistoryLock", () => {
  it("runs fn once on a free lock and leaves no lock file", async () => {
    let calls = 0;
    const result = await withHistoryLock(dataDir, () => {
      calls += 1;
      return Promise.resolve("done");
    });
    expect(result).toBe("done");
    expect(calls).toBe(1);
    expect(await readdir(dataDir)).toEqual([]);
  });

  it("creates the lock file with mode 0600 while fn runs", async () => {
    let mode = 0;
    let text = "";
    await withHistoryLock(dataDir, async () => {
      mode = (await stat(lockPath)).mode & 0o777;
      text = await readFile(lockPath, "utf8");
    });
    expect(mode).toBe(0o600);
    expect(JSON.parse(text)).toMatchObject({ pid: process.pid });
  });

  it("gives history-busy after waitMs without calling fn", async () => {
    const clock = fakeClock(Date.now());
    await plantLock(JSON.stringify({ pid: process.pid, at: "x" }), clock.now());
    let calls = 0;
    const result = await withHistoryLock(
      dataDir,
      () => {
        calls += 1;
        return Promise.resolve("done");
      },
      LOCK_TIMINGS,
      clock,
    );
    expect(result).toEqual({ ok: false, reason: "history-busy" });
    expect(calls).toBe(0);
    expect(clock.sleeps).toBe(LOCK_TIMINGS.waitMs / LOCK_TIMINGS.pollMs);
    // The held lock is not ours to remove.
    expect(await readdir(dataDir)).toEqual(["history.lock"]);
  });

  it("takes over a lock older than staleMs", async () => {
    const clock = fakeClock(Date.now());
    await plantLock(
      JSON.stringify({ pid: process.pid, at: "x" }),
      clock.now() - LOCK_TIMINGS.staleMs - 1_000,
    );
    const result = await withHistoryLock(
      dataDir,
      () => Promise.resolve("done"),
      LOCK_TIMINGS,
      clock,
    );
    expect(result).toBe("done");
    expect(clock.sleeps).toBe(0);
    expect(await readdir(dataDir)).toEqual([]);
  });

  it("takes over a fresh lock that names a dead pid at once", async () => {
    const clock = fakeClock(Date.now());
    await plantLock(JSON.stringify({ pid: await deadPid(), at: "x" }), clock.now());
    const result = await withHistoryLock(
      dataDir,
      () => Promise.resolve("done"),
      LOCK_TIMINGS,
      clock,
    );
    expect(result).toBe("done");
    expect(clock.sleeps).toBe(0);
    expect(await readdir(dataDir)).toEqual([]);
  });

  it("judges an unparsable fresh lock by its mtime only", async () => {
    const clock = fakeClock(Date.now());
    await plantLock("{not json", clock.now());
    const busy = await withHistoryLock(dataDir, () => Promise.resolve("done"), LOCK_TIMINGS, clock);
    expect(busy).toEqual({ ok: false, reason: "history-busy" });

    await plantLock("{not json", clock.now() - LOCK_TIMINGS.staleMs - 1_000);
    const taken = await withHistoryLock(
      dataDir,
      () => Promise.resolve("done"),
      LOCK_TIMINGS,
      clock,
    );
    expect(taken).toBe("done");
  });

  it("unlinks the lock and rethrows when fn throws", async () => {
    await expect(withHistoryLock(dataDir, () => Promise.reject(new Error("boom")))).rejects.toThrow(
      "boom",
    );
    expect(await readdir(dataDir)).toEqual([]);
  });

  it("ignores a lock that fn already removed", async () => {
    const result = await withHistoryLock(dataDir, async () => {
      await rm(lockPath);
      return "done";
    });
    expect(result).toBe("done");
  });
});
