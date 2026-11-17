import type { PricePoint, Subscription } from "../detect/types.js";
/**
 * The intro price the detector joined to the full price as a price change, or null.
 * Cheap field checks come first; the two charge counts are one pass over `charges`.
 */
export declare function findInferredIntro(subscription: Subscription): PricePoint | null;
/**
 * `priceHistory` without its introductory entry. A slice of `priceHistory`; entries are not copied.
 */
export declare function paidPriceHistory(subscription: Subscription, inferredIntro: PricePoint | null): readonly PricePoint[];
