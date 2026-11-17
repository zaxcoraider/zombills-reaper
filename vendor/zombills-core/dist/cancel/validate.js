import { isCheckedDate } from "./date-rules.js";
import { checkDomains, checkUrl } from "./url-rules.js";
const LIST_RANK = {
    entries: 0,
    emailOnly: 1,
    appStoreLinks: 2,
    known: 3,
};
/** Field ranks of design "Output order"; the first five are whole-list and whole-link names. */
const FIELD_RANK = {
    entries: -1,
    emailOnly: -1,
    appStoreLinks: -1,
    apple: -1,
    google: -1,
    entry: 0,
    serviceId: 1,
    label: 2,
    providerDomains: 3,
    url: 4,
    kind: 5,
    regionalUrls: 6,
    steps: 7,
    appStoreMayApply: 8,
    reason: 9,
    lastChecked: 10,
};
const RULE_ORDER = [
    "missing-service",
    "unknown-service",
    "duplicate-id",
    "listed-twice",
    "unsorted",
    "https-only",
    "url-form",
    "provider-domain",
    "domain-form",
    "tracking-param",
    "steps-count",
    "step-text",
    "region-key",
    "region-duplicate",
    "date-form",
    "field-type",
    "unverified",
];
const REGIONS = ["US", "UK", "EU"];
const KINDS = ["cancel", "manage", "help"];
function isObject(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
/** An own property of a record, or undefined when it is absent. */
function read(record, key) {
    return Object.hasOwn(record, key) ? record[key] : undefined;
}
function push(sink, list, index, serviceId, issue) {
    sink.push({
        list: LIST_RANK[list],
        index,
        issue: { serviceId, field: issue.field, rule: issue.rule, message: issue.message },
    });
}
function issue(field, rule, message) {
    return { field, rule, message };
}
/** The first failed check of one step, or null when the step is fine (Req 6.5). */
function stepProblem(step) {
    if (typeof step !== "string")
        return "is not a string";
    const length = step.trim().length;
    if (length < 3 || length > 120)
        return "is not 3 to 120 characters after trimming";
    if (step !== step.trim())
        return "has space at its start or end";
    if (/[\n\r\u2028\u2029]/.test(step))
        return "has a line break";
    if (step.includes("<") || step.includes(">"))
        return "has a < or > character";
    if (step.includes("http://") || step.includes("https://") || step.includes("www.")) {
        return "has a URL";
    }
    if (step.includes("!"))
        return "has an exclamation mark";
    if (!step.endsWith("."))
        return "does not end with a full stop";
    return null;
}
function checkSteps(value) {
    const out = [];
    if (!Array.isArray(value) || value.length < 1 || value.length > 3) {
        out.push(issue("steps", "steps-count", "steps is not an array of 1 to 3 steps"));
    }
    if (Array.isArray(value)) {
        value.forEach((step, i) => {
            const field = "steps[" + String(i) + "]";
            const problem = stepProblem(step);
            if (problem !== null)
                out.push(issue(field, "step-text", field + " " + problem));
        });
    }
    return out;
}
function checkRegional(value, url, domains) {
    if (!isObject(value)) {
        return [issue("regionalUrls", "region-key", "regionalUrls is not an object")];
    }
    const out = [];
    for (const key of Object.keys(value)) {
        if (!REGIONS.includes(key)) {
            const field = "regionalUrls." + key;
            out.push(issue(field, "region-key", field + " is not a Region key (US, UK or EU)"));
        }
    }
    const earlier = [];
    for (const region of REGIONS) {
        if (!Object.hasOwn(value, region))
            continue;
        const field = "regionalUrls." + region;
        const regional = value[region];
        out.push(...checkUrl(regional, domains, field));
        if (typeof regional !== "string")
            continue;
        if (regional === url) {
            out.push(issue(field, "region-duplicate", field + " equals url: " + regional));
        }
        else if (earlier.includes(regional)) {
            out.push(issue(field, "region-duplicate", field + " equals another regional URL"));
        }
        earlier.push(regional);
    }
    return out;
}
function checkChecked(value) {
    if (value === null)
        return [];
    if (typeof value === "string" && isCheckedDate(value))
        return [];
    return [issue("lastChecked", "date-form", "lastChecked is not null or a real yyyy-mm-dd date")];
}
function checkEntry(sink, value, index) {
    if (!isObject(value)) {
        push(sink, "entries", index, null, issue("entry", "field-type", "entry is not an object"));
        return;
    }
    const id = read(value, "serviceId");
    const sid = typeof id === "string" ? id : null;
    const all = [];
    if (sid === null)
        all.push(issue("serviceId", "unknown-service", "serviceId is not a string"));
    const domains = checkDomains(read(value, "providerDomains"), "providerDomains");
    all.push(...domains.issues);
    const url = read(value, "url");
    all.push(...checkUrl(url, domains.valid, "url"));
    if (!KINDS.includes(read(value, "kind"))) {
        all.push(issue("kind", "field-type", "kind is not cancel, manage or help"));
    }
    all.push(...checkRegional(read(value, "regionalUrls"), url, domains.valid));
    all.push(...checkSteps(read(value, "steps")));
    if (typeof read(value, "appStoreMayApply") !== "boolean") {
        all.push(issue("appStoreMayApply", "field-type", "appStoreMayApply is not a boolean"));
    }
    all.push(...checkChecked(read(value, "lastChecked")));
    for (const found of all)
        push(sink, "entries", index, sid, found);
}
function checkEmailOnly(sink, value, index) {
    if (!isObject(value)) {
        push(sink, "emailOnly", index, null, issue("entry", "field-type", "entry is not an object"));
        return;
    }
    const id = read(value, "serviceId");
    const sid = typeof id === "string" ? id : null;
    const all = [];
    if (sid === null)
        all.push(issue("serviceId", "unknown-service", "serviceId is not a string"));
    const reason = read(value, "reason");
    if (typeof reason !== "string" || reason.trim() === "") {
        all.push(issue("reason", "field-type", "reason is not a non-empty string"));
    }
    all.push(...checkChecked(read(value, "lastChecked")));
    for (const found of all)
        push(sink, "emailOnly", index, sid, found);
}
const LINK_NAMES = ["apple", "google"];
function checkAppStoreLinks(sink, links) {
    if (!isObject(links)) {
        push(sink, "appStoreLinks", -1, null, issue("appStoreLinks", "field-type", "appStoreLinks is not an object"));
        return;
    }
    LINK_NAMES.forEach((name, index) => {
        const link = read(links, name);
        if (!isObject(link)) {
            push(sink, "appStoreLinks", index, null, issue(name, "field-type", name + " is not an object"));
            return;
        }
        const label = read(link, "label");
        if (typeof label !== "string" || label.trim() === "") {
            push(sink, "appStoreLinks", index, null, issue("label", "field-type", "label is not a non-empty string"));
        }
        const domains = checkDomains(read(link, "providerDomains"), "providerDomains");
        const found = [...domains.issues, ...checkUrl(read(link, "url"), domains.valid, "url")];
        for (const f of found)
            push(sink, "appStoreLinks", index, null, f);
    });
}
function idOf(record) {
    if (!isObject(record))
        return null;
    const id = read(record, "serviceId");
    return typeof id === "string" ? id : null;
}
function checkCoverage(sink, entries, emailOnly, knownIds) {
    const known = new Set(knownIds);
    const entryIds = new Set();
    for (const e of entries) {
        const id = idOf(e);
        if (id !== null)
            entryIds.add(id);
    }
    const lists = [
        ["entries", entries],
        ["emailOnly", emailOnly],
    ];
    for (const [name, list] of lists) {
        const seen = new Set();
        list.forEach((record, i) => {
            const id = idOf(record);
            if (id === null)
                return;
            if (seen.has(id)) {
                push(sink, name, i, id, issue("serviceId", "duplicate-id", "serviceId appears twice: " + id));
            }
            seen.add(id);
            if (name === "emailOnly" && entryIds.has(id)) {
                push(sink, name, i, id, issue("serviceId", "listed-twice", "serviceId is also a Cancel entry: " + id));
            }
            if (!known.has(id)) {
                push(sink, name, i, id, issue("serviceId", "unknown-service", "serviceId is not a Known service id: " + id));
            }
            const before = i > 0 ? idOf(list[i - 1]) : null;
            if (before !== null && before > id) {
                push(sink, name, i, id, issue("serviceId", "unsorted", "serviceId " + id + " is out of order after " + before));
            }
        });
    }
    knownIds.forEach((id, i) => {
        if (typeof id !== "string")
            return;
        if (entryIds.has(id) || emailOnly.some((o) => idOf(o) === id))
            return;
        push(sink, "known", i, id, issue("serviceId", "missing-service", "Known service id is in no list: " + id));
    });
}
function checkUnverified(sink, name, list) {
    list.forEach((record, i) => {
        if (!isObject(record) || read(record, "lastChecked") !== null)
            return;
        if (!Object.hasOwn(record, "lastChecked"))
            return;
        push(sink, name, i, idOf(record), issue("lastChecked", "unverified", "lastChecked is null: no person has opened the URLs"));
    });
}
/** Sub-field of design "Output order": [rank, text]. */
function subField(field) {
    const bracket = /\[(\d+)\]$/.exec(field);
    if (bracket !== null)
        return [Number(bracket[1]), ""];
    if (field.startsWith("regionalUrls.")) {
        const key = field.slice("regionalUrls.".length);
        const at = REGIONS.indexOf(key);
        return at === -1 ? [3, key] : [at, ""];
    }
    return [-1, ""];
}
function baseField(field) {
    const cut = field.search(/[[.]/);
    return cut === -1 ? field : field.slice(0, cut);
}
function compareText(a, b) {
    return a < b ? -1 : a > b ? 1 : 0;
}
function compare(a, b) {
    if (a.list !== b.list)
        return a.list - b.list;
    if (a.index !== b.index)
        return a.index - b.index;
    const fa = FIELD_RANK[baseField(a.issue.field)] ?? 99;
    const fb = FIELD_RANK[baseField(b.issue.field)] ?? 99;
    if (fa !== fb)
        return fa - fb;
    const sa = subField(a.issue.field);
    const sb = subField(b.issue.field);
    if (sa[0] !== sb[0])
        return sa[0] - sb[0];
    if (sa[1] !== sb[1])
        return compareText(sa[1], sb[1]);
    return RULE_ORDER.indexOf(a.issue.rule) - RULE_ORDER.indexOf(b.issue.rule);
}
/** Pure and total; [] when the data follows every rule of Req 6 (Req 5). */
export function validateCancelDatabase(entries, emailOnly, knownServiceIds, appStoreLinks, options) {
    const sink = [];
    const input = entries;
    const emailInput = emailOnly;
    const knownInput = knownServiceIds;
    const optionsInput = options;
    let e = [];
    let o = [];
    if (Array.isArray(input))
        e = input;
    else
        push(sink, "entries", -1, null, issue("entries", "field-type", "entries is not an array"));
    if (Array.isArray(emailInput))
        o = emailInput;
    else
        push(sink, "emailOnly", -1, null, issue("emailOnly", "field-type", "emailOnly is not an array"));
    const k = Array.isArray(knownInput) ? knownInput : [];
    e.forEach((v, i) => checkEntry(sink, v, i));
    o.forEach((v, i) => checkEmailOnly(sink, v, i));
    checkAppStoreLinks(sink, appStoreLinks);
    checkCoverage(sink, e, o, k);
    if (isObject(optionsInput) && read(optionsInput, "requireVerified") === true) {
        checkUnverified(sink, "entries", e);
        checkUnverified(sink, "emailOnly", o);
    }
    return sink.sort(compare).map((t) => t.issue);
}
