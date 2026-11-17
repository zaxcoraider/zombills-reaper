import type { Reason } from "../../shared/src/types.ts";

export type LogEvent =
  "scan" | "graveyard" | "bury" | "unbury" | "set-folder" | "tool-error" | "lock-takeover";

/** Tool names a log line may carry. Later tasks add their names here. */
export type ToolName =
  "scan_statements" | "list_graveyard" | "bury" | "unbury" | "set_statements_folder";

/** Error names a log line may carry. Anything else is logged as "Error". */
export type ErrorName = "Error" | "TypeError" | "RangeError" | "SyntaxError" | "SystemError";

/** An error code such as `EACCES`, checked by `toErrorCode`; it cannot hold free text. */
export type ErrorCode = string & { readonly __errorCode: true };

/** Only numbers, reason codes, tool and error names, error codes and null reach stderr. */
export type LogValue = number | Reason | ToolName | ErrorName | ErrorCode | null;

const ERROR_NAMES: readonly string[] = [
  "Error",
  "TypeError",
  "RangeError",
  "SyntaxError",
  "SystemError",
];

const ERROR_CODE_PATTERN = /^[A-Z][A-Z0-9_]{1,30}$/;

/** Maps any thrown name onto the fixed list. */
export function toErrorName(name: unknown): ErrorName {
  // The list check above makes the cast safe: only listed names pass.
  return typeof name === "string" && ERROR_NAMES.includes(name) ? (name as ErrorName) : "Error";
}

/** Keeps a Node-style code (`ENOENT`, `ERR_INVALID_ARG_TYPE`); anything else becomes null. */
export function toErrorCode(code: unknown): ErrorCode | null {
  // The pattern check makes the brand honest: only upper-case code-like strings pass.
  return typeof code === "string" && ERROR_CODE_PATTERN.test(code) ? (code as ErrorCode) : null;
}

/** The only writer to stderr: `reaper: <event> k=v …`. Counts and codes only (Req 13.3). */
export function logCounts(event: LogEvent, counts: Record<string, LogValue>): void {
  const parts = Object.entries(counts).map(([key, value]) => `${key}=${String(value)}`);
  process.stderr.write(`reaper: ${[event, ...parts].join(" ")}\n`);
}
