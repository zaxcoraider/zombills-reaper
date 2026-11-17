import type { SignConvention, SignConventionInfo } from "./types.js";
/**
 * Decides which sign means "money out" in a signed-amount statement, by majority (Req 6.1).
 *
 * Money out is the more common direction, so when most non-zero values are positive the statement
 * writes debits as positive numbers (`positive-out`), and when most are negative it writes them
 * as negative numbers (`negative-out`). Equal counts, including no values at all, cannot be
 * decided: the result is `positive-out` with `assumed: true` so the UI can offer an override.
 *
 * Zeros are not counted. The result depends only on the counts, not on the order of the values.
 */
export declare function detectSignConvention(nonZeroRawCents: readonly number[]): SignConventionInfo;
/**
 * Turns the amount as written in the statement into the stored amount, where positive is money out
 * and negative is money in (Req 6.3-6.7). Zero stays 0 under either convention, never -0.
 */
export declare function applySignConvention(rawCents: number, convention: SignConvention): number;
