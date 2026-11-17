/** Replaces each lone surrogate with U+FFFD; surrogate pairs stay. */
export function toWellFormedText(s) {
    let out = "";
    let i = 0;
    while (i < s.length) {
        const c = s.charCodeAt(i);
        if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
            const next = s.charCodeAt(i + 1);
            if (next >= 0xdc00 && next <= 0xdfff) {
                out += s.slice(i, i + 2);
                i += 2;
                continue;
            }
        }
        if (c >= 0xd800 && c <= 0xdfff) {
            out += "\uFFFD";
        }
        else {
            out += s.charAt(i);
        }
        i += 1;
    }
    return out;
}
const SEPARATORS = /[\s\p{Cc}\p{Cf}\u2028\u2029]+/gu;
const MAX_CODE_POINTS = 80;
/** Cleans one text field for the email: repairs surrogates, folds separators, cuts to 80 code points. */
export function cleanField(value) {
    const s = typeof value === "string" ? value : "";
    const folded = toWellFormedText(s).replace(SEPARATORS, " ").trim();
    return Array.from(folded).slice(0, MAX_CODE_POINTS).join("").trim();
}
