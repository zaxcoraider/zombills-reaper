import { negate } from "./amount.js";
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
export function detectSignConvention(nonZeroRawCents) {
    let positive = 0;
    let negative = 0;
    for (const cents of nonZeroRawCents) {
        if (cents > 0) {
            positive += 1;
        }
        else if (cents < 0) {
            negative += 1;
        }
    }
    if (positive > negative) {
        return { convention: "positive-out", assumed: false };
    }
    if (negative > positive) {
        return { convention: "negative-out", assumed: false };
    }
    return { convention: "positive-out", assumed: true };
}
/**
 * Turns the amount as written in the statement into the stored amount, where positive is money out
 * and negative is money in (Req 6.3-6.7). Zero stays 0 under either convention, never -0.
 */
export function applySignConvention(rawCents, convention) {
    if (rawCents === 0) {
        return 0;
    }
    return convention === "positive-out" ? rawCents : negate(rawCents);
}
