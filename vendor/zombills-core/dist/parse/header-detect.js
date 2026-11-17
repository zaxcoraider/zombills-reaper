import { AMOUNT_HEADERS, CREDIT_HEADERS, DATE_HEADERS, DEBIT_HEADERS, DESCRIPTION_HEADERS, isHeaderIn, } from "./header-names.js";
import { isBlankRow } from "./blank-row.js";
/** How many non-blank rows are searched for the header row (Req 11.1). */
export const HEADER_SEARCH_LIMIT = 20;
const LAYOUT_HEADER_LISTS = [
    DATE_HEADERS,
    DESCRIPTION_HEADERS,
    AMOUNT_HEADERS,
    DEBIT_HEADERS,
    CREDIT_HEADERS,
];
function looksLikeHeader(row) {
    return row.some((cell) => LAYOUT_HEADER_LISTS.some((names) => isHeaderIn(cell, names)));
}
/**
 * Finds the header row among the first 20 non-blank rows: the first row with at least one cell
 * that, once trimmed and lower-cased, is exactly a date, description, amount, debit or credit name
 * (Req 11.1). Matching is exact, so a preamble cell such as "Statement date: 01/05/2026" is not
 * mistaken for a header. Blank rows are skipped and do not count towards the 20 (Req 11.2).
 *
 * @returns the index of the header row within `rows`, or null when none is found (Req 11.3).
 */
export function detectHeaderRow(rows) {
    let seen = 0;
    for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index] ?? [];
        if (isBlankRow(row)) {
            continue;
        }
        seen += 1;
        if (seen > HEADER_SEARCH_LIMIT) {
            return null;
        }
        if (looksLikeHeader(row)) {
            return index;
        }
    }
    return null;
}
/** The cells of the first row that is not blank, or null when every row is blank (Req 11.3). */
export function firstNonBlankRow(rows) {
    for (const row of rows) {
        if (!isBlankRow(row)) {
            return [...row];
        }
    }
    return null;
}
