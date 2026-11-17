// Step 3: chains, covers and cadence choice for one Amount band.
// See .kiro/specs/subscription-detector/design.md ("Growing one chain", "Cover per cadence",
// "Cadence per band") and Req 3.4, 4.4, 4.5, 4.6.
import { MAX_K, TOLERANCE_DAYS, WINDOW_FROM_DAYS, WINDOW_TO_DAYS, addPeriods, } from "./cadence-rules.js";
import { addMonths, daysInMonth, isLastDayOfMonth } from "./dates.js";
import { classifyStep } from "./schedule.js";
/** Index of the first charge in `charges` (ascending by day) whose Day number is at least `day`. */
function firstAtOrAfter(charges, day) {
    let lo = 0;
    let hi = charges.length;
    while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (charges[mid].date.day < day)
            lo = mid + 1;
        else
            hi = mid;
    }
    return lo;
}
/** Calls `visit` once for each charge inside the union of `ranges`; each visit is one comparison. */
function scanRanges(charges, ranges, counter, visit) {
    const sorted = ranges.filter((r) => r.lo <= r.hi).sort((a, b) => a.lo - b.lo);
    const merged = [];
    for (const range of sorted) {
        const last = merged[merged.length - 1];
        if (last !== undefined && range.lo <= last.hi + 1) {
            if (range.hi > last.hi)
                last.hi = range.hi;
        }
        else {
            merged.push({ lo: range.lo, hi: range.hi });
        }
    }
    for (const range of merged) {
        for (let i = firstAtOrAfter(charges, range.lo); i < charges.length; i++) {
            const charge = charges[i];
            if (charge.date.day > range.hi)
                break;
            if (counter !== undefined)
                counter.comparisons++;
            visit(charge);
        }
    }
}
/** The previous-charge window keyed to the charge on Day number `day`. */
function previousWindow(day, cadence) {
    return { lo: day + WINDOW_FROM_DAYS[cadence], hi: day + WINDOW_TO_DAYS[cadence] };
}
/**
 * The anchor window from the anchor date for index `fromIndex` minus the Tolerance to the anchor
 * date for index `toIndex` plus the Tolerance. When the anchor is the last day of its month, the
 * month-end alternative of the last index (never earlier than its anchor date) widens the end.
 */
function anchorWindow(anchor, cadence, fromIndex, toIndex) {
    const tolerance = TOLERANCE_DAYS[cadence];
    const date = anchor.date;
    const lo = addPeriods(date, cadence, fromIndex).day - tolerance;
    let end = addPeriods(date, cadence, toIndex).day;
    if (cadence === "monthly" && isLastDayOfMonth(date)) {
        const target = addMonths(date, toIndex);
        end = Math.max(end, target.day + (daysInMonth(target.y, target.m) - target.d));
    }
    return { lo, hi: end + tolerance };
}
function offer(best, charge, key) {
    if (best === null || key < best.key || (key === best.key && charge.rank < best.charge.rank)) {
        return { charge, key };
    }
    return best;
}
/**
 * Grows one chain from `start` over the unused charges of `band` (design "Growing one chain").
 * Preference: on schedule with `k = 1`, then late (monthly), then on schedule with `k = 2`; after
 * a late charge only the two continuations of Req 4.6. Each charge examined in a window adds one
 * to `counter.comparisons` when a counter is given. The result does not depend on the counter.
 */
export function growChain(band, used, start, cadence, counter) {
    const charges = band.charges;
    const anchor = start;
    const chain = [start];
    const intervals = [];
    /** Period index of the last charge of the chain (a late charge counts as one period). */
    let j = 0;
    for (;;) {
        const a = chain[chain.length - 1];
        const lastInterval = intervals[intervals.length - 1];
        const afterLate = lastInterval !== undefined && lastInterval.kind === "late";
        if (!afterLate) {
            let onK1 = null;
            let late = null;
            let onK2 = null;
            const ranges = [
                previousWindow(a.date.day, cadence),
                anchorWindow(anchor, cadence, j + 1, j + MAX_K[cadence]),
            ];
            const first = ranges[1];
            first.lo = Math.max(first.lo, a.date.day + WINDOW_FROM_DAYS[cadence]);
            scanRanges(charges, ranges, counter, (y) => {
                if (used.has(y) || y.date.day <= a.date.day)
                    return;
                const step = classifyStep(a.date, y.date, anchor.date, j, cadence);
                if (step.k1 !== null)
                    onK1 = offer(onK1, y, step.k1);
                if (step.late !== null)
                    late = offer(late, y, step.late);
                if (step.k2 !== null)
                    onK2 = offer(onK2, y, step.k2);
            });
            const pick1 = onK1;
            const pickLate = late;
            const pick2 = onK2;
            if (pick1 !== null) {
                chain.push(pick1.charge);
                intervals.push({ k: 1, kind: "on-schedule", deviation: pick1.key });
                j += 1;
            }
            else if (pickLate !== null) {
                chain.push(pickLate.charge);
                intervals.push({ k: 1, kind: "late", deviation: pickLate.key });
                j += 1;
            }
            else if (pick2 !== null) {
                chain.push(pick2.charge);
                intervals.push({ k: 2, kind: "on-schedule", deviation: pick2.key });
                j += 2;
            }
            else {
                break;
            }
        }
        else {
            // `a` is late; `p` is the charge before it, at period index `j - 1`.
            const p = chain[chain.length - 2];
            let fromP = null;
            let fromA = null;
            const anchorRange = anchorWindow(anchor, cadence, j + 1, j + 1);
            anchorRange.lo = Math.max(anchorRange.lo, p.date.day + WINDOW_FROM_DAYS[cadence], a.date.day + 1);
            const ranges = [
                previousWindow(p.date.day, cadence),
                previousWindow(a.date.day, cadence),
                anchorRange,
            ];
            scanRanges(charges, ranges, counter, (y) => {
                if (used.has(y) || y.date.day <= a.date.day)
                    return;
                const afterP = classifyStep(p.date, y.date, anchor.date, j - 1, cadence).k2;
                if (afterP !== null)
                    fromP = offer(fromP, y, afterP);
                const afterA = classifyStep(a.date, y.date, anchor.date, j, cadence).k1;
                if (afterA !== null)
                    fromA = offer(fromA, y, afterA);
            });
            const pickP = fromP;
            const pickA = fromA;
            const pick = pickP ?? pickA;
            if (pick === null)
                break;
            chain.push(pick.charge);
            intervals.push({ k: 1, kind: "on-schedule", deviation: pick.key });
            j += 1;
        }
    }
    return { charges: chain, intervals };
}
/**
 * The longest prefix of `chain` with 2 or more charges, at least one `k = 1` interval and no more
 * `k = 2` than `k = 1` intervals (Req 4.4); `null` when no prefix qualifies. A prefix may end on a
 * late charge.
 */
export function longestValidPrefix(chain) {
    let ones = 0;
    let twos = 0;
    let best = 0;
    for (let i = 0; i < chain.intervals.length; i++) {
        if (chain.intervals[i].k === 1)
            ones++;
        else
            twos++;
        if (ones >= 1 && twos <= ones)
            best = i + 1;
    }
    if (best === 0)
        return null;
    return { charges: chain.charges.slice(0, best + 1), intervals: chain.intervals.slice(0, best) };
}
/**
 * Covers `band` with chains of one cadence (design "Cover per cadence"). Starts are tried in
 * Content order; a start whose chain has no valid prefix stays unused and may still be reached by a
 * later chain. Returns the multi-charge Segments in sweep order, then one-charge Segments
 * (`cadence: null`) for every charge left over, in Content order.
 */
export function coverBand(band, cadence, counter) {
    const used = new Set();
    const segments = [];
    for (const start of band.charges) {
        if (used.has(start))
            continue;
        const chain = longestValidPrefix(growChain(band, used, start, cadence, counter));
        if (chain === null)
            continue;
        for (const charge of chain.charges)
            used.add(charge);
        segments.push({
            bandId: band.id,
            cadence,
            charges: chain.charges,
            intervals: chain.intervals,
        });
    }
    for (const charge of band.charges) {
        if (!used.has(charge)) {
            segments.push({ bandId: band.id, cadence: null, charges: [charge], intervals: [] });
        }
    }
    return segments;
}
/** Cadences tried in order of Period, shortest first, so a tie keeps the shorter Period. */
const CADENCES_KNOWN = Object.freeze(["weekly", "monthly", "yearly"]);
const CADENCES_OTHER = Object.freeze(["monthly", "yearly"]);
/** The number of charges in the multi-charge Segments of `cover`. */
function coveredCount(cover) {
    let count = 0;
    for (const segment of cover)
        if (segment.cadence !== null)
            count += segment.charges.length;
    return count;
}
/**
 * The cover of `band` under the cadence that covers the most charges, ties going to the shorter
 * Period (design "Cadence per band", Req 4.7). Weekly is tried only for `"known"` merchants. When
 * no cadence covers a charge, the result is one-charge Segments only.
 */
export function chooseBandCover(band, source, counter) {
    let best = null;
    let bestCount = 0;
    for (const cadence of source === "known" ? CADENCES_KNOWN : CADENCES_OTHER) {
        const cover = coverBand(band, cadence, counter);
        const count = coveredCount(cover);
        if (count > bestCount) {
            best = cover;
            bestCount = count;
        }
    }
    if (best !== null)
        return best;
    return band.charges.map((charge) => ({
        bandId: band.id,
        cadence: null,
        charges: [charge],
        intervals: [],
    }));
}
