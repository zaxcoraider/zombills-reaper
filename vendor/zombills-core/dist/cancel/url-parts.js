/** null when the WHATWG parser rejects text or text is not a string. */
export function parseUrl(text) {
    if (typeof text !== "string")
        return null;
    try {
        return new URL(text);
    }
    catch {
        return null;
    }
}
