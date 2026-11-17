import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { build, generateAgent } from "./build.ts";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const BUNDLES = [
  "mcp/dist/server.js",
  "backend/dist/server.js",
  "ui/dist/index.mjs",
  "agents/reaper.json",
];

const tempDirs: string[] = [];

async function freshBuild(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "reaper-build-"));
  tempDirs.push(dir);
  await build({ outDir: dir });
  return dir;
}

function firstDifferingLine(a: Buffer, b: Buffer): number {
  const left = a.toString("utf8").split("\n");
  const right = b.toString("utf8").split("\n");
  const max = Math.max(left.length, right.length);
  for (let i = 0; i < max; i++) {
    if (left[i] !== right[i]) return i + 1;
  }
  return 0;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("bundles", () => {
  it("on disk match a fresh build", async () => {
    const dir = await freshBuild();
    for (const file of BUNDLES) {
      const fresh = await readFile(join(dir, file));
      const onDisk = await readFile(join(REPO_ROOT, file));
      if (!fresh.equals(onDisk)) {
        const line = firstDifferingLine(fresh, onDisk);
        expect.fail(
          `Run npm run build and commit the bundles (${file}, first difference at line ${line})`,
        );
      }
    }
  });

  it("are byte-equal across two builds (Req 2.8)", async () => {
    const first = await freshBuild();
    const second = await freshBuild();
    for (const file of BUNDLES) {
      const a = await readFile(join(first, file));
      const b = await readFile(join(second, file));
      expect(a.equals(b), file).toBe(true);
    }
  });

  it("MCP bundle holds line 1 of SOURCE (Req 2.8)", async () => {
    const source = await readFile(join(REPO_ROOT, "vendor/zombills-core/SOURCE"), "utf8");
    const line1 = source.split("\n")[0] ?? "";
    expect(line1).toMatch(/^[0-9a-f]{40}(-dirty)?$/);
    const bundle = await readFile(join(REPO_ROOT, "mcp/dist/server.js"), "utf8");
    expect(bundle).toContain(line1);
  });
});

describe("agents/reaper.json (generated)", () => {
  async function readSkillBody(): Promise<string> {
    const skill = await readFile(join(REPO_ROOT, "skills/reaper/SKILL.md"), "utf8");
    const lines = skill.split("\n");
    const close = lines.indexOf("---", 1);
    return lines
      .slice(close + 1)
      .join("\n")
      .replace(/^\n+/, "");
  }

  it("starts with the base prompt and ends with the skill body", async () => {
    const dir = await freshBuild();
    const agent = JSON.parse(await readFile(join(dir, "agents/reaper.json"), "utf8")) as {
      prompt: string;
    };
    const base = JSON.parse(await readFile(join(REPO_ROOT, "agents/reaper.base.json"), "utf8")) as {
      prompt: string;
    };
    const body = await readSkillBody();
    expect(agent.prompt.startsWith(base.prompt + "\n\n# Skill: reaper\n\n")).toBe(true);
    expect(agent.prompt.endsWith(body)).toBe(true);
  });

  it("holds no front-matter line of SKILL.md", async () => {
    const dir = await freshBuild();
    const agent = JSON.parse(await readFile(join(dir, "agents/reaper.json"), "utf8")) as {
      prompt: string;
    };
    expect(agent.prompt.split("\n")).not.toContain("---");
    expect(agent.prompt).not.toContain("triggers: ");
    expect(agent.prompt).not.toContain("always: false");
  });

  it("copies every other base field in order", async () => {
    const dir = await freshBuild();
    const agent = JSON.parse(await readFile(join(dir, "agents/reaper.json"), "utf8")) as Record<
      string,
      unknown
    >;
    const base = JSON.parse(
      await readFile(join(REPO_ROOT, "agents/reaper.base.json"), "utf8"),
    ) as Record<string, unknown>;
    expect(Object.keys(agent)).toEqual(Object.keys(base));
    for (const key of Object.keys(base)) {
      if (key !== "prompt") expect(agent[key]).toEqual(base[key]);
    }
  });

  it("is deterministic: a second build is byte-equal", async () => {
    const first = await freshBuild();
    const second = await freshBuild();
    const a = await readFile(join(first, "agents/reaper.json"));
    const b = await readFile(join(second, "agents/reaper.json"));
    expect(a.equals(b)).toBe(true);
  });
});

describe("generateAgent", () => {
  const SKILL = "---\nname: x\n---\n\n\n# Title\n\nBody\n";
  const BASE = JSON.stringify({ name: "a", prompt: "Base.", tools: [] });

  it("joins the base prompt and the skill body", () => {
    const out = JSON.parse(generateAgent(BASE, SKILL)) as { prompt: string };
    expect(out.prompt).toBe("Base.\n\n# Skill: reaper\n\n# Title\n\nBody\n");
  });

  it("normalises CRLF line endings", () => {
    const out = JSON.parse(generateAgent(BASE, SKILL.replace(/\n/g, "\r\n"))) as {
      prompt: string;
    };
    expect(out.prompt).not.toContain("\r");
  });

  it("fails on a skill without front-matter", () => {
    expect(() => generateAgent(BASE, "# Title\n")).toThrow(/no front-matter/);
    expect(() => generateAgent(BASE, "---\nname: x\n# Title\n")).toThrow(/no front-matter/);
  });

  it("fails when the base prompt already holds the skill text", () => {
    const base = JSON.stringify({ name: "a", prompt: "Base. # Title\n\nBody\n" });
    expect(() => generateAgent(base, SKILL)).toThrow(/already holds the skill text/);
  });
});

describe("package.json", () => {
  it("has no dependencies (Req 2.6)", async () => {
    const pkg = JSON.parse(await readFile(join(REPO_ROOT, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
    };
    expect(Object.keys(pkg.dependencies ?? {})).toEqual([]);
  });
});
