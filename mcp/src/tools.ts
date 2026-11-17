import { z } from "zod";
import type { ZodType } from "zod";
import type { ToolResult } from "../../shared/src/types.ts";
import { logCounts, toErrorCode, toErrorName } from "./log.js";
import type { ToolName } from "./log.js";
import { bury } from "./bury.js";
import type { LockClock, LockTimings } from "./history-lock.js";
import { listGraveyard } from "./list-graveyard.js";
import { scanStatements } from "./scan-statements.js";
import { setStatementsFolder } from "./set-statements-folder.js";
import { unbury } from "./unbury.js";

export interface ToolContext {
  dataDir: string;
  appRoot: string;
  now: () => Date;
  timeZone: string;
  coreSource: string;
  /** Lock timings and clock; tests set it, the server leaves it out (real timings). */
  lock?: { timings: LockTimings; clock: LockClock };
}

export interface ToolDefinition {
  description: string;
  inputSchema: ZodType;
  handler: (args: unknown) => Promise<ToolResult<object>>;
}

const BURY_DESCRIPTION =
  "Records that the user chose to cancel one current recurring charge and returns a cancel link or a cancellation email draft. The service text is a name as the user wrote it, optionally followed by an amount such as 16.99. Drafts only; never cancels, logs in or sends.";

const UNBURY_DESCRIPTION = "Removes one tombstone, for when the user changes their mind.";

const GRAVEYARD_DESCRIPTION =
  "Returns the tombstones, the yearly savings per currency and a month-by-month history.";

const SCAN_DESCRIPTION =
  "Reads the CSV statements in the user's statements folder in place, finds recurring charges with Zombills core and compares them with earlier scans. Returns a summary only: new undead, possessed charges, trial traps, charges that rose after burial, all current undead and yearly totals. Never returns transactions.";

const SET_FOLDER_DESCRIPTION =
  "Sets the folder of bank statement CSVs the Reaper reads in place. The path you pass is a tool argument, so it reaches the model provider and Crew's transcripts. Editing data/settings.json by hand keeps it on this machine.";

/**
 * Wraps a handler so it never throws: an error becomes `internal-error` and one count line
 * with the tool, the error's name and its code only (design "Wiring").
 */
export function guarded(
  tool: ToolName,
  handler: (args: unknown) => Promise<ToolResult<object>>,
): (args: unknown) => Promise<ToolResult<object>> {
  return async (args) => {
    try {
      return await handler(args);
    } catch (err) {
      const isObject = typeof err === "object" && err !== null;
      logCounts("tool-error", {
        tool,
        name: toErrorName(isObject ? err.constructor.name : null),
        code: toErrorCode(isObject && "code" in err ? err.code : null),
      });
      return { ok: false, reason: "internal-error" };
    }
  };
}

export function createReaperTools(context: ToolContext): Map<string, ToolDefinition> {
  const tools = new Map<string, ToolDefinition>();
  tools.set("scan_statements", {
    description: SCAN_DESCRIPTION,
    inputSchema: z.object({}).strict(),
    handler: guarded("scan_statements", () => scanStatements(context)),
  });
  tools.set("list_graveyard", {
    description: GRAVEYARD_DESCRIPTION,
    inputSchema: z.object({}).strict(),
    handler: guarded("list_graveyard", () => listGraveyard(context)),
  });
  const buryInput = z.object({ service: z.string().min(1).max(400) }).strict();
  tools.set("bury", {
    description: BURY_DESCRIPTION,
    inputSchema: buryInput,
    handler: guarded("bury", (args) => bury(context, buryInput.parse(args))),
  });
  tools.set("unbury", {
    description: UNBURY_DESCRIPTION,
    inputSchema: buryInput,
    handler: guarded("unbury", (args) => unbury(context, buryInput.parse(args))),
  });
  const folderInput = z.object({ path: z.string().min(1).max(4096) }).strict();
  tools.set("set_statements_folder", {
    description: SET_FOLDER_DESCRIPTION,
    inputSchema: folderInput,
    handler: guarded("set_statements_folder", (args) =>
      setStatementsFolder(context, folderInput.parse(args)),
    ),
  });
  return tools;
}
