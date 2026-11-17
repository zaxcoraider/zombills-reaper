import type { CivilDate } from "./internal-types.js";
import type { Cadence } from "./types.js";
/** Days a charge may drift from its expected date (Req 4.3). */
export declare const TOLERANCE_DAYS: Readonly<Record<Cadence, number>>;
/** Largest `k` (periods skipped plus one) a step may span (Req 4.3). */
export declare const MAX_K: Readonly<Record<Cadence, number>>;
/** Shortest gap for which the anchor date counts (Req 4.3). */
export declare const MIN_GAP_DAYS: Readonly<Record<Cadence, number>>;
/** Start of the successor window, in days after the keyed charge. */
export declare const WINDOW_FROM_DAYS: Readonly<Record<Cadence, number>>;
/** End of the successor window, in days after the keyed charge. */
export declare const WINDOW_TO_DAYS: Readonly<Record<Cadence, number>>;
/** `WINDOW_DAYS` (from / to) as one table. */
export declare const WINDOW_DAYS: Readonly<Record<"from" | "to", Readonly<Record<Cadence, number>>>>;
/** Earliest lateness of a late charge; weekly and yearly have none (Req 4.6). */
export declare const LATE_MIN_DAYS: Readonly<Record<Cadence, number>>;
/** Latest lateness of a late charge; weekly and yearly have none (Req 4.6). */
export declare const LATE_MAX_DAYS: Readonly<Record<Cadence, number>>;
/** Days past the next expected date before a Subscription counts as ended (Req 7.5). */
export declare const ENDED_GRACE_DAYS: Readonly<Record<Cadence, number>>;
/** The date `k` periods after `date` (any integer `k`). */
export declare function addPeriods(date: CivilDate, cadence: Cadence, k: number): CivilDate;
