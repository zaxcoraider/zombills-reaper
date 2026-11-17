import type { PricePoint, Subscription } from "../detect/types.js";
import type { PriceRise } from "./types.js";
/**
 * The price rise of `subscription` measured from its first paid price, or null when it is not
 * possessed. `paid` is the Paid price history. The caller has already checked that the
 * subscription is Eligible.
 */
export declare function findPriceRise(subscription: Subscription, paid: readonly PricePoint[]): PriceRise | null;
