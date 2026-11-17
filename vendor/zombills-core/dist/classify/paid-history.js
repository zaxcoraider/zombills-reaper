// Inferred intro charge and Paid price history.
// See .kiro/specs/subscription-classifier/design.md ("Inferred intro and Paid price history").
import { isBandRise } from "./band.js";
/**
 * The intro price the detector joined to the full price as a price change, or null.
 * Cheap field checks come first; the two charge counts are one pass over `charges`.
 */
export function findInferredIntro(subscription) {
    if (subscription.evidence.introCharge !== null)
        return null;
    if (!subscription.evidence.startedInStatement)
        return null;
    const p0 = subscription.priceHistory[0];
    const p1 = subscription.priceHistory[1];
    if (p0 === undefined || p1 === undefined)
        return null;
    if (!isBandRise(p0.amountCents, p1.amountCents))
        return null;
    let atP0 = 0;
    let atP1 = 0;
    for (const charge of subscription.charges) {
        if (charge.amountCents === p0.amountCents)
            atP0 += 1;
        if (charge.amountCents === p1.amountCents)
            atP1 += 1;
    }
    if (atP0 !== 1)
        return null;
    if (atP1 < 2)
        return null;
    return { date: p0.date, amountCents: p0.amountCents };
}
/**
 * `priceHistory` without its introductory entry. A slice of `priceHistory`; entries are not copied.
 */
export function paidPriceHistory(subscription, inferredIntro) {
    if (inferredIntro !== null)
        return subscription.priceHistory.slice(1);
    const p0 = subscription.priceHistory[0];
    const intro = subscription.evidence.introCharge;
    if (intro !== null &&
        p0 !== undefined &&
        p0.date === intro.date &&
        p0.amountCents === intro.amountCents) {
        return subscription.priceHistory.slice(1);
    }
    return subscription.priceHistory;
}
