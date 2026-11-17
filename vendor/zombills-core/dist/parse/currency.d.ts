import type { CurrencyInfo } from "./types.js";
/** The currency when nothing else says otherwise (Req 10.2, 10.9). */
export declare const DEFAULT_CURRENCY = "USD";
/**
 * Whether `value` has the shape of an ISO 4217 alpha-3 code: exactly three ASCII letters in any
 * case (Req 10.1, 10.3). It checks the shape only, not whether the code is assigned.
 */
export declare function isCurrencyCode(value: string): boolean;
/** Upper-cases a currency code, so "usd" becomes "USD". Call it on values that pass `isCurrencyCode`. */
export declare function normalizeCurrency(value: string): string;
/**
 * The currency of one row (Req 10.4-10.6).
 *
 * @param cell the row's cell in the currency column, or undefined when the statement has no such column
 * @param fallback the statement-level currency, already validated and upper-cased
 * @returns the cell's code in upper case; the fallback when there is no column or the cell is empty
 * @throws ParseError("currency") when the cell holds something that is not a currency code
 */
export declare function resolveRowCurrency(cell: string | undefined, fallback: string): string;
/**
 * Reads the statement currency off the currency symbols in the amount cells (Req 10.9).
 *
 * Only a pound sign or a euro sign names a currency. The dollar sign and the yen sign are shared
 * by several currencies, so they, any other symbol, a mix of symbols and no symbol at all give
 * null. Cells without a symbol and cells that are not shaped like amounts do not count against.
 */
export declare function inferCurrencyFromSymbols(amountCells: readonly string[]): "GBP" | "EUR" | null;
/**
 * Decides the one currency that rows without a currency of their own get (Req 10.1, 10.2, 10.5,
 * 10.7-10.10). The first rule that applies wins, so neither the column nor the symbols can ever
 * override an explicit option, and the symbols are only read when there is no column.
 *
 * @param option the normalised `options.currency`, or null
 * @param currencyCells the currency column's cell in every data row, or null when there is no such column
 * @param amountCells the amount column's cells, or the debit and credit columns' cells, of every data row
 */
export declare function decideStatementCurrency(input: {
    option: string | null;
    currencyCells: readonly string[] | null;
    amountCells: readonly string[];
}): CurrencyInfo;
