// The `usage` array: one entry per input position, in input order (design "Usage", Req 1.8–1.10).
/**
 * Writes one `TransactionUsage` per input position. A position missing from `roles` is a valid
 * Charge with no other role, so it gets `"not-recurring"`. `reason` is set only on `"invalid"`
 * and `subscriptionId` only on `"subscription-charge"`, as the callers record them.
 */
export function buildUsage(length, roles) {
    const usage = [];
    for (let index = 0; index < length; index++) {
        const assigned = roles.get(index);
        if (assigned === undefined) {
            usage.push({ index, role: "not-recurring", subscriptionId: null, reason: null });
        }
        else {
            usage.push({
                index,
                role: assigned.role,
                subscriptionId: assigned.subscriptionId,
                reason: assigned.reason,
            });
        }
    }
    return usage;
}
