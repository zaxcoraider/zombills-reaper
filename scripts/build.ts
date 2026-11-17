// Builds the three bundles (MCP server, backend, dashboard page) with esbuild.
// Dev script only: it never runs at Crew runtime. It reads local files and makes no network call.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
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
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await build();
}
