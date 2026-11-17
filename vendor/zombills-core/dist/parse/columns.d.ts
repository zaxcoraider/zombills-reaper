import type { ResolvedColumns } from "./internal-types.js";
import type { ColumnMap, ColumnMapValidationError } from "./types.js";
/**
 * Index of the currency column: the leftmost header named `currency` or `ccy`, ignoring case and
 * surrounding whitespace (Req 10.4), or null when the statement has none.
 */
export declare function findCurrencyColumn(header: readonly string[]): number | null;
/**
 * Works out which column holds what from the header names alone (Req 2.1-2.7, 2.10).
 *
 * Each role takes the leftmost matching header, except the description: it takes the header whose
 * name comes earliest in `DESCRIPTION_HEADERS` (leftmost among equal names), so `Description` beats
 * `Details` or `Memo` wherever they sit (Req 11.7). A statement with both a debit and a credit column
 * uses the debit/credit layout even when it also has an amount column (Req 2.5); otherwise an
 * amount column selects the signed layout.
 *
 * @returns the resolved columns, or null when the date, the description or the amount columns
 *   cannot all be found, so the caller asks the user for a mapping.
 */
export declare function autoDetectColumns(header: readonly string[]): ResolvedColumns | null;
/**
 * Checks a user-supplied column map against the header cells and turns it into column indices
 * (Req 2.8, 2.9, 9.3-9.5). Auto-detection does not run.
 *
 * The layout follows from the map: setting `debit` or `credit` selects debit/credit, which then
 * needs `date`, `description`, `debit` and `credit`. Otherwise the signed layout needs `date`,
 * `description` and `amount`. An `amount` given next to both `debit` and `credit` is ignored.
 *
 * Names are matched exactly against the raw header cells, which are the strings the caller
 * received in `columns`; with duplicate names the leftmost column wins. Every problem is
 * collected, one per role, before returning. The optional `currency` role is checked only when it
 * is set; when it is not, a column named `currency` or `ccy` is used if the statement has one.
 *
 * Pure: it reads its arguments and nothing else, so a rejected map changes no state (Req 9.5).
 */
export declare function resolveColumnMap(header: readonly string[], map: ColumnMap): {
    ok: true;
    columns: ResolvedColumns;
} | {
    ok: false;
    errors: ColumnMapValidationError[];
};
