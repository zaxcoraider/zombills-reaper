import type { Transaction } from "../parse/types.js";
export type MerchantSource = "known" | "generic" | "unidentified";
export type ProcessorId = "paypal" | "square" | "shopify" | "amazon-marketplace" | "google" | "apple" | "sumup" | "zettle" | "toast";
export type ServiceCategory = "video-streaming" | "music-audio" | "software" | "cloud-storage" | "news-reading" | "fitness-wellness" | "food-delivery" | "gaming";
export interface ServiceVariant {
    /** Folded, single-space-separated tokens, e.g. "disney+", "microsoft 365" */
    readonly text: string;
    readonly match: "contains" | "exact";
}
export interface KnownService {
    /** Stable kebab-case id shared with the cancel helper, e.g. "disney-plus" */
    readonly serviceId: string;
    readonly displayName: string;
    readonly category: ServiceCategory;
    readonly variants: readonly ServiceVariant[];
}
export interface MerchantIdentity {
    /** Grouping key: serviceId | "merchant:<slug>" | "unidentified:<processor|none>:<residue>" */
    key: string;
    displayName: string;
    source: MerchantSource;
    /** Non-null exactly when source is "known" */
    serviceId: string | null;
    processor: ProcessorId | null;
}
export interface NormalizedTransaction extends Transaction {
    merchant: MerchantIdentity;
}
