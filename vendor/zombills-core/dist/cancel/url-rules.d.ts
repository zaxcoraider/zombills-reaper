import type { CancelDataRule } from "./types.js";
/** One broken rule on one field; the validator adds the service id and sorts. */
export interface FieldIssue {
    field: string;
    rule: CancelDataRule;
    message: string;
}
/** Glossary "Tracking parameter", lower case. The `utm_` prefix is handled by `isTracking`. */
export declare const TRACKING_PARAMS: ReadonlySet<string>;
/** The Req 6.3 deny list: public suffixes and shared hosts that no provider owns. */
export declare const DENIED_DOMAINS: ReadonlySet<string>;
/** Glossary "is on": host === domain or host ends with "." + domain. */
export declare function isOnDomain(host: string, domain: string): boolean;
/**
 * Checks a `providerDomains` value. `valid` holds the elements that passed `domain-form`, which
 * are the domains the URL checks compare hosts with. A value that is not a non-empty array is a
 * `field-type` issue, and `valid` is then empty.
 */
export declare function checkDomains(value: unknown, field: string): {
    issues: FieldIssue[];
    valid: string[];
};
/**
 * Checks one URL field against the valid Provider domains of its record. Returns at most one
 * issue per rule. An unparseable URL gives only `url-form`. A fragment is not read.
 */
export declare function checkUrl(text: unknown, domains: readonly string[], field: string): FieldIssue[];
