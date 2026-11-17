// Step 1 validation: turns one input element into an Entry (without `rank`) or a reason.
// See .kiro/specs/subscription-detector/design.md ("Validation") and Req 1.10, 1.12, 1.13, 2.1.
//
// Each field is read exactly once. Only typeof, Object.getPrototypeOf, Array.isArray,
// Number.isSafeInteger, string comparison and a regex test on a verified string are used, so plain
// data of any shape cannot make this function throw.
import { parseIsoDate } from "./dates.js";
const CURRENCY_PATTERN = /^[A-Z]{3}$/;
function isPlainObject(value) {
    if (typeof value !== "object" || value === null || Array.isArray(value))
        return false;
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
}
function fail(reason) {
    return { ok: false, reason };
}
/** True for a string that contains `:`; only called on values already known to be strings. */
function hasColon(key) {
    return key.indexOf(":") !== -1;
}
export function validateElement(value, index) {
    // 1. plain object
    if (!isPlainObject(value))
        return fail("element: not a plain object");
    // Read every field once.
    const rawDate = value.date;
    const rawDescription = value.description;
    const rawAmount = value.amountCents;
    const rawCurrency = value.currency;
    const rawMerchant = value.merchant;
    // 2. date
    const date = parseIsoDate(rawDate);
    if (date === null)
        return fail("date: not a real calendar date");
    // 3. description
    if (typeof rawDescription !== "string")
        return fail("description: not a string");
    // 4. amountCents
    if (typeof rawAmount !== "number" || !Number.isSafeInteger(rawAmount)) {
        return fail("amountCents: not a safe integer");
    }
    // 5. currency
    if (typeof rawCurrency !== "string" || !CURRENCY_PATTERN.test(rawCurrency)) {
        return fail("currency: not 3 upper-case ASCII letters");
    }
    // 6. merchant shape
    if (!isPlainObject(rawMerchant))
        return fail("merchant: not a plain object");
    const key = rawMerchant.key;
    const displayName = rawMerchant.displayName;
    const source = rawMerchant.source;
    const serviceId = rawMerchant.serviceId;
    const processor = rawMerchant.processor;
    if (typeof key !== "string" || key === "")
        return fail("merchant.key: not a non-empty string");
    if (typeof displayName !== "string" || displayName === "") {
        return fail("merchant.displayName: not a non-empty string");
    }
    if (source !== "known" && source !== "generic" && source !== "unidentified") {
        return fail("merchant.source: not one of known, generic, unidentified");
    }
    if (serviceId !== null && typeof serviceId !== "string") {
        return fail("merchant.serviceId: not a string or null");
    }
    if (processor !== null && typeof processor !== "string") {
        return fail("merchant.processor: not a string or null");
    }
    // 7. key and source agree
    if (source === "known") {
        if (hasColon(key))
            return fail("merchant.key: a known key must not contain ':'");
        if (serviceId !== key)
            return fail("merchant.serviceId: a known service must equal merchant.key");
    }
    else if (source === "generic") {
        if (!key.startsWith("merchant:"))
            return fail("merchant.key: a generic key must start with 'merchant:'");
        if (serviceId !== null)
            return fail("merchant.serviceId: a generic merchant must have a null serviceId");
    }
    else {
        if (!key.startsWith("unidentified:")) {
            return fail("merchant.key: an unidentified key must start with 'unidentified:'");
        }
        if (serviceId !== null) {
            return fail("merchant.serviceId: an unidentified merchant must have a null serviceId");
        }
    }
    return {
        ok: true,
        entry: {
            index,
            date,
            description: rawDescription,
            amountCents: rawAmount,
            currency: rawCurrency,
            merchant: { key, displayName, source, serviceId, processor },
        },
    };
}
