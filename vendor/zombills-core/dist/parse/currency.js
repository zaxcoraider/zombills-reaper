import { extractCurrencySymbol } from "./amount.js";
import { ParseError } from "./parse-error.js";
/** The currency when nothing else says otherwise (Req 10.2, 10.9). */
export const DEFAULT_CURRENCY = "USD";
const POUND_SIGN = "\u00a3";
const EURO_SIGN = "\u20ac";
const CURRENCY_CODE = /^[A-Za-z]{3}$/;
const MAX_QUOTED_LENGTH = 40;
/**
 * Whether `value` has the shape of an ISO 4217 alpha-3 code: exactly three ASCII letters in any
 * case (Req 10.1, 10.3). It checks the shape only, not whether the code is assigned.
 */
export function isCurrencyCode(value) {
    return CURRENCY_CODE.test(value);
}
/** Upper-cases a currency code, so "usd" becomes "USD". Call it on values that pass `isCurrencyCode`. */
export function normalizeCurrency(value) {
    return value.toUpperCase();
}
/**
 * The currency of one row (Req 10.4-10.6).
 *
 * @param cell the row's cell in the currency column, or undefined when the statement has no such column
 * @param fallback the statement-level currency, already validated and upper-cased
 * @returns the cell's code in upper case; the fallback when there is no column or the cell is empty
 * @throws ParseError("currency") when the cell holds something that is not a currency code
 */
export function resolveRowCurrency(cell, fallback) {
    if (cell === undefined) {
        return fallback;
    }
    const trimmed = cell.trim();
    if (trimmed === "") {
        return fallback;
    }
    if (!isCurrencyCode(trimmed)) {
        const shown = trimmed.length > MAX_QUOTED_LENGTH ? `${trimmed.slice(0, MAX_QUOTED_LENGTH)}…` : trimmed;
        throw new ParseError("currency", `Invalid currency code ${JSON.stringify(shown)}: expected 3 letters, such as "USD"`);
    }
    return normalizeCurrency(trimmed);
}
/**
 * Reads the statement currency off the currency symbols in the amount cells (Req 10.9).
 *
 * Only a pound sign or a euro sign names a currency. The dollar sign and the yen sign are shared
 * by several currencies, so they, any other symbol, a mix of symbols and no symbol at all give
 * null. Cells without a symbol and cells that are not shaped like amounts do not count against.
 */
export function inferCurrencyFromSymbols(amountCells) {
    let found = null;
    for (const cell of amountCells) {
        const symbol = extractCurrencySymbol(cell);
        if (symbol === null) {
            continue;
        }
        if (found !== null && found !== symbol) {
            return null;
        }
        found = symbol;
    }
    if (found === POUND_SIGN) {
        return "GBP";
    }
    return found === EURO_SIGN ? "EUR" : null;
}
/**
 * Decides the one currency that rows without a currency of their own get (Req 10.1, 10.2, 10.5,
 * 10.7-10.10). The first rule that applies wins, so neither the column nor the symbols can ever
 * override an explicit option, and the symbols are only read when there is no column.
 *
 * @param option the normalised `options.currency`, or null
 * @param currencyCells the currency column's cell in every data row, or null when there is no such column
 * @param amountCells the amount column's cells, or the debit and credit columns' cells, of every data row
 */
export function decideStatementCurrency(input) {
    if (input.option !== null) {
        return { code: input.option, source: "option" };
    }
    if (input.currencyCells !== null) {
        const codes = new Set();
        for (const cell of input.currencyCells) {
            const trimmed = cell.trim();
            if (isCurrencyCode(trimmed)) {
                codes.add(normalizeCurrency(trimmed));
            }
        }
        const [only] = codes;
        return {
            code: codes.size === 1 && only !== undefined ? only : DEFAULT_CURRENCY,
            source: "column",
        };
    }
    const inferred = inferCurrencyFromSymbols(input.amountCells);
    return inferred === null
        ? { code: DEFAULT_CURRENCY, source: "default" }
        : { code: inferred, source: "symbol" };
}
