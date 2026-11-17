// Step 5: URLs and domains (design "Step 5", Req 3.7).
//   - pass 1: a word `http` or `https` whose next gap starts with `://` is removed;
//   - a leading `www.` is stripped from a word (raw and folded are cut at the same dot);
//   - domain test: 2+ labels of `[a-z0-9-]`, the last label or the last two in TLDS; the name
//     label is the label just before the TLD;
//   - a domain at the start of the list is replaced by its name label (raw case kept); any other
//     domain is removed;
//   - pass 1: path segments after a domain are removed. The first gap must start with `/`; each
//     segment's gap is non-empty and has no whitespace.
import { TLDS } from "./noise-lists.js";
import { removeTokens } from "./token-list.js";
const TLD_SET = new Set(TLDS);
const LABEL = /^[a-z0-9-]+$/u;
const WHITESPACE = /\s/u;
/** Name label of a folded domain word, or null when the word is not a domain. */
function nameLabelIndex(folded) {
    const labels = folded.split(".");
    if (labels.length < 2)
        return null;
    for (const label of labels) {
        if (!LABEL.test(label))
            return null;
    }
    const count = labels.length;
    if (count >= 3 && TLD_SET.has(`${labels[count - 2]}.${labels[count - 1]}`))
        return count - 3;
    if (TLD_SET.has(labels[count - 1]))
        return count - 2;
    return null;
}
/** Copy of `token` without a leading `www.`; both texts are cut at their first dot. */
function stripWww(token) {
    if (!token.folded.startsWith("www."))
        return token;
    const rawDot = token.raw.indexOf(".");
    if (rawDot < 0)
        return token;
    return { ...token, raw: token.raw.slice(rawDot + 1), folded: token.folded.slice(4) };
}
/** The token reduced to its name label, keeping the raw spelling of that label. */
function toNameLabel(token, labelIndex) {
    const foldedLabel = token.folded.split(".")[labelIndex];
    const rawLabels = token.raw.split(".");
    const rawLabel = rawLabels.length === token.folded.split(".").length
        ? rawLabels[labelIndex]
        : foldedLabel;
    return { ...token, raw: rawLabel, folded: foldedLabel };
}
function isPathGap(gap, first) {
    if (gap === "" || WHITESPACE.test(gap))
        return false;
    return !first || gap.startsWith("/");
}
export function removeDomains(list, ctx) {
    let current = list;
    if (ctx.firstPass) {
        current = removeTokens(current, (token, index) => {
            if (token.folded !== "http" && token.folded !== "https")
                return null;
            const next = current.tokens[index + 1];
            const gap = next === undefined ? current.trailingGap : next.gapBefore;
            return gap.startsWith("://") ? "domain" : null;
        }, ctx.log);
    }
    const { tokens } = current;
    const mapped = new Array(tokens.length);
    const drop = new Array(tokens.length).fill(false);
    let i = 0;
    while (i < tokens.length) {
        const stripped = stripWww(tokens[i]);
        const labelIndex = nameLabelIndex(stripped.folded);
        if (labelIndex === null) {
            mapped[i] = stripped;
            i++;
            continue;
        }
        if (i === 0) {
            mapped[i] = toNameLabel(stripped, labelIndex);
        }
        else {
            mapped[i] = stripped;
            drop[i] = true;
        }
        i++;
        if (!ctx.firstPass)
            continue;
        let first = true;
        while (i < tokens.length && isPathGap(tokens[i].gapBefore, first)) {
            mapped[i] = tokens[i];
            drop[i] = true;
            first = false;
            i++;
        }
    }
    return removeTokens({ tokens: mapped, trailingGap: current.trailingGap }, (_token, index) => (drop[index] === true ? "domain" : null), ctx.log);
}
