// Schedule rules: expected dates, deviation and step classification.
// See .kiro/specs/subscription-detector/design.md ("Schedule rules") and Req 4.2, 4.3, 4.6.
import { LATE_MAX_DAYS, LATE_MIN_DAYS, MAX_K, MIN_GAP_DAYS, TOLERANCE_DAYS, addPeriods, } from "./cadence-rules.js";
import { addMonths, daysInMonth, isLastDayOfMonth } from "./dates.js";
/** Day number of the last day of the month that holds `date`. */
function lastDayOfMonthOf(date) {
    return date.day + (daysInMonth(date.y, date.m) - date.d);
}
/** How many leading entries of `expectedDays` come from the previous charge (the rest are anchor dates). */
function forwardCount(prev, cadence) {
    return cadence === "monthly" && isLastDayOfMonth(prev) ? 2 : 1;
}
/**
 * Expected Day numbers of the charge `k` periods after `prev`. The entries from the previous
 * charge come first (for monthly with `prev` on the last day of its month, the month-end
 * alternative is the second entry), then the entries from the anchor, which is the first
 * Regular charge of the chain. `anchorIndex` is the period index of `prev` (Req 4.2, 4.3).
 */
export function expectedDays(prev, anchor, anchorIndex, cadence, k) {
    const days = [addPeriods(prev, cadence, k).day];
    if (forwardCount(prev, cadence) === 2) {
        days.push(lastDayOfMonthOf(addMonths(prev, k)));
    }
    days.push(addPeriods(anchor, cadence, anchorIndex + k).day);
    if (cadence === "monthly" && isLastDayOfMonth(anchor)) {
        days.push(lastDayOfMonthOf(addMonths(anchor, anchorIndex + k)));
    }
    return days;
}
/**
 * Smallest distance in days between `candidate` and an expected date, or between `prev` and the
 * date `k` periods before `candidate` (backward check). Anchor dates count only when the
 * candidate is at least `MIN_GAP_DAYS` after `prev` (Req 4.3).
 */
export function deviation(prev, candidate, expected, cadence, k) {
    const anchorStart = forwardCount(prev, cadence);
    const anchorAllowed = candidate.day - prev.day >= MIN_GAP_DAYS[cadence];
    let best = Math.abs(prev.day - addPeriods(candidate, cadence, -k).day);
    for (let i = 0; i < expected.length; i++) {
        if (i >= anchorStart && !anchorAllowed)
            break;
        const distance = Math.abs(candidate.day - expected[i]);
        if (distance < best)
            best = distance;
    }
    return best;
}
export function classifyStep(prev, candidate, anchor, anchorIndex, cadence) {
    const tolerance = TOLERANCE_DAYS[cadence];
    const onSchedule = (k) => {
        if (k > MAX_K[cadence])
            return null;
        const expected = expectedDays(prev, anchor, anchorIndex, cadence, k);
        const dev = deviation(prev, candidate, expected, cadence, k);
        return dev <= tolerance ? dev : null;
    };
    let late = null;
    if (cadence === "monthly") {
        const days = candidate.day - addMonths(prev, 1).day;
        if (days >= LATE_MIN_DAYS.monthly && days <= LATE_MAX_DAYS.monthly)
            late = days;
    }
    return { k1: onSchedule(1), k2: onSchedule(2), late };
}
