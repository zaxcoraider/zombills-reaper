import { describe, expect, it } from "vitest";
import { ReplayCache } from "./replay-cache.ts";

describe("ReplayCache", () => {
  it("refuses the second use of a nonce", () => {
    const cache = new ReplayCache();
    expect(cache.accept("a", 160, 100)).toBe(true);
    expect(cache.accept("a", 160, 101)).toBe(false);
  });

  it("purges an expired entry and accepts its nonce again", () => {
    const cache = new ReplayCache();
    expect(cache.accept("a", 160, 100)).toBe(true);
    expect(cache.accept("a", 260, 160)).toBe(false); // expiry 160 is not < 160
    expect(cache.accept("a", 260, 161)).toBe(true);
  });

  it("refuses a new nonce when full and does not evict", () => {
    const cache = new ReplayCache();
    expect(cache.maxEntries).toBe(4096);
    for (let n = 0; n < cache.maxEntries; n++) {
      expect(cache.accept(`n${n}`, 1000, 100)).toBe(true);
    }
    expect(cache.accept("extra", 1000, 100)).toBe(false);
    expect(cache.accept("n0", 1000, 100)).toBe(false); // still held, not evicted
    expect(cache.accept("extra", 3000, 1001)).toBe(true); // all expired, purged
  });
});
