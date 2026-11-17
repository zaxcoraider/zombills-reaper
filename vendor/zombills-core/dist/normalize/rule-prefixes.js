// Step 3: the leading loop (design "Step 3", Req 3.2, 3.4). A cursor walks from the start; on each
// turn the first rule that applies wins, and the loop stops when none does:
//   1. the longest card, POS or debit prefix;
//   2. when no processor is recorded yet, a processor form (the `*` forms only in pass 1);
//   3. once a processor is recorded, a further leading Amazon Marketplace form, removed without
//      being recorded (design review decision 2).
// The recorded processor is written to `ctx.processor`; the first one found wins.
import { CARD_PREFIXES, ISO_COUNTRY_CODES, PROCESSOR_FORMS } from "./noise-lists.js";
import { isReferenceToken } from "./rule-references.js";
import { removeLeading } from "./token-list.js";
const ISO_COUNTRY_SET = new Set(ISO_COUNTRY_CODES);
const WHITESPACE_ONLY = /^\s+$/u;
const TWO_LETTERS = /^\p{L}{2}$/u;
/** Length of the longest card prefix starting at `cursor`, or 0. CARD_PREFIXES is longest first. */
function cardPrefixLength(tokens, cursor) {
    for (const prefix of CARD_PREFIXES) {
        if (cursor + prefix.length > tokens.length)
            continue;
        let matches = true;
        for (let i = 0; i < prefix.length; i++) {
            if (tokens[cursor + i].folded !== prefix[i]) {
                matches = false;
                break;
            }
        }
        if (matches)
            return prefix.length;
    }
    return 0;
}
/** Folded gap in front of tokens[index], or the trailing gap when the index is past the end. */
function gapAt(list, index) {
    return list.tokens[index]?.gapBefore ?? list.trailingGap;
}
/** Number of tokens the form consumes at `cursor` (0 = no match). */
function formLength(list, cursor, form, ctx) {
    const { tokens } = list;
    const size = form.tokens.length;
    if (cursor + size > tokens.length)
        return 0;
    if (form.after !== "none" && !ctx.firstPass)
        return 0;
    for (let i = 0; i < size; i++) {
        const token = tokens[cursor + i];
        if (token.folded !== form.tokens[i])
            return 0;
        if (i > 0) {
            const ok = form.link === "slash" ? token.gapBefore === "/" : WHITESPACE_ONLY.test(token.gapBefore);
            if (!ok)
                return 0;
        }
    }
    const after = gapAt(list, cursor + size);
    if (form.after === "asterisk" && !after.includes("*"))
        return 0;
    if (form.after === "underscore-asterisk" && !(after.includes("_") && after.includes("*"))) {
        return 0;
    }
    if (form.countryCode) {
        const code = tokens[cursor + size];
        if (code !== undefined && TWO_LETTERS.test(code.folded) && ISO_COUNTRY_SET.has(code.folded)) {
            const next = tokens[cursor + size + 1];
            const consumed = next === undefined || next.gapBefore.includes("*") || isReferenceToken(next.folded);
            if (consumed)
                return size + 1;
        }
    }
    return size;
}
/** Step 3. Removes leading prefixes and processor forms and records the processor in `ctx`. */
export function removePrefixes(list, ctx) {
    let recorded = ctx.processor;
    const step = (current, cursor) => {
        const prefix = cardPrefixLength(current.tokens, cursor);
        if (prefix > 0)
            return { length: prefix, reason: "prefix" };
        for (const form of PROCESSOR_FORMS) {
            if (recorded !== null && form.processor !== "amazon-marketplace")
                continue;
            const length = formLength(current, cursor, form, ctx);
            if (length === 0)
                continue;
            if (recorded === null)
                recorded = form.processor;
            return { length, reason: "processor" };
        }
        return null;
    };
    const result = removeLeading(list, step, ctx.log);
    ctx.processor = recorded;
    return result;
}
