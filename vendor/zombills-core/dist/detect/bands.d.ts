import type { Band, Entry, Group } from "./internal-types.js";
/**
 * Builds the Groups, keyed by merchant key and currency, in Content order of the first entry each
 * Group holds. A Group holds its live Charges, its Zero-amount rows and its `"money-in"` Credits,
 * each in Content order. Fully refunded Charges and the Credits that refunded them are left out
 * (a Group that would hold only such entries is not created). `sorted` is in Content order.
 * Each Group's `bands` come from `splitIntoBands` over its Charges.
 */
export declare function groupCharges(sorted: readonly Entry[], refunded: ReadonlySet<Entry>, refunds: ReadonlySet<Entry>): Group[];
/**
 * Splits Charges into Amount bands (Req 3.2). The smallest amount `m` not yet in a band starts a
 * band, and every larger amount `a` with `(a − m) × 20 ≤ m` joins it. The test is written as
 * `a − m ≤ (m − m % 20) / 20`, which is equivalent for integers and never leaves the safe range.
 * Bands get ids 0, 1, … in ascending `low`; each holds its Charges in the order given.
 */
export declare function splitIntoBands(charges: readonly Entry[]): Band[];
