import type { MerchantSource } from "../normalize/types.js";
import type { Band, ComparisonCounter, Entry, Interval, Segment } from "./internal-types.js";
import type { Cadence } from "./types.js";
/** A chain of charges grown from one start charge, with the interval into each charge after the first. */
export interface Chain {
    /** Ascending date, distinct dates */
    charges: Entry[];
    /** intervals[i] leads into charges[i + 1] */
    intervals: Interval[];
}
/**
 * Grows one chain from `start` over the unused charges of `band` (design "Growing one chain").
 * Preference: on schedule with `k = 1`, then late (monthly), then on schedule with `k = 2`; after
 * a late charge only the two continuations of Req 4.6. Each charge examined in a window adds one
 * to `counter.comparisons` when a counter is given. The result does not depend on the counter.
 */
export declare function growChain(band: Band, used: ReadonlySet<Entry>, start: Entry, cadence: Cadence, counter?: ComparisonCounter): Chain;
/**
 * The longest prefix of `chain` with 2 or more charges, at least one `k = 1` interval and no more
 * `k = 2` than `k = 1` intervals (Req 4.4); `null` when no prefix qualifies. A prefix may end on a
 * late charge.
 */
export declare function longestValidPrefix(chain: Chain): Chain | null;
/**
 * Covers `band` with chains of one cadence (design "Cover per cadence"). Starts are tried in
 * Content order; a start whose chain has no valid prefix stays unused and may still be reached by a
 * later chain. Returns the multi-charge Segments in sweep order, then one-charge Segments
 * (`cadence: null`) for every charge left over, in Content order.
 */
export declare function coverBand(band: Band, cadence: Cadence, counter?: ComparisonCounter): Segment[];
/**
 * The cover of `band` under the cadence that covers the most charges, ties going to the shorter
 * Period (design "Cadence per band", Req 4.7). Weekly is tried only for `"known"` merchants. When
 * no cadence covers a charge, the result is one-charge Segments only.
 */
export declare function chooseBandCover(band: Band, source: MerchantSource, counter?: ComparisonCounter): Segment[];
