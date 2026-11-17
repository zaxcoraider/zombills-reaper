import type { CivilDate } from "./internal-types.js";
import type { Cadence } from "./types.js";
/**
 * Expected Day numbers of the charge `k` periods after `prev`. The entries from the previous
 * charge come first (for monthly with `prev` on the last day of its month, the month-end
 * alternative is the second entry), then the entries from the anchor, which is the first
 * Regular charge of the chain. `anchorIndex` is the period index of `prev` (Req 4.2, 4.3).
 */
export declare function expectedDays(prev: CivilDate, anchor: CivilDate, anchorIndex: number, cadence: Cadence, k: 1 | 2): number[];
/**
 * Smallest distance in days between `candidate` and an expected date, or between `prev` and the
 * date `k` periods before `candidate` (backward check). Anchor dates count only when the
 * candidate is at least `MIN_GAP_DAYS` after `prev` (Req 4.3).
 */
export declare function deviation(prev: CivilDate, candidate: CivilDate, expected: readonly number[], cadence: Cadence, k: 1 | 2): number;
/** How a candidate relates to the schedule after `prev`; `null` means it does not fit. */
export interface StepClassification {
    /** Deviation when on schedule with `k = 1` */
    k1: number | null;
    /** Deviation when on schedule with `k = 2` (never for yearly) */
    k2: number | null;
    /** Days late after `addMonths(prev, 1)` (monthly only, 4 to 10; Req 4.6) */
    late: number | null;
}
export declare function classifyStep(prev: CivilDate, candidate: CivilDate, anchor: CivilDate, anchorIndex: number, cadence: Cadence): StepClassification;
