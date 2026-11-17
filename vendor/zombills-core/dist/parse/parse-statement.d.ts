import type { ParseOptions, ParseResult } from "./types.js";
/**
 * Parses a bank-statement CSV into transactions.
 *
 * The statement-level decisions (header row, columns, date format, decimal separator, sign
 * convention) are made once from the whole statement. Then each data row becomes a transaction or
 * a row error. See `.kiro/specs/statement-parser/design.md` for the order of the steps.
 *
 * @throws TypeError only when `csv` is not a string. Every other problem is a returned result.
 */
export declare function parseStatement(csv: string, optionsArgument?: ParseOptions): ParseResult;
