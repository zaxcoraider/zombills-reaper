import type { MerchantSource, NormalizedTransaction } from "../normalize/types.js";
export type Cadence = "weekly" | "monthly" | "yearly";
export type SubscriptionStatus = "active" | "ended";
export type Confidence = "high" | "medium" | "low";
export interface DetectOptions {
    /** ISO yyyy-mm-dd; ignored when absent or not a real date (Req 7.1–7.2) */
    asOf?: string;
}
export interface PricePoint {
    date: string;
    amountCents: number;
}
export interface StatementInfo {
    firstDate: string | null;
    lastDate: string | null;
    asOf: string | null;
    asOfSource: "option" | "statement" | null;
    /** Distinct currencies of all valid transactions, code-unit ascending */
    currencies: string[];
}
export interface DetectionEvidence {
    regularChargeCount: number;
    firstChargeDate: string;
    lastChargeDate: string;
    nextExpectedDate: string;
    missedPeriods: number;
    lateChargeDates: string[];
    cadenceAssumed: boolean;
    introCharge: PricePoint | null;
    freeTrialDate: string | null;
    startedInStatement: boolean;
    partialRefunds: PricePoint[];
}
export interface Subscription {
    id: string;
    merchant: string;
    merchantKey: string;
    serviceId: string | null;
    source: MerchantSource;
    currency: string;
    cadence: Cadence;
    /** Series charges, oldest first; copies of the 4 + 5 fields only (Req 1.12) */
    charges: NormalizedTransaction[];
    currentAmountCents: number;
    yearlyCostCents: number;
    /** Always [] from the Detector; set by the classifier */
    labels: ("zombie" | "possessed" | "trial-trap")[];
    priceHistory: PricePoint[];
    status: SubscriptionStatus;
    confidence: Confidence;
    evidence: DetectionEvidence;
    /** Never set by the Detector (cancel-helper spec) */
    cancel?: {
        url?: string;
        email?: string;
        notes?: string;
    };
}
export type TransactionRole = "subscription-charge" | "refunded-charge" | "refund" | "money-in" | "zero-amount" | "not-recurring" | "invalid";
export interface TransactionUsage {
    index: number;
    role: TransactionRole;
    subscriptionId: string | null;
    reason: string | null;
}
export interface DetectionResult {
    subscriptions: Subscription[];
    statement: StatementInfo;
    usage: TransactionUsage[];
}
