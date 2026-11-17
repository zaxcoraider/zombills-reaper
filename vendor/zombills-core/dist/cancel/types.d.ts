import type { Cadence } from "../detect/types.js";
export type CancelRegion = "US" | "UK" | "EU";
export type CancelLinkKind = "cancel" | "manage" | "help";
export interface CancelEntry {
    readonly serviceId: string;
    readonly providerDomains: readonly string[];
    readonly url: string;
    readonly kind: CancelLinkKind;
    readonly regionalUrls: Readonly<Partial<Record<CancelRegion, string>>>;
    readonly steps: readonly string[];
    readonly appStoreMayApply: boolean;
    /** yyyy-mm-dd, the day a person opened the URLs; null = unverified (Req 6.12) */
    readonly lastChecked: string | null;
}
export interface EmailOnlyService {
    readonly serviceId: string;
    /** Why there is no link, for reviewers; never shown */
    readonly reason: string;
    readonly lastChecked: string | null;
}
/** Internal names for the shape of APP_STORE_LINKS. */
export interface AppStoreLink {
    readonly label: string;
    readonly url: string;
    readonly providerDomains: readonly string[];
}
export interface AppStoreLinks {
    readonly apple: AppStoreLink;
    readonly google: AppStoreLink;
}
export type CancelHelp = {
    readonly kind: "link";
    readonly serviceId: string;
    readonly url: string;
    readonly linkKind: CancelLinkKind;
    /** Host name of url, lower case, without a leading "www." */
    readonly host: string;
    readonly steps: readonly string[];
    readonly appStoreMayApply: boolean;
    readonly lastChecked: string | null;
} | {
    readonly kind: "email-only";
    readonly serviceId: string | null;
};
export interface EmailInput {
    serviceName: string;
    amountText: string;
    currency: string;
    cadence: Cadence;
    cadenceAssumed: boolean;
}
export interface CancellationEmail {
    subject: string;
    body: string;
}
/** Exactly the rule names of Req 6, in this order (the validator's rule rank). */
export type CancelDataRule = "missing-service" | "unknown-service" | "duplicate-id" | "listed-twice" | "unsorted" | "https-only" | "url-form" | "provider-domain" | "domain-form" | "tracking-param" | "steps-count" | "step-text" | "region-key" | "region-duplicate" | "date-form" | "field-type" | "unverified";
export interface ValidateCancelOptions {
    requireVerified?: boolean;
}
export interface CancelDataIssue {
    /** null for an App-store link or a whole-list issue */
    serviceId: string | null;
    /** e.g. "url", "regionalUrls.UK", "steps[2]", "providerDomains[0]", "lastChecked" */
    field: string;
    rule: CancelDataRule;
    /** Plain sentence naming the value */
    message: string;
}
