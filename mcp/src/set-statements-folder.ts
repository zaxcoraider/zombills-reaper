// `set_statements_folder` (design "set_statements_folder", steps 1 to 7). The path never
// reaches a result or a log line (Req 3.5).
import { homedir } from "node:os";
import { basename, isAbsolute, resolve, sep } from "node:path";
import { realpath, readdir, stat } from "node:fs/promises";
import { encodeSettings } from "../../shared/src/settings-codec.ts";
import type { Reason, ToolResult } from "../../shared/src/types.ts";
import { ensureDataDir, writeFileAtomic } from "./data-files.js";
import { logCounts } from "./log.js";
import { listStatementFiles } from "./statement-files.js";
import type { ToolContext } from "./tools.js";

export interface SetFolderResult {
  folderName: string;
  statementFileCount: number;
}

/** Step 1: only a leading `~` or `~/`; `~user` is left alone and fails as `not-absolute`. */
function expandHome(path: string): string {
  if (path === "~") return homedir();
  if (path.startsWith("~/")) return homedir() + path.slice(1);
  return path;
}

function fail(reason: Reason): ToolResult<SetFolderResult> {
  logCounts("set-folder", { reason });
  return { ok: false, reason };
}

/** Step 3 errors: a missing path is `not-found`; any other failure is `not-readable`. */
function reasonOfPathError(error: unknown): Reason {
  const code = (error as NodeJS.ErrnoException | null)?.code;
  const missing = ["ENOENT", "ENOTDIR", "ENAMETOOLONG", "ERR_INVALID_ARG_VALUE"];
  return typeof code === "string" && missing.includes(code) ? "not-found" : "not-readable";
}

export async function setStatementsFolder(
  context: ToolContext,
  args: { path: string },
): Promise<ToolResult<SetFolderResult>> {
  const expanded = expandHome(args.path);
  if (!isAbsolute(expanded)) return fail("not-absolute");
  const resolved = resolve(expanded);

  let real: string;
  try {
    real = await realpath(resolved);
  } catch (error) {
    return fail(reasonOfPathError(error));
  }

  try {
    if (!(await stat(real)).isDirectory()) return fail("not-a-folder");
  } catch (error) {
    return fail(reasonOfPathError(error));
  }

  const realApp = await realpath(context.appRoot);
  if (real === realApp || real.startsWith(realApp + sep)) return fail("inside-app");

  try {
    await readdir(real);
  } catch {
    return fail("not-readable");
  }

  const files = await listStatementFiles(real).catch(() => null);
  if (files === null) return fail("not-readable");

  await ensureDataDir(context.dataDir);
  await writeFileAtomic(
    context.dataDir,
    "settings.json",
    encodeSettings({ version: 1, statementsFolder: resolved }),
  );
  const statementFileCount = files.names.length + files.tooMany;
  logCounts("set-folder", { files: statementFileCount });
  return { ok: true, folderName: basename(resolved), statementFileCount };
}
