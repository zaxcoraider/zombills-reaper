import { z } from "zod";
import type { ZodType } from "zod";
import type { ToolResult } from "../../shared/src/types.ts";
import { logCounts, toErrorCode, toErrorName } from "./log.js";
import type { ToolName } from "./log.js";
import { scanStatements } from "./scan-statements.js";

export interface ToolContext {
  dataDir: string;
  appRoot: string;
  now: () => Date;
  timeZone: string;
  coreSource: string;
}

export interface ToolDefinition {
  description: string;
  inputSchema: ZodType;
  handler: (args: unknown) => Promise<ToolResult<object>>;
}

const SCAN_DESCRIPTION =
  "Reads the CSV statements in the user's statements folder in place, finds recurring charges with Zombills core and compares them with earlier scans. Returns a summary only: new undead, possessed charges, trial traps, charges that rose after burial, all current undead and yearly totals. Never returns transactions.";

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
  return tools;
}
