import type { Entry } from "./internal-types.js";
/**
 * Returns the Charges that are fully refunded and the Credits that refund them.
 * `sorted` holds the valid entries in Content order.
 */
export declare function matchRefunds(sorted: readonly Entry[]): {
    refunded: Set<Entry>;
    refunds: Set<Entry>;
};
