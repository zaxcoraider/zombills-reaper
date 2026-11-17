import type { Series } from "./internal-types.js";
import type { Subscription } from "./types.js";
type Unidentified = Omit<Subscription, "id">;
/**
 * Gives each Subscription its id. `series[i]` is the Series `subs[i]` was built from.
 * Returns new objects in the order of `subs`; the inputs are not changed.
 */
export declare function assignIds(subs: readonly Unidentified[], series: readonly Series[]): Subscription[];
/** `yearlyCostCents` descending, then `id` by code units (Req 1.11). Returns a new array. */
export declare function sortSubscriptions(subs: Subscription[]): Subscription[];
export {};
