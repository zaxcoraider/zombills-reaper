import { ParseError } from "./parse-error.js";
/** Largest accepted absolute value in cents: 99,999,999.00 in major units (Req 5.11). */
export const MAX_AMOUNT_CENTS = 9_999_999_900;
/** More integer digits than this can never fit under MAX_AMOUNT_CENTS, so they are rejected first. */
const MAX_INTEGER_DIGITS = 8;
/** Outer whitespace stripped before parsing (Req 5.1): Unicode Zs, Zl, Zp plus tab, newline, carriage return. */
const OUTER_WHITESPACE_CHAR = /[\p{Zs}\p{Zl}\p{Zp}\t\n\r]/u;
/** Any whitespace left inside the cell (Req 5.10). */
const INNER_WHITESPACE = /[\s\p{Z}]/u;
const SYMBOL_THEN_MINUS = /^(\p{Sc})-(.*)$/su;
const UNSIGNED = /^(?:(\p{Sc})([0-9.,]+)|([0-9.,]+)(\p{Sc})|([0-9.,]+))$/u;
const MAX_QUOTED_LENGTH = 40;
function quote(raw) {
    const shown = raw.length > MAX_QUOTED_LENGTH ? `${raw.slice(0, MAX_QUOTED_LENGTH)}…` : raw;
    return JSON.stringify(shown);
}
function fail(raw, why) {
    throw new ParseError("amount", `${why}: ${quote(raw)}`);
}
/** Negation that never produces -0, so results stay deeply equal to 0 (design: `-0`). */
export function negate(cents) {
    return cents === 0 ? 0 : -cents;
}
/** Strips outer whitespace (Req 5.1). Done with a loop rather than a regex to stay linear on long runs. */
function trimOuter(text) {
    let start = 0;
    let end = text.length;
    while (start < end && OUTER_WHITESPACE_CHAR.test(text.charAt(start))) {
        start += 1;
    }
    while (end > start && OUTER_WHITESPACE_CHAR.test(text.charAt(end - 1))) {
        end -= 1;
    }
    return text.slice(start, end);
}
/**
 * Splits an amount cell into its sign and its NUMBER text (one or more of `0-9 . ,`), with the
 * outer whitespace, the sign indicator and at most one currency symbol removed (Req 5.1-5.3, 5.9, 5.10).
 *
 * Accepted shapes: `-5`, `5-`, `(5)`, `$5`, `5$`, `-$5`, `$-5`, `($5)` and plain numbers.
 */
function scanAmount(raw) {
    const trimmed = trimOuter(raw);
    if (trimmed === "") {
        return { ok: false, why: "Empty amount" };
    }
    // Req 5.10: whitespace between components is an error.
    if (INNER_WHITESPACE.test(trimmed)) {
        return { ok: false, why: "Whitespace inside amount" };
    }
    // Req 5.2 and 5.3: exactly one sign indicator, at most one currency symbol.
    let negative = false;
    let body = trimmed;
    const symbolThenMinus = SYMBOL_THEN_MINUS.exec(trimmed);
    if (trimmed.startsWith("(")) {
        if (!trimmed.endsWith(")") || trimmed.length < 3) {
            return { ok: false, why: "Unbalanced parentheses in amount" };
        }
        negative = true;
        body = trimmed.slice(1, -1);
    }
    else if (trimmed.startsWith("-")) {
        negative = true;
        body = trimmed.slice(1);
    }
    else if (trimmed.endsWith("-")) {
        negative = true;
        body = trimmed.slice(0, -1);
    }
    else if (symbolThenMinus !== null) {
        negative = true;
        body = `${symbolThenMinus[1] ?? ""}${symbolThenMinus[2] ?? ""}`;
    }
    // Grammar of the unsigned part: `SYM NUMBER | NUMBER SYM | NUMBER`.
    const match = UNSIGNED.exec(body);
    const number = match === null ? undefined : (match[2] ?? match[3] ?? match[5]);
    if (match === null || number === undefined) {
        return { ok: false, why: "Unparseable amount" };
    }
    return { ok: true, negative, number, symbol: match[1] ?? match[4] ?? null };
}
/**
 * The NUMBER text of an amount cell (digits, `.` and `,` only), or null when the cell is not
 * shaped like an amount. Used to look at separators before the decimal separator is known.
 */
export function extractNumberText(raw) {
    const scanned = scanAmount(raw);
    return scanned.ok ? scanned.number : null;
}
/**
 * The currency symbol (Unicode category Sc) of an amount cell, or null when the cell has none or
 * is not shaped like an amount at all. A cell that is shaped like an amount counts even if its
 * value is later rejected, for example for having three decimals.
 */
export function extractCurrencySymbol(raw) {
    const scanned = scanAmount(raw);
    return scanned.ok ? scanned.symbol : null;
}
/**
 * Parses one amount cell into integer cents without ever going through floating point.
 *
 * @throws ParseError for anything that is not an amount. No other error type is thrown for string input.
 */
export function parseAmountCents(raw, separator) {
    const scanned = scanAmount(raw);
    if (!scanned.ok) {
        return fail(raw, scanned.why);
    }
    const { negative, number } = scanned;
    // Req 5.4 and 5.5: drop thousands separators, then split on the decimal separator.
    const thousands = separator === "." ? "," : ".";
    const withoutThousands = number.split(thousands).join("");
    const parts = withoutThousands.split(separator);
    if (parts.length > 2) {
        return fail(raw, "More than one decimal separator in amount");
    }
    const integerPart = parts[0] ?? "";
    const fractionPart = parts[1] ?? "";
    if (integerPart === "" && fractionPart === "") {
        return fail(raw, "Amount has no digits");
    }
    // Req 5.6 and 5.7: at most two decimal digits; never round or truncate.
    if (fractionPart.length > 2) {
        return fail(raw, "More than 2 decimal digits in amount");
    }
    // Req 5.11: reject oversized values before any numeric conversion.
    const significantInteger = integerPart.replace(/^0+/, "");
    if (significantInteger.length > MAX_INTEGER_DIGITS) {
        return fail(raw, "Amount exceeds the maximum");
    }
    const cents = (significantInteger === "" ? 0 : parseInt(significantInteger, 10)) * 100 +
        parseInt(fractionPart.padEnd(2, "0"), 10);
    if (cents > MAX_AMOUNT_CENTS) {
        return fail(raw, "Amount exceeds the maximum");
    }
    return negative ? negate(cents) : cents;
}
/**
 * Like `parseAmountCents`, but returns the failure instead of throwing it. Only `ParseError` is
 * caught: any other error is a bug and propagates.
 */
export function tryParseAmount(raw, separator) {
    try {
        return { ok: true, cents: parseAmountCents(raw, separator) };
    }
    catch (error) {
        if (error instanceof ParseError) {
            return { ok: false, reason: error.message };
        }
        throw error;
    }
}
