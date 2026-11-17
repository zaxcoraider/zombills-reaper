// Builds the three bundles (MCP server, backend, dashboard page) with esbuild and generates agents/reaper.json.
// Dev script only: it never runs at Crew runtime. It reads local files and makes no network call.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build as esbuild } from "esbuild";
import type { BuildOptions } from "esbuild";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));

const MCP_BANNER =
  'import { createRequire as __cr } from "node:module"; const require = __cr(import.meta.url);';

async function readFirstLine(path: string): Promise<string> {
  const text = await readFile(path, "utf8");
  return text.split("\n")[0] ?? "";
}

async function readAppVersion(path: string): Promise<string> {
  // JSON.parse returns any; only the version string is read and checked.
  const manifest = JSON.parse(await readFile(path, "utf8")) as { version?: unknown };
  if (typeof manifest.version !== "string") {
    throw new Error("app.json has no version string");
  }
  return manifest.version;
}

const SKILL_HEADING = "\n\n# Skill: reaper\n\n";

/** Returns the skill text without its front-matter, with `\n` line endings and no leading blank lines. */
export function skillBody(skillText: string): string {
  const lines = skillText.replace(/\r\n?/g, "\n").split("\n");
  if (lines[0] !== "---") {
    throw new Error("skills/reaper/SKILL.md has no front-matter");
  }
  const close = lines.indexOf("---", 1);
  if (close === -1) {
    throw new Error("skills/reaper/SKILL.md has no front-matter");
  }
  let rest = lines.slice(close + 1);
  while (rest.length > 0 && rest[0]?.trim() === "") rest = rest.slice(1);
  return rest.join("\n");
}

/**
 * The agent's unattended-run grants (live check, task 30): `send_message` is rejected in a cron
 * run unless it is granted here. Set at generation so the committed file always holds it.
 */
export const AGENT_ALLOWED_TOOLS = ["@zombills-reaper:reaper", "@kirocrew-core/send_message"];

/** Builds the agent file text: the base agent with the skill text appended to its prompt. */
export function generateAgent(baseText: string, skillText: string): string {
  // JSON.parse returns any; the fields are copied as they are and only `prompt` is checked.
  const base = JSON.parse(baseText) as Record<string, unknown>;
  const prompt = base["prompt"];
  if (typeof prompt !== "string") {
    throw new Error("agents/reaper.base.json has no prompt string");
  }
  const body = skillBody(skillText);
  if (prompt.includes(body)) {
    throw new Error("agents/reaper.base.json prompt already holds the skill text");
  }
  const agent = {
    ...base,
    allowedTools: [...AGENT_ALLOWED_TOOLS],
    prompt: prompt + SKILL_HEADING + body,
  };
  return JSON.stringify(agent, null, 2) + "\n";
}

/** Builds the three bundles under `outDir` (relative paths resolve against the repo root). */
export async function build({ outDir = "." }: { outDir?: string } = {}): Promise<void> {
  const coreSource = await readFirstLine(join(REPO_ROOT, "vendor/zombills-core/SOURCE"));
  const appVersion = await readAppVersion(join(REPO_ROOT, "app.json"));
  const out = (file: string): string => join(outDir, file);

  const shared: BuildOptions = {
    absWorkingDir: REPO_ROOT,
    bundle: true,
    format: "esm",
    charset: "utf8",
    legalComments: "eof",
    minify: false,
    sourcemap: false,
    metafile: false,
    logLevel: "warning",
  };

  await esbuild({
    ...shared,
    entryPoints: ["mcp/src/server.ts"],
    outfile: out("mcp/dist/server.js"),
    platform: "node",
    target: "node22",
    external: ["node:*"],
    define: {
      __CORE_SOURCE__: JSON.stringify(coreSource),
      __APP_VERSION__: JSON.stringify(appVersion),
    },
    banner: { js: MCP_BANNER },
  });

  await esbuild({
    ...shared,
    entryPoints: ["backend/src/server.ts"],
    outfile: out("backend/dist/server.js"),
    platform: "node",
    target: "node22",
    external: ["node:*"],
  });

  await esbuild({
    ...shared,
    entryPoints: ["ui/src/index.tsx"],
    outfile: out("ui/dist/index.mjs"),
    platform: "browser",
    target: "es2022",
    external: ["react", "react-dom", "lucide-react", "@kirocrew/app-sdk"],
    jsx: "transform",
    jsxFactory: "h",
    jsxFragment: "Fragment",
  });

  const baseText = await readFile(join(REPO_ROOT, "agents/reaper.base.json"), "utf8");
  const skillText = await readFile(join(REPO_ROOT, "skills/reaper/SKILL.md"), "utf8");
  const agentFile = resolve(REPO_ROOT, outDir, "agents/reaper.json");
  await mkdir(dirname(agentFile), { recursive: true });
  await writeFile(agentFile, generateAgent(baseText, skillText));
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await build();
}
