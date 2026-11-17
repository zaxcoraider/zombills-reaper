// Step 8: one accepted Series becomes a Subscription (without its id).
// See design.md ("Amounts and price history", "Status", "Evidence") and Req 1.6, 1.7, 1.12, 6, 7.
import { addPeriods, ENDED_GRACE_DAYS, TOLERANCE_DAYS } from "./cadence-rules.js";
import { parseIsoDate } from "./dates.js";
/** Days after the last Regular charge in which a partial refund is still reported (Req 9.7). */
const PARTIAL_REFUND_DAYS = 45;
/** Periods per year for the yearly cost (Req 6.2). */
const YEARLY_FACTOR = Object.freeze({
    weekly: 52,
    monthly: 12,
    yearly: 1,
});
/** A fresh copy of the 4 + 5 fields of an entry (Req 1.12). */
function copyCharge(entry) {
    return {
        date: entry.date.iso,
        description: entry.description,
        amountCents: entry.amountCents,
        currency: entry.currency,
        merchant: {
            key: entry.merchant.key,
            displayName: entry.merchant.displayName,
            source: entry.merchant.source,
            serviceId: entry.merchant.serviceId,
            // The one cast of the module: `validateElement` checks only that `processor` is a string
            // or null (Req 2.1), and the type of the input promises a `ProcessorId`.
            processor: entry.merchant.processor,
        },
    };
}
/** First charge, then every charge whose amount differs from the previous one (Req 6.4). */
function buildPriceHistory(charges) {
    const history = [];
    let previous = null;
    for (const entry of charges) {
        if (previous === null || entry.amountCents !== previous) {
            history.push({ date: entry.date.iso, amountCents: entry.amountCents });
        }
        previous = entry.amountCents;
    }
    return history;
}
/** `"ended"` when the As-of date is more than the grace after `next` (Req 7.5, 7.8). */
function statusOf(next, cadence, asOf) {
    return asOf.day > next.day + ENDED_GRACE_DAYS[cadence] ? "ended" : "active";
}
/** Index of the first entry with `day >= from` in `rows`, sorted ascending by date. */
function lowerBound(rows, from) {
    let lo = 0;
    let hi = rows.length;
    while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        const row = rows[mid];
        if (row !== undefined && row.date.day < from)
            lo = mid + 1;
        else
            hi = mid;
    }
    return lo;
}
/** Latest zero row of the Group from one Period plus Tolerance before `e` up to `e` (Req 9.5). */
function findFreeTrialDate(zeroRows, e, cadence) {
    const from = addPeriods(e, cadence, -1).day - TOLERANCE_DAYS[cadence];
    // First row after `e`; the row before it is the latest row on or before `e`.
    const after = lowerBound(zeroRows, e.day + 1);
    const latest = zeroRows[after - 1];
    if (latest === undefined || latest.date.day < from)
        return null;
    return latest.date.iso;
}
/** True when `e` is more than one Period plus Tolerance after the first statement date (Req 9.6). */
function startedIn(firstDate, e, cadence) {
    const first = parseIsoDate(firstDate);
    if (first === null)
        return false;
    return e.day > addPeriods(first, cadence, 1).day + TOLERANCE_DAYS[cadence];
}
/** Money-in Credits of the Group from `e` to the last Regular charge + 45 days (Req 9.7). */
function findPartialRefunds(moneyIn, e, last) {
    const refunds = [];
    const to = last.day + PARTIAL_REFUND_DAYS;
    for (let i = lowerBound(moneyIn, e.day); i < moneyIn.length; i += 1) {
        const row = moneyIn[i];
        if (row === undefined || row.date.day > to)
            break;
        refunds.push({ date: row.date.iso, amountCents: row.amountCents });
    }
    return refunds;
}
/** The facts behind a Series for the classifier and the card (Req 9). */
function buildEvidence(series, first, last, next, statement) {
    const e = (series.intro ?? first).date;
    let missedPeriods = 0;
    const lateChargeDates = [];
    series.intervals.forEach((interval, i) => {
        if (interval.k === 2)
            missedPeriods += 1;
        const into = series.regular[i + 1];
        if (interval.kind === "late" && into !== undefined)
            lateChargeDates.push(into.date.iso);
    });
    return {
        regularChargeCount: series.regular.length,
        firstChargeDate: first.date.iso,
        lastChargeDate: last.date.iso,
        nextExpectedDate: next.iso,
        missedPeriods,
        lateChargeDates,
        cadenceAssumed: series.cadenceAssumed,
        introCharge: series.intro === null
            ? null
            : { date: series.intro.date.iso, amountCents: series.intro.amountCents },
        freeTrialDate: findFreeTrialDate(series.group.zeroRows, e, series.cadence),
        startedInStatement: startedIn(statement.firstDate, e, series.cadence),
        partialRefunds: findPartialRefunds(series.group.moneyIn, e, last.date),
    };
}
/**
 * Builds the Subscription of an accepted Series, or `null` when its yearly cost is not a safe
 * integer (Req 6.5). `series.regular` is never empty.
 */
export function buildSubscription(series, statement, asOf) {
    const lastRegular = series.regular[series.regular.length - 1];
    const firstRegular = series.regular[0];
    if (lastRegular === undefined || firstRegular === undefined)
        return null;
    const currentAmountCents = lastRegular.amountCents;
    const yearlyCostCents = currentAmountCents * YEARLY_FACTOR[series.cadence];
    if (!Number.isSafeInteger(yearlyCostCents))
        return null;
    const entries = series.intro === null ? series.regular : [series.intro, ...series.regular];
    const next = addPeriods(lastRegular.date, series.cadence, 1);
    const group = series.group;
    const firstEntry = group.charges[0];
    return {
        merchant: lastRegular.merchant.displayName,
        merchantKey: group.key,
        serviceId: firstEntry === undefined ? null : firstEntry.merchant.serviceId,
        source: group.source,
        currency: group.currency,
        cadence: series.cadence,
        charges: entries.map(copyCharge),
        currentAmountCents,
        yearlyCostCents,
        labels: [],
        priceHistory: buildPriceHistory(entries),
        status: statusOf(next, series.cadence, asOf),
        confidence: series.confidence,
        evidence: buildEvidence(series, firstRegular, lastRegular, next, statement),
    };
}
