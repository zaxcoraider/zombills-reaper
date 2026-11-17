import type { PricePoint, Subscription } from "../detect/types.js";
export type UsageAnswer = "still-using" | "not-using";
/** One label; the element type of Subscription["labels"]. Internal alias. */
export type SubscriptionLabel = Subscription["labels"][number];
export interface PriceRise {
    /** First entry of the Paid price history (a new object) */
    firstSeen: PricePoint;
    /** = Subscription.currentAmountCents */
    currentAmountCents: number;
    /** Latest consecutive Paid price history step that is a Band rise, or null */
    latestRise: {
        fromAmountCents: number;
        toAmountCents: number;
        /** Date of the first charge at toAmountCents */
        date: string;
    } | null;
    /** currentAmountCents − firstSeen.amountCents; always > 0 */
    increasePerChargeCents: number;
    /** increasePerChargeCents × Cadence factor */
    increasePerYearCents: number;
}
export interface TrialDetails {
    /** evidence.freeTrialDate when it counts as a trial signal, else null */
    freeTrialDate: string | null;
    /** evidence.introCharge or the Inferred intro charge (a new object), else null */
    introCharge: PricePoint | null;
    /** First charge at the full price (a new object) */
    firstFullCharge: PricePoint;
}
export type ClassifiedSubscription = Subscription & {
    /** Non-null exactly when labels contains "possessed" */
    priceRise: PriceRise | null;
    /** Non-null exactly when labels contains "trial-trap" */
    trial: TrialDetails | null;
};
