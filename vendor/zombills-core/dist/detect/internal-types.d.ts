import type { MerchantSource } from "../normalize/types.js";
import type { Cadence, Confidence, TransactionRole } from "./types.js";
/** A parsed calendar date. `day` is the Day number (days since 1970-01-01, may be negative). */
export interface CivilDate {
    y: number;
    m: number;
    d: number;
    day: number;
    iso: string;
}
/** A valid input element, with its fields read once (Req 1.13). */
export interface Entry {
    /** Input position */
    index: number;
    date: CivilDate;
    description: string;
    amountCents: number;
    currency: string;
    merchant: {
        key: string;
        displayName: string;
        source: MerchantSource;
        serviceId: string | null;
        processor: string | null;
    };
    /** Position in Content order among all valid entries; the only order used after step 1 */
    rank: number;
}
/** Group: same merchant.key and currency. Holds only live charges (not fully refunded). */
export interface Group {
    key: string;
    currency: string;
    source: MerchantSource;
    /** Content order */
    charges: Entry[];
    /** Content order, for freeTrialDate */
    zeroRows: Entry[];
    /** Credits with role "money-in", for partialRefunds */
    moneyIn: Entry[];
    /** Ascending by lowest amount */
    bands: Band[];
}
export interface Band {
    id: number;
    low: number;
    high: number;
    /** Content order */
    charges: Entry[];
}
export type StepKind = "on-schedule" | "late";
/** The interval into a charge of a chain. */
export interface Interval {
    k: 1 | 2;
    kind: StepKind;
    deviation: number;
}
export interface Segment {
    bandId: number;
    /** null for a one-charge Segment (Req 3.10 step 4) */
    cadence: Cadence | null;
    /** Ascending date, distinct dates */
    charges: Entry[];
    /** intervals[i] leads into charges[i + 1] */
    intervals: Interval[];
}
export interface Series {
    group: Group;
    cadence: Cadence;
    /** Ascending date */
    regular: Entry[];
    /** Between consecutive regular charges, including join gaps */
    intervals: Interval[];
    /** Bands of its Segments, for the density rule */
    bandIds: number[];
    intro: Entry | null;
    cadenceAssumed: boolean;
    confidence: Confidence;
}
/** Per-call counter for Req 11.14. Absent in production calls. */
export interface ComparisonCounter {
    comparisons: number;
}
/** The role, owning Subscription id and reason recorded for one input element. */
export interface Assigned {
    role: TransactionRole;
    subscriptionId: string | null;
    reason: string | null;
}
