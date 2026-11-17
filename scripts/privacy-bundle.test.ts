import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CHILD_PROCESS_TOKEN, findHits, NETWORK_TOKENS } from "./test-privacy-tokens.ts";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const BUNDLES = ["mcp/dist/server.js", "backend/dist/server.js", "ui/dist/index.mjs"];
const TOKENS = [...NETWORK_TOKENS, CHILD_PROCESS_TOKEN];

interface AllowEntry {
  library: string;
  excerpt: string;
}

/**
 * A hit inside an inlined library is allowed only when it lies inside the exact excerpt of one
 * of these entries, and each entry must still be found, so the list cannot go stale.
 */
const ALLOWLIST: readonly AllowEntry[] = [
  {
    // NetworkStreamer is used only with `download: true`, which Core never sets.
    library: "papaparse",
    excerpt: "xhr = new XMLHttpRequest();",
  },
];

function readBundles(): Map<string, string> {
  return new Map(BUNDLES.map((name) => [name, readFileSync(join(ROOT, name), "utf8")]));
}

function excerptRanges(text: string, excerpt: string): [number, number][] {
  const ranges: [number, number][] = [];
  let from = text.indexOf(excerpt);
  while (from >= 0) {
    ranges.push([from, from + excerpt.length]);
    from = text.indexOf(excerpt, from + excerpt.length);
  }
  return ranges;
}

// Req 13.1: the committed bundles hold no network or child-process token beyond the allowlist.
describe("bundle privacy scan", () => {
  const bundles = readBundles();

  it("holds no token outside a named allowlist entry", () => {
    const unexplained: string[] = [];
    for (const [name, text] of bundles) {
      const allowed = ALLOWLIST.flatMap((entry) => excerptRanges(text, entry.excerpt));
      for (const hit of findHits(text, TOKENS)) {
        const covered = allowed.some(([start, end]) => hit.index >= start && hit.index < end);
        if (!covered) unexplained.push(`${name}:${hit.line} ${hit.token}`);
      }
    }
    expect(unexplained).toEqual([]);
  });

  it("finds every allowlist entry in a bundle", () => {
    const stale: string[] = [];
    for (const entry of ALLOWLIST) {
      const found = [...bundles.values()].some((text) => text.includes(entry.excerpt));
      if (!found) stale.push(`${entry.library}: ${entry.excerpt}`);
    }
    expect(stale).toEqual([]);
  });
});
