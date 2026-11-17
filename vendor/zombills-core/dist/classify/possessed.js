// Possessed: the current price is more than one Band above the first paid price.
// See .kiro/specs/subscription-classifier/design.md ("Possessed").
import { CADENCE_FACTOR, isBandRise } from "./band.js";
/**
 * The price rise of `subscription` measured from its first paid price, or null when it is not
 * possessed. `paid` is the Paid price history. The caller has already checked that the
 * subscription is Eligible.
 */
export function findPriceRise(subscription, paid) {
    const first = paid[0];
    if (first === undefined || paid.length < 2)
        return null;
    const current = subscription.currentAmountCents;
    if (!isBandRise(first.amountCents, current))
        return null;
    const increasePerChargeCents = current - first.amountCents;
    const increasePerYearCents = increasePerChargeCents * CADENCE_FACTOR[subscription.cadence];
    if (!Number.isSafeInteger(increasePerYearCents))
        return null;
    let latestRise = null;
    for (let i = paid.length - 1; i >= 1; i -= 1) {
        const prev = paid[i - 1];
        const next = paid[i];
        if (prev !== undefined &&
            next !== undefined &&
            isBandRise(prev.amountCents, next.amountCents)) {
            latestRise = {
                fromAmountCents: prev.amountCents,
                toAmountCents: next.amountCents,
                date: next.date,
            };
            break;
        }
    }
    return {
        firstSeen: { date: first.date, amountCents: first.amountCents },
        currentAmountCents: current,
        latestRise,
        increasePerChargeCents,
        increasePerYearCents,
    };
}
