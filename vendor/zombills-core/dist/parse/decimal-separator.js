import { extractNumberText } from "./amount.js";
const CONFLICT_REASON = 'Conflicting decimal separator patterns: some amounts use "." as the decimal separator and others use ","';
/**
 * What one amount cell says about the decimal separator, or null when it says nothing (Req 4.2-4.4).
 *
 * - Both `,` and `.` present: the later one is the decimal separator ("1,234.56" -> ".", "1.234,56" -> ",").
 * - Only one kind present: it is the decimal separator when the last occurrence is followed by exactly
 *   1 or 2 digits ("9,99" -> ","). Exactly 3 trailing digits is ambiguous ("1,234") and says nothing.
 * - Digits only: says nothing.
 *
 * Cells that are not shaped like an amount are ignored; they become row errors later.
 */
function indicatorOf(cell) {
    const number = extractNumberText(cell);
    if (number === null) {
        return null;
    }
    const lastPeriod = number.lastIndexOf(".");
    const lastComma = number.lastIndexOf(",");
    if (lastPeriod >= 0 && lastComma >= 0) {
        return lastPeriod > lastComma ? "." : ",";
    }
    const lastPunctuation = Math.max(lastPeriod, lastComma);
    if (lastPunctuation < 0) {
        return null;
    }
    const trailingDigits = number.length - lastPunctuation - 1;
    if (trailingDigits === 1 || trailingDigits === 2) {
        return lastPeriod >= 0 ? "." : ",";
    }
    return null;
}
/**
 * Decides once per statement whether amounts use "." or "," as the decimal separator.
 *
 * Looks at every non-empty cell passed in (Req 4.1), so the result depends only on the set of cells
 * and not on their order (Req 4.7). Contradicting evidence is a conflict (Req 4.5); no evidence
 * defaults to "." (Req 4.6).
 */
export function detectDecimalSeparator(cells) {
    let sawPeriod = false;
    let sawComma = false;
    for (const cell of cells) {
        const indicator = indicatorOf(cell);
        if (indicator === ".") {
            sawPeriod = true;
        }
        else if (indicator === ",") {
            sawComma = true;
        }
    }
    if (sawPeriod && sawComma) {
        return { kind: "conflict", reason: CONFLICT_REASON };
    }
    return { kind: "detected", separator: sawComma ? "," : "." };
}
