// Steps 6 and 7: store numbers, then reference numbers (design "Steps 6 and 7", Req 3.9, 3.8).
// The engine must run removeStoreNumbers before removeReferences, so `STORE 1234` goes as a pair.
//   - store number (step 6): a pure-digit word whose gap in front ends in `#` (pass 1 only), or the
//     pairs `store ddd`, `no ddd`, `nr ddd` (both tokens removed, whitespace-only gap between them);
//   - reference (step 7): a word of 4+ ASCII digits, or a word of 6+ code points, all letters or
//     digits, with at least 2 ASCII digits and at least 1 letter (`2K4LJ8MB3`, `0412`).
// Each rule marks tokens in one scan; one linear filter then removes them and merges their gaps.
import { removeTokens } from "./token-list.js";
const MIN_REFERENCE_DIGITS = 4;
const MIN_MIXED_REFERENCE_LENGTH = 6;
const LETTER = /^\p{L}$/u;
const LETTER_OR_DIGIT = /^[\p{L}\p{N}]$/u;
const WHITESPACE_ONLY = /^\s+$/u;
const STORE_WORDS = new Set(["store", "no", "nr"]);
function isAsciiDigit(char) {
    return char >= "0" && char <= "9";
}
/** True when the text is non-empty and made of ASCII digits only. */
function isPureDigits(text) {
    if (text.length === 0)
        return false;
    for (let i = 0; i < text.length; i++) {
        if (!isAsciiDigit(text.charAt(i)))
            return false;
    }
    return true;
}
/** Reference number test of Req 3.8, on a folded word. */
export function isReferenceToken(text) {
    if (isPureDigits(text))
        return text.length >= MIN_REFERENCE_DIGITS;
    let length = 0;
    let digits = 0;
    let letters = 0;
    for (const char of text) {
        length++;
        if (isAsciiDigit(char))
            digits++;
        else if (LETTER.test(char))
            letters++;
        else if (!LETTER_OR_DIGIT.test(char))
            return false;
    }
    return length >= MIN_MIXED_REFERENCE_LENGTH && digits >= 2 && letters >= 1;
}
/** Step 7: removes reference numbers anywhere. Runs after removeStoreNumbers. */
export function removeReferences(list, ctx) {
    return removeTokens(list, (token) => (isReferenceToken(token.folded) ? "reference" : null), ctx.log);
}
/** Step 6: removes `#ddd` (pass 1) and the pairs `store ddd`, `no ddd`, `nr ddd`. */
export function removeStoreNumbers(list, ctx) {
    const { tokens } = list;
    const drop = new Array(tokens.length).fill(false);
    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        if (!isPureDigits(token.folded))
            continue;
        if (ctx.firstPass && token.gapBefore.endsWith("#")) {
            drop[i] = true;
            continue;
        }
        const previous = tokens[i - 1];
        if (previous !== undefined &&
            !drop[i - 1] &&
            STORE_WORDS.has(previous.folded) &&
            WHITESPACE_ONLY.test(token.gapBefore)) {
            drop[i - 1] = true;
            drop[i] = true;
        }
    }
    return removeTokens(list, (_token, index) => (drop[index] === true ? "store-number" : null), ctx.log);
}
