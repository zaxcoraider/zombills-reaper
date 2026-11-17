import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const BUNDLE = readFileSync(new URL("../dist/index.mjs", import.meta.url), "utf8");

/** Module specifiers of every static `import … from "x"`, `import "x"` and `export … from "x"`. */
function specifiers(source: string): string[] {
  const found: string[] = [];
  const pattern = /^\s*(?:import|export)\s+(?:[^"'\n;]*?\s+from\s+)?["']([^"']+)["']/gm;
  for (const match of source.matchAll(pattern)) found.push(match[1] ?? "");
  for (const match of source.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g)) {
    found.push(match[1] ?? "");
  }
  return found;
}

describe("ui/dist/index.mjs text", () => {
  it("contains no http:// or https://", () => {
    expect(BUNDLE).not.toContain("http://");
    expect(BUNDLE).not.toContain("https://");
  });

  it("imports only react and @kirocrew/app-sdk as bare specifiers", () => {
    const bare = specifiers(BUNDLE).filter((s) => !s.startsWith(".") && !s.startsWith("/"));
    expect(bare.length).toBeGreaterThan(0);
    for (const specifier of bare) expect(["react", "@kirocrew/app-sdk"]).toContain(specifier);
  });

  it("has no react/jsx-runtime, react-dom or lucide-react import", () => {
    const all = specifiers(BUNDLE);
    for (const banned of ["react/jsx-runtime", "react-dom", "lucide-react"]) {
      expect(all.some((s) => s === banned || s.startsWith(`${banned}/`))).toBe(false);
    }
  });
});
