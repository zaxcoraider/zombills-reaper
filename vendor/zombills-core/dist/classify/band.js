// Band rise and Cadence factor. See design "Band rise and cadence factor".
/** Periods per year (the classifier's own copy; `band.test.ts` ties it to the detector). */
export const CADENCE_FACTOR = Object.freeze({
    weekly: 52,
    monthly: 12,
    yearly: 1,
});
/**
 * True when `to` is more than one Band above `from`: `(to − from) × 20 > from`, written so that
 * no intermediate leaves the safe-integer range. `(from − from % 20) / 20` is `floor(from / 20)`.
 */
export function isBandRise(from, to) {
    if (to <= from)
        return false;
    return to - from > (from - (from % 20)) / 20;
}
