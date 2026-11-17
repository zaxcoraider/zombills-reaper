// Known service matching. See .kiro/specs/merchant-normalizer/design.md ("Known service matching").
import { KNOWN_SERVICES } from "./known-services.js";
function buildIndexes() {
    const containsByFirstToken = new Map();
    const exactByText = new Map();
    KNOWN_SERVICES.forEach((service, serviceIndex) => {
        service.variants.forEach((variant, variantIndex) => {
            const tokens = Object.freeze(variant.text.split(" "));
            const entry = Object.freeze({
                tokens,
                length: variant.text.length,
                serviceIndex,
                variantIndex,
            });
            if (variant.match === "exact") {
                exactByText.set(variant.text, entry);
                return;
            }
            const first = tokens[0] ?? "";
            const bucket = containsByFirstToken.get(first);
            if (bucket === undefined) {
                containsByFirstToken.set(first, [entry]);
            }
            else {
                bucket.push(entry);
            }
        });
    });
    return { containsByFirstToken, exactByText };
}
const INDEXES = buildIndexes();
/** True when `entry.tokens` appears as a whole-token sequence in `list` starting at `start`. */
function followsAt(list, start, entry) {
    if (start + entry.tokens.length > list.length)
        return false;
    for (let i = 1; i < entry.tokens.length; i++) {
        if (list[start + i] !== entry.tokens[i])
            return false;
    }
    return true;
}
function isBetter(candidate, best) {
    if (best === null)
        return true;
    if (candidate.length !== best.length)
        return candidate.length > best.length;
    if (candidate.serviceIndex !== best.serviceIndex) {
        return candidate.serviceIndex < best.serviceIndex;
    }
    return candidate.variantIndex < best.variantIndex;
}
/**
 * Finds the Known service for a description. `context` and `cleaned` are folded token lists.
 * Contains variants match in either list; exact variants match the whole cleaned text.
 * The longest variant text wins, then the lowest service index, then the lowest variant index.
 */
export function matchKnownService(context, cleaned) {
    let best = null;
    for (const list of [context, cleaned]) {
        for (let position = 0; position < list.length; position++) {
            const bucket = INDEXES.containsByFirstToken.get(list[position] ?? "");
            if (bucket === undefined)
                continue;
            for (const entry of bucket) {
                if (followsAt(list, position, entry) && isBetter(entry, best))
                    best = entry;
            }
        }
    }
    const exact = INDEXES.exactByText.get(cleaned.join(" "));
    if (exact !== undefined && isBetter(exact, best))
        best = exact;
    return best === null ? null : (KNOWN_SERVICES[best.serviceIndex] ?? null);
}
