// Content order: the total order that ends every tie-break of the detector.
// See .kiro/specs/subscription-detector/design.md ("Content order").
// Strings are compared by code units with `<` / `>`, never locale-aware comparison.
function compareStrings(a, b) {
    return a < b ? -1 : a > b ? 1 : 0;
}
/** `null` sorts before any string. */
function compareNullable(a, b) {
    if (a === null)
        return b === null ? 0 : -1;
    if (b === null)
        return 1;
    return compareStrings(a, b);
}
/**
 * Compares by date, amount, description, displayName, source, serviceId, processor,
 * currency and key, and only then by input position.
 */
export function compareContent(a, b) {
    if (a.date.day !== b.date.day)
        return a.date.day < b.date.day ? -1 : 1;
    if (a.amountCents !== b.amountCents)
        return a.amountCents < b.amountCents ? -1 : 1;
    return (compareStrings(a.description, b.description) ||
        compareStrings(a.merchant.displayName, b.merchant.displayName) ||
        compareStrings(a.merchant.source, b.merchant.source) ||
        compareNullable(a.merchant.serviceId, b.merchant.serviceId) ||
        compareNullable(a.merchant.processor, b.merchant.processor) ||
        compareStrings(a.currency, b.currency) ||
        compareStrings(a.merchant.key, b.merchant.key) ||
        (a.index < b.index ? -1 : a.index > b.index ? 1 : 0));
}
