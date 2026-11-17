// Vendors a built @zombills/core from the local Zombills repo into vendor/zombills-core/.
// Dev script only: it never runs at Crew runtime. It reads the local disk and spawns `npm` and
// `git` on the local Zombills repo; it downloads nothing (privacy.md).
import { execFileSync } from "node:child_process";
import { cp, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export interface SyncCoreOptions {
  /** Root of this repo. */
  repoRoot: string;
  /** Root of the Zombills repo. */
  zombillsPath: string;
  /** Sync date as local `yyyy-mm-dd`. */
  today: string;
}

/** A refusal with a one-line message for stderr. */
export class SyncCoreError extends Error {}

interface PackageJson {
  name?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

async function readPackageJson(path: string): Promise<PackageJson | undefined> {
  try {
    // JSON.parse returns any; the shape is checked field by field by the callers.
    return JSON.parse(await readFile(path, "utf8")) as PackageJson;
  } catch {
    return undefined;
  }
}

/** Skips test files and source maps. */
function keepFile(source: string): boolean {
  const name = basename(source);
  return !/\.test\./.test(name) && !name.endsWith(".map");
}

function git(zombillsPath: string, args: string[]): string {
  return execFileSync("git", ["-C", zombillsPath, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

/** Builds Core in the Zombills repo and replaces vendor/zombills-core/ with the result. */
export async function syncCore({ repoRoot, zombillsPath, today }: SyncCoreOptions): Promise<void> {
  // Step 2: the path must be a Zombills repo.
  const corePackage = await readPackageJson(join(zombillsPath, "packages", "core", "package.json"));
  if (corePackage?.name !== "@zombills/core") {
    throw new SyncCoreError(`Not a Zombills repo: ${zombillsPath}`);
  }

  // Step 3: both repos must use the same papaparse.
  const coreVersion = corePackage.dependencies?.["papaparse"];
  const ownPackage = await readPackageJson(join(repoRoot, "package.json"));
  const ownVersion = ownPackage?.devDependencies?.["papaparse"];
  if (coreVersion !== ownVersion) {
    throw new SyncCoreError(
      `papaparse differs: Zombills core has ${coreVersion ?? "none"}, this repo has ${ownVersion ?? "none"}`,
    );
  }

  // Step 4: build Core.
  try {
    execFileSync("npm", ["run", "build", "--workspace", "@zombills/core"], {
      cwd: zombillsPath,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch {
    throw new SyncCoreError("Core build failed");
  }

  // Steps 5 and 6: copy into a temporary folder and write SOURCE.
  const vendorRoot = join(repoRoot, "vendor");
  const target = join(vendorRoot, "zombills-core");
  const temp = join(vendorRoot, `zombills-core.tmp-${process.pid}`);
  const old = join(vendorRoot, `zombills-core.old-${process.pid}`);
  await rm(temp, { recursive: true, force: true });
  try {
    await mkdir(temp, { recursive: true });
    const options = { recursive: true, dereference: true, filter: keepFile };
    await cp(join(zombillsPath, "packages", "core", "dist"), join(temp, "dist"), options);
    await cp(
      join(zombillsPath, "packages", "core", "package.json"),
      join(temp, "package.json"),
      options,
    );
    const hash = git(zombillsPath, ["rev-parse", "HEAD"]).trim();
    const dirty = git(zombillsPath, ["status", "--porcelain", "--", "packages/core"]).trim() !== "";
    await writeFile(join(temp, "SOURCE"), `${hash}${dirty ? "-dirty" : ""}\n${today}\n`);
  } catch (error) {
    await rm(temp, { recursive: true, force: true });
    throw error instanceof SyncCoreError
      ? error
      : new SyncCoreError("Core copy failed (is dist/ built and is this a git repo?)");
  }

  // Step 7: swap the new copy into place.
  await rm(old, { recursive: true, force: true });
  let hadOld = true;
  try {
    await rename(target, old);
  } catch {
    hadOld = false;
  }
  try {
    await rename(temp, target);
  } catch (error) {
    if (hadOld) await rename(old, target);
    await rm(temp, { recursive: true, force: true });
    throw error;
  }
  if (hadOld) await rm(old, { recursive: true, force: true });
}

/** Local date as `yyyy-mm-dd`. */
function localDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

const entry = process.argv[1];
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  const repoRoot = fileURLToPath(new URL("..", import.meta.url));
  const zombillsPath = resolve(repoRoot, process.argv[2] ?? "../Kiroween-Hackathon");
  try {
    await syncCore({ repoRoot, zombillsPath, today: localDate(new Date()) });
  } catch (error) {
    const message = error instanceof SyncCoreError ? error.message : "Core sync failed";
    process.stderr.write(`${message}\n`);
    process.exit(1);
  }
}
