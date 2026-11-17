// Reads every Statement file on its own (design "Scan algorithm" steps 3 to 5).
import {
  EMPTY_CSV_REASON,
  NO_CONTENT_ROWS_REASON,
  normalizeTransactions,
  parseStatement,
} from "@zombills/core";
import type { NormalizedTransaction } from "@zombills/core";
import type { SkipKind } from "../../shared/src/types.ts";
import { decodeStatementBytes } from "./decode-bytes.js";
import { listStatementFiles, readStatementFile } from "./statement-files.js";

export interface ReadAllResult {
  perFile: NormalizedTransaction[][];
  files: { read: number; skipped: Partial<Record<SkipKind, number>> };
  /** Only the number of rows Core rejected; the rows themselves are dropped. */
  rowErrorCount: number;
}

type FileOutcome =
  | { ok: true; transactions: NormalizedTransaction[]; rowErrorCount: number }
  | { ok: false; kind: SkipKind };

function readText(text: string): FileOutcome {
  const result = parseStatement(text);
  if (result.status === "mapping-required") return { ok: false, kind: "unknown-columns" };
  if (result.status === "error") {
    const empty = result.reason === EMPTY_CSV_REASON || result.reason === NO_CONTENT_ROWS_REASON;
    return { ok: false, kind: empty ? "empty" : "parse-error" };
  }
  const format = result.detectedDateFormat;
  if (
    format?.assumed === true &&
    (format.format === "dd/mm/yyyy" || format.format === "mm/dd/yyyy")
  ) {
    return { ok: false, kind: "ambiguous-dates" };
  }
  if (result.transactions.length === 0) return { ok: false, kind: "empty" };
  return {
    ok: true,
    transactions: normalizeTransactions(result.transactions),
    rowErrorCount: result.rowErrors.length,
  };
}

export async function readAll(folder: string): Promise<ReadAllResult> {
  const { names, tooMany } = await listStatementFiles(folder);
  const perFile: NormalizedTransaction[][] = [];
  const skipped: Partial<Record<SkipKind, number>> = {};
  let rowErrorCount = 0;
  const skip = (kind: SkipKind, count = 1): void => {
    skipped[kind] = (skipped[kind] ?? 0) + count;
  };
  if (tooMany > 0) skip("too-many", tooMany);

  for (const name of names) {
    const file = await readStatementFile(folder, name);
    if (!file.ok) {
      skip(file.kind);
      continue;
    }
    const outcome = readText(decodeStatementBytes(file.bytes));
    if (!outcome.ok) {
      skip(outcome.kind);
      continue;
    }
    perFile.push(outcome.transactions);
    rowErrorCount += outcome.rowErrorCount;
  }
  return { perFile, files: { read: perFile.length, skipped }, rowErrorCount };
}
