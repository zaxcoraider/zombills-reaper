/** How many non-blank rows are searched for the header row (Req 11.1). */
export declare const HEADER_SEARCH_LIMIT = 20;
/**
 * Finds the header row among the first 20 non-blank rows: the first row with at least one cell
 * that, once trimmed and lower-cased, is exactly a date, description, amount, debit or credit name
 * (Req 11.1). Matching is exact, so a preamble cell such as "Statement date: 01/05/2026" is not
 * mistaken for a header. Blank rows are skipped and do not count towards the 20 (Req 11.2).
 *
 * @returns the index of the header row within `rows`, or null when none is found (Req 11.3).
 */
export declare function detectHeaderRow(rows: readonly (readonly string[])[]): number | null;
/** The cells of the first row that is not blank, or null when every row is blank (Req 11.3). */
export declare function firstNonBlankRow(rows: readonly (readonly string[])[]): string[] | null;
