// Step 1: masked card numbers (design "Step 1", Req 3.3). Removed anywhere in the description:
//   - a word like `XXXX1234` (two or more `x`, then 4 digits);
//   - a 4-digit word whose gap in front ends in two or more `*` (`****1234`);
//   - the sequences `card dddd`, `card ending dddd` and `card no dddd`, taking a directly preceding
//     `check` with them: `check card` is a prefix (Req 3.2), but `check` alone is not, so removing
//     only `card dddd` would leave `CHECK` behind as part of the merchant name.
// One left-to-right scan builds the new list. The gaps of removed tokens are merged into the next
// kept token (or into trailingGap), so later rules still see `*` and other separators.
import { spanOfRun } from "./token-list.js";
const MASKED_X = /^x{2,}[0-9]{4}$/u;
const FOUR_DIGITS = /^[0-9]{4}$/u;
/** Number of tokens in a `card [ending|no] dddd` sequence starting at `index`, or 0. */
function cardPhraseLength(tokens, index) {
    if (tokens[index]?.folded !== "card")
        return 0;
    const second = tokens[index + 1]?.folded;
    if (second === undefined)
        return 0;
    if (FOUR_DIGITS.test(second))
        return 2;
    if (second !== "ending" && second !== "no")
        return 0;
    const third = tokens[index + 2]?.folded;
    return third !== undefined && FOUR_DIGITS.test(third) ? 3 : 0;
}
export function removeCardNumbers(list, ctx) {
    const { tokens } = list;
    const kept = [];
    let carried = "";
    let i = 0;
    while (i < tokens.length) {
        const original = tokens[i];
        const gap = carried + original.gapBefore;
        carried = "";
        const checkPhrase = original.folded === "check" ? cardPhraseLength(tokens, i + 1) : 0;
        const phrase = checkPhrase > 0 ? checkPhrase + 1 : cardPhraseLength(tokens, i);
        if (phrase > 0) {
            ctx.log.push({ reason: "card-number", span: spanOfRun(tokens, i, i + phrase) });
            carried = gap;
            for (let j = 1; j < phrase; j++)
                carried += tokens[i + j].gapBefore;
            i += phrase;
            continue;
        }
        const masked = MASKED_X.test(original.folded) || (FOUR_DIGITS.test(original.folded) && gap.endsWith("**"));
        if (masked) {
            ctx.log.push({ reason: "card-number", span: original.span });
            carried = gap;
        }
        else {
            kept.push(gap === original.gapBefore ? original : { ...original, gapBefore: gap });
        }
        i++;
    }
    return { tokens: kept, trailingGap: carried + list.trailingGap };
}
