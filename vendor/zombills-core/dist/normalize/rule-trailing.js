// Step 8: the trailing loop (design "Step 8", Req 3.9, 3.10). A cursor walks back from the end:
//   - a digits-only token is removed;
//   - a location code is removed, unless it is the only token left and no processor is recorded;
//   - anything else stops the loop.
// Location codes are only ever removed from the end, so `TANKSTELLE AM RING` keeps `AM`.
import { LOCATION_CODES } from "./noise-lists.js";
import { removeTrailing } from "./token-list.js";
const LOCATION_SET = new Set(LOCATION_CODES);
function isDigitsOnly(text) {
    if (text.length === 0)
        return false;
    for (let i = 0; i < text.length; i++) {
        const char = text.charAt(i);
        if (char < "0" || char > "9")
            return false;
    }
    return true;
}
export function removeTrailingCodes(list, ctx) {
    return removeTrailing(list, (current, end) => {
        const last = current.tokens[end - 1];
        if (isDigitsOnly(last.folded))
            return { length: 1, reason: "trailing" };
        if (!LOCATION_SET.has(last.folded))
            return null;
        if (end === 1 && ctx.processor === null)
            return null;
        return { length: 1, reason: "trailing" };
    }, ctx.log);
}
