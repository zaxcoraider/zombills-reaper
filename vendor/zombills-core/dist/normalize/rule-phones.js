// Step 4: phone numbers (design "Step 4", Req 3.6). Removed anywhere. Three shapes:
//   1. a single digit-group word with 7-15 digits (`866-579-7172`, `8665797172`);
//   2. a marked run: a digit group whose gap ends in `+` or `(`, followed by pure-digit words
//      joined by one space (or, for the second group after `(`, by `)` or `) `), 7-15 digits
//      in total (`+44 20 7946 0958`, `(800) 123 4567`);
//   3. an unmarked spaced run of three pure-digit words of 3, 3 and 4 digits, single-space gaps,
//      optionally preceded by the word `1` (`866 579 7172`, `1 866 579 7172`).
// Digit groups are checked with a character loop. The scan marks tokens to drop; one linear
// filter then removes them and merges their gaps into the next kept token.
import { removeTokens } from "./token-list.js";
const MIN_PHONE_DIGITS = 7;
const MAX_PHONE_DIGITS = 15;
function isAsciiDigit(code) {
    return code >= 48 && code <= 57;
}
/**
 * Digit count of a digit group (ASCII digits with single `-` or `.` between digit runs), or -1
 * when the text is not a digit group.
 */
function digitGroupCount(text) {
    let digits = 0;
    let previousWasSeparator = true; // a separator may not come first
    for (let i = 0; i < text.length; i++) {
        const code = text.charCodeAt(i);
        if (isAsciiDigit(code)) {
            digits++;
            previousWasSeparator = false;
        }
        else if ((code === 45 || code === 46) && !previousWasSeparator) {
            previousWasSeparator = true;
        }
        else {
            return -1;
        }
    }
    return previousWasSeparator ? -1 : digits;
}
/** Digit count of a pure-digit word (no separators), or -1. */
function pureDigitCount(text) {
    if (text.length === 0)
        return -1;
    for (let i = 0; i < text.length; i++) {
        if (!isAsciiDigit(text.charCodeAt(i)))
            return -1;
    }
    return text.length;
}
function endsWithMarker(gap) {
    return gap.endsWith("+") || gap.endsWith("(");
}
/** Length of a marked run starting at `index`, or 0. */
function markedRunLength(tokens, index) {
    const first = tokens[index];
    if (!endsWithMarker(first.gapBefore))
        return 0;
    let total = digitGroupCount(first.folded);
    if (total < 0 || total > MAX_PHONE_DIGITS)
        return 0;
    const opened = first.gapBefore.endsWith("(");
    let length = 1;
    for (;;) {
        const next = tokens[index + length];
        if (next === undefined)
            break;
        const count = pureDigitCount(next.folded);
        if (count < 0 || total + count > MAX_PHONE_DIGITS)
            break;
        const gap = next.gapBefore;
        const joins = gap === " " || (opened && length === 1 && (gap === ")" || gap === ") "));
        if (!joins)
            break;
        total += count;
        length++;
    }
    return total >= MIN_PHONE_DIGITS ? length : 0;
}
/** True when tokens[index..index+2] are pure-digit words of 3, 3 and 4 digits, one space apart. */
function isNanpWindow(tokens, index) {
    const a = tokens[index];
    const b = tokens[index + 1];
    const c = tokens[index + 2];
    if (a === undefined || b === undefined || c === undefined)
        return false;
    return (pureDigitCount(a.folded) === 3 &&
        pureDigitCount(b.folded) === 3 &&
        pureDigitCount(c.folded) === 4 &&
        b.gapBefore === " " &&
        c.gapBefore === " ");
}
/** Length of an unmarked NANP-shaped run starting at `index` (3, or 4 with a leading `1`), or 0. */
function unmarkedRunLength(tokens, index) {
    const first = tokens[index];
    if (first.folded === "1" &&
        tokens[index + 1]?.gapBefore === " " &&
        isNanpWindow(tokens, index + 1)) {
        return 4;
    }
    return isNanpWindow(tokens, index) ? 3 : 0;
}
export function removePhones(list, ctx) {
    const { tokens } = list;
    const drop = new Array(tokens.length).fill(false);
    let i = 0;
    while (i < tokens.length) {
        const token = tokens[i];
        let length = markedRunLength(tokens, i);
        if (length === 0) {
            const digits = digitGroupCount(token.folded);
            if (digits >= MIN_PHONE_DIGITS && digits <= MAX_PHONE_DIGITS)
                length = 1;
        }
        if (length === 0)
            length = unmarkedRunLength(tokens, i);
        if (length === 0) {
            i++;
            continue;
        }
        for (let j = i; j < i + length; j++)
            drop[j] = true;
        i += length;
    }
    return removeTokens(list, (_token, index) => (drop[index] === true ? "phone" : null), ctx.log);
}
