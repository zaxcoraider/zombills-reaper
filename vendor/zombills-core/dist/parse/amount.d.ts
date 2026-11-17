import type { AmountOutcome, DecimalSeparator } from "./internal-types.js";
/** Largest accepted absolute value in cents: 99,999,999.00 in major units (Req 5.11). */
export declare const MAX_AMOUNT_CENTS = 9999999900;
/** Negation that never produces -0, so results stay deeply equal to 0 (design: `-0`). */
export declare function negate(cents: number): number;
/**
 * The NUMBER text of an amount cell (digits, `.` and `,` only), or null when the cell is not
 * shaped like an amount. Used to look at separators before the decimal separator is known.
 */
export declare function extractNumberText(raw: string): string | null;
/**
 * The currency symbol (Unicode category Sc) of an amount cell, or null when the cell has none or
 * is not shaped like an amount at all. A cell that is shaped like an amount counts even if its
 * value is later rejected, for example for having three decimals.
 */
export declare function extractCurrencySymbol(raw: string): string | null;
/**
 * Parses one amount cell into integer cents without ever going through floating point.
 *
 * @throws ParseError for anything that is not an amount. No other error type is thrown for string input.
 */
export declare function parseAmountCents(raw: string, separator: DecimalSeparator): number;
/**
 * Like `parseAmountCents`, but returns the failure instead of throwing it. Only `ParseError` is
 * caught: any other error is a bug and propagates.
 */
export declare function tryParseAmount(raw: string, separator: DecimalSeparator): AmountOutcome;
