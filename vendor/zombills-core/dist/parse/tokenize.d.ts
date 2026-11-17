import { isBlankRow } from "./blank-row.js";
import type { Delimiter, ParsedTable } from "./internal-types.js";
/** Removes one leading UTF-8 byte order mark (U+FEFF), if present. */
export declare function stripBom(csv: string): string;
export { isBlankRow };
/**
 * Splits CSV text into rows and cells with Papa Parse. All cells stay strings and blank rows are
 * kept, so the caller applies its own blank-row rule.
 *
 * The delimiter is one of comma, semicolon and tab. Papa Parse guesses it first. That guess only
 * looks at the first ten rows and prefers the most consistent row width, so a file with narrow
 * preamble lines above a wide header can be misread. The guess is therefore checked against the
 * whole file: each of the three delimiters is tried with Papa Parse, and the one that splits the
 * file best wins. Papa Parse's own guess wins ties, and comma is the fallback when nothing splits
 * any row.
 *
 * Papa Parse problems (for example unbalanced quotes) are not fatal here. They surface later as
 * row errors on the affected rows.
 */
export declare function tokenize(csv: string): ParsedTable;
/** Re-serialises a row with the given delimiter, quoting cells where needed. Used for `RowError.rawRow`. */
export declare function serializeRow(cells: readonly string[], delimiter: Delimiter): string;
