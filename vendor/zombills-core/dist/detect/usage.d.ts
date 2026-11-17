import type { Assigned } from "./internal-types.js";
import type { TransactionUsage } from "./types.js";
/**
 * Writes one `TransactionUsage` per input position. A position missing from `roles` is a valid
 * Charge with no other role, so it gets `"not-recurring"`. `reason` is set only on `"invalid"`
 * and `subscriptionId` only on `"subscription-charge"`, as the callers record them.
 */
export declare function buildUsage(length: number, roles: ReadonlyMap<number, Assigned>): TransactionUsage[];
