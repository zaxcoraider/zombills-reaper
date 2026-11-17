// Trial trap: the first full price after a free or cheap start.
// See .kiro/specs/subscription-classifier/design.md ("Trial trap").
/** Largest full-price charge count that still counts as "first full-price charges" (Req 3.1). */
const MAX_FULL_PRICE_CHARGES = 3;
/**
 * The trial details of `subscription`, or null when it is not a trial trap. `inferred` is the
 * Inferred intro charge from `findInferredIntro`. The caller has already checked that the
 * subscription is Eligible.
 */
export function findTrial(subscription, inferred) {
    const e = subscription.evidence;
    const intro = e.introCharge !== null ? e.introCharge : inferred;
    const free = e.freeTrialDate !== null && e.freeTrialDate !== e.firstChargeDate ? e.freeTrialDate : null;
    if (intro === null && free === null)
        return null;
    const fullCount = inferred !== null ? e.regularChargeCount - 1 : e.regularChargeCount;
    if (fullCount > MAX_FULL_PRICE_CHARGES)
        return null;
    let firstFullCharge;
    if (inferred !== null) {
        const p1 = subscription.priceHistory[1];
        if (p1 === undefined)
            return null;
        firstFullCharge = { date: p1.date, amountCents: p1.amountCents };
    }
    else {
        const charge = subscription.charges.find((t) => t.date === e.firstChargeDate);
        if (charge === undefined)
            return null;
        firstFullCharge = { date: charge.date, amountCents: charge.amountCents };
    }
    return {
        freeTrialDate: free,
        introCharge: intro === null ? null : { date: intro.date, amountCents: intro.amountCents },
        firstFullCharge,
    };
}
