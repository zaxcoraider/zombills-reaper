// Display helpers: slug for generic keys and title case for generic display names.
// See .kiro/specs/merchant-normalizer/design.md ("Identity builder").
const NON_ALNUM_RUN = /[^\p{L}\p{N}]+/gu;
const EDGE_DASHES = /^-+|-+$/gu;
const LETTER = /^\p{L}$/u;
const DIGIT = /^\p{N}$/u;
/** Replace each run of non-letter, non-digit characters with "-" and trim the ends. */
export function slugify(foldedText) {
    return foldedText.replace(NON_ALNUM_RUN, "-").replace(EDGE_DASHES, "");
}
/**
 * Upper-case initial letters (the first letter or digit of the token, or a letter
 * right after "-") and lower-case the rest. An initial letter whose upper-case form
 * is more than one code point (ß → SS) is left unchanged, which keeps the function
 * idempotent (Req 9.5).
 */
export function titleCase(rawToken) {
    let initial = true;
    let out = "";
    for (const ch of rawToken) {
        if (LETTER.test(ch)) {
            if (initial) {
                const upper = ch.toUpperCase();
                out += [...upper].length === 1 ? upper : ch;
            }
            else {
                out += ch.toLowerCase();
            }
            initial = false;
        }
        else if (DIGIT.test(ch)) {
            out += ch;
            initial = false;
        }
        else {
            out += ch;
            if (ch === "-")
                initial = true;
        }
    }
    return out;
}
