import type { Series } from "./internal-types.js";
import type { Confidence } from "./types.js";
/**
 * The Req 5.1 table, with `n` the number of Regular charges. Returns the `confidence`, or `null`
 * when the Series does not meet the minimum for its source and cadence. Weekly Series of a
 * `"generic"` or `"unidentified"` source never meet it (Req 5.2).
 */
export declare function meetsMinimum(series: Series): Confidence | null;
/**
 * `m` of Req 5.6: for every Amount band of the Regular charges, the band's live charges dated
 * from the first to the last Regular charge inclusive. Fully refunded charges are not in any
 * band; the Introductory charge's band is counted only when a Regular charge lies in it.
 */
export declare function densityCount(series: Series): number;
/**
 * The `confidence` of an accepted Series, or `null` when it is rejected: it misses its minimum
 * (Req 5.1) or `m ≥ 2n − 1` (Req 5.6). A rejected Series is never split or re-chosen (Req 5.5).
 */
export declare function acceptSeries(series: Series): Confidence | null;
