import type { Entry, Group, Segment, Series } from "./internal-types.js";
/**
 * Joins the Segments of one Group (the chosen Segments of all its bands and their one-charge
 * leftovers) into Series (design "Joins across bands", Req 3.5, 3.6). Pieces are taken in Content
 * order of their first charge; each extends the Series built so far with the best candidate until
 * none is left, and the result is kept when it has 2 or more Regular charges. The returned Series
 * have no Introductory charge, `cadenceAssumed: false` and a placeholder `confidence: "low"` that
 * `acceptSeries` replaces. The input Segments are not changed.
 */
export declare function joinSegments(group: Group, segments: readonly Segment[]): Series[];
/**
 * Gives each Series of a `"known"` Group its Introductory charge, if any (design "Introductory
 * charges", Req 3.7–3.9). Series are taken in Content order of their first Regular charge `r`.
 * A candidate is a leftover that costs less than `r`, is dated before `r`, and has `r` on
 * schedule after it with `k = 1`. The latest candidate wins, then the lower amount, then Content
 * order. Each leftover is used at most once and each Series gets at most one. Sets `intro` on the
 * Series; adds no interval and does not change `regular`. `leftovers` is not changed.
 */
export declare function addIntroCharges(group: Group, series: Series[], leftovers: readonly Entry[]): void;
