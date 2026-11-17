import { parseUrl } from "./url-parts.js";
/** Glossary "Tracking parameter", lower case. The `utm_` prefix is handled by `isTracking`. */
export const TRACKING_PARAMS = new Set([
    "gclid",
    "gbraid",
    "wbraid",
    "dclid",
    "fbclid",
    "msclkid",
    "yclid",
    "igshid",
    "twclid",
    "ttclid",
    "li_fat_id",
    "mc_cid",
    "mc_eid",
    "_ga",
    "_gl",
    "_hsenc",
    "_hsmi",
    "ref",
    "ref_",
    "referrer",
    "source",
    "src",
    "campaign",
    "cmp",
    "cid",
    "trk",
    "affiliate",
    "aff_id",
    "partner",
    "promo",
]);
/** The Req 6.3 deny list: public suffixes and shared hosts that no provider owns. */
export const DENIED_DOMAINS = new Set([
    "co.uk",
    "com.au",
    "github.io",
    "netlify.app",
    "vercel.app",
    "pages.dev",
    "web.app",
    "firebaseapp.com",
    "herokuapp.com",
    "blogspot.com",
    "bit.ly",
    "t.co",
    "goo.gl",
    "tinyurl.com",
    "lnkd.in",
]);
/** Glossary "is on": host === domain or host ends with "." + domain. */
export function isOnDomain(host, domain) {
    return host === domain || host.endsWith("." + domain);
}
const DOMAIN_FORM = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;
function isIpHost(host) {
    return host.startsWith("[") || /^\d+\.\d+\.\d+\.\d+$/.test(host);
}
function isTracking(name) {
    return name.startsWith("utm_") || TRACKING_PARAMS.has(name);
}
/** The first problem with one Provider domain, or null when it is well formed. */
function domainProblem(value, earlier) {
    if (typeof value !== "string")
        return "is not a string";
    if (!DOMAIN_FORM.test(value))
        return "is not a lower-case host name of 2 or more labels: " + value;
    if (value.split(".").some((label) => label === ""))
        return "has an empty label: " + value;
    if (value.startsWith("www."))
        return "starts with www.: " + value;
    if (DENIED_DOMAINS.has(value))
        return "is on the deny list: " + value;
    if (earlier.includes(value))
        return "appears twice: " + value;
    return null;
}
/**
 * Checks a `providerDomains` value. `valid` holds the elements that passed `domain-form`, which
 * are the domains the URL checks compare hosts with. A value that is not a non-empty array is a
 * `field-type` issue, and `valid` is then empty.
 */
export function checkDomains(value, field) {
    const issues = [];
    const valid = [];
    if (!Array.isArray(value) || value.length === 0) {
        issues.push({ field, rule: "field-type", message: field + " is not a non-empty array" });
        return { issues, valid };
    }
    const seen = [];
    value.forEach((item, i) => {
        const problem = domainProblem(item, seen);
        if (typeof item === "string")
            seen.push(item);
        if (problem === null) {
            valid.push(item);
        }
        else {
            issues.push({
                field: field + "[" + String(i) + "]",
                rule: "domain-form",
                message: field + "[" + String(i) + "] " + problem,
            });
        }
    });
    return { issues, valid };
}
function formProblem(text, u) {
    if (u.username !== "" || u.password !== "")
        return "has a user name or password";
    if (u.port !== "")
        return "has an explicit port";
    if (isIpHost(u.hostname))
        return "uses an IP address";
    if (u.hostname === "localhost" || !u.hostname.includes("."))
        return "has a single-label host";
    if (u.href !== text)
        return "is not in canonical form (" + u.href + ")";
    return undefined;
}
/**
 * Checks one URL field against the valid Provider domains of its record. Returns at most one
 * issue per rule. An unparseable URL gives only `url-form`. A fragment is not read.
 */
export function checkUrl(text, domains, field) {
    const u = parseUrl(text);
    if (u === null || typeof text !== "string") {
        return [
            { field, rule: "url-form", message: field + " is not a URL the WHATWG parser accepts" },
        ];
    }
    const issues = [];
    let form = formProblem(text, u);
    if (u.protocol !== "https:") {
        issues.push({ field, rule: "https-only", message: field + " does not use https: " + text });
    }
    if (!domains.some((d) => isOnDomain(u.hostname, d))) {
        issues.push({
            field,
            rule: "provider-domain",
            message: field + " host " + u.hostname + " is not on the Provider domain list",
        });
    }
    for (const part of u.search.slice(1).split("&")) {
        if (part === "")
            continue;
        const eq = part.indexOf("=");
        const rawName = eq === -1 ? part : part.slice(0, eq);
        let name;
        try {
            name = decodeURIComponent(rawName);
        }
        catch {
            form ??= "has a query name that does not decode";
            continue;
        }
        if (isTracking(name.toLowerCase())) {
            issues.push({
                field,
                rule: "tracking-param",
                message: field + " has the tracking parameter " + name,
            });
            break;
        }
    }
    if (form !== undefined) {
        issues.push({ field, rule: "url-form", message: field + " " + form });
    }
    return issues;
}
