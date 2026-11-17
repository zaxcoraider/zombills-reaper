// detectSubscriptions: runs the eight steps of Req 3.10 in order (design "Overview").
// No step revisits the result of an earlier one.
import { groupCharges } from "./bands.js";
import { acceptSeries } from "./accept.js";
import { buildSubscription } from "./build-subscription.js";
import { compareContent } from "./content-order.js";
import { assignIds, sortSubscriptions } from "./ids.js";
import { matchRefunds } from "./refunds.js";
import { addIntroCharges, joinSegments } from "./series.js";
import { chooseBandCover } from "./segments.js";
import { reportSingleKnownCharges } from "./single-charge.js";
import { buildStatementInfo, resolveAsOf } from "./statement.js";
import { buildUsage } from "./usage.js";
import { validateElement } from "./validate.js";
/** Steps 3–6 for one Group: the Series that meet their minimum evidence and density rule. */
function acceptedSeriesOf(group, counter) {
    // Steps 3–4: one cover per band (Segments of one cadence plus one-charge leftovers).
    const segments = [];
    for (const band of group.bands)
        segments.push(...chooseBandCover(band, group.source, counter));
    // Step 5: join across bands, then add Introductory charges from the charges in no Series.
    const series = joinSegments(group, segments);
    const inSeries = new Set();
    for (const s of series)
        for (const entry of s.regular)
            inSeries.add(entry);
    const leftovers = group.charges.filter((entry) => !inSeries.has(entry));
    addIntroCharges(group, series, leftovers);
    // Step 6: a rejected Series is dropped whole.
    const accepted = [];
    for (const s of series) {
        const confidence = acceptSeries(s);
        if (confidence !== null)
            accepted.push({ ...s, confidence });
    }
    return accepted;
}
/**
 * Internal entry point; not exported from `index.ts`. `counter`, when given, counts the pairwise
 * charge comparisons of steps 3–4 (Req 11.14). It is a per-call object, never module state.
 */
export function detectSubscriptionsCounted(transactions, options, counter) {
    if (!Array.isArray(transactions)) {
        throw new TypeError("detectSubscriptions: transactions must be an array");
    }
    const length = transactions.length;
    const roles = new Map();
    // Step 1: validate each element once; holes read as `undefined` and are invalid.
    const valid = [];
    for (let i = 0; i < length; i++) {
        const result = validateElement(transactions[i], i);
        if (result.ok)
            valid.push(result.entry);
        else
            roles.set(i, { role: "invalid", subscriptionId: null, reason: result.reason });
    }
    valid.sort(compareContent);
    const sorted = valid.map((entry, rank) => ({ ...entry, rank }));
    const statement = buildStatementInfo(sorted, options);
    const asOf = resolveAsOf(statement);
    // Step 1 (cont.): full refunds, then the roles of the rows that are not Charges.
    const { refunded, refunds } = matchRefunds(sorted);
    for (const entry of sorted) {
        if (refunded.has(entry))
            roles.set(entry.index, { role: "refunded-charge", subscriptionId: null, reason: null });
        else if (refunds.has(entry))
            roles.set(entry.index, { role: "refund", subscriptionId: null, reason: null });
        else if (entry.amountCents < 0)
            roles.set(entry.index, { role: "money-in", subscriptionId: null, reason: null });
        else if (entry.amountCents === 0)
            roles.set(entry.index, { role: "zero-amount", subscriptionId: null, reason: null });
    }
    const subscriptions = [];
    if (asOf !== null) {
        // Step 2: Groups and Amount bands. Steps 3–6 per Group.
        const groups = groupCharges(sorted, refunded, refunds);
        const accepted = [];
        for (const group of groups)
            accepted.push(...acceptedSeriesOf(group, counter));
        // Step 7: single known charges.
        const reported = [...accepted, ...reportSingleKnownCharges(groups, accepted, asOf)];
        // Step 8: build. An overflowed Series is dropped and its charges stay "not-recurring".
        const built = [];
        const builtFrom = [];
        for (const series of reported) {
            const sub = buildSubscription(series, statement, asOf);
            if (sub === null)
                continue;
            built.push(sub);
            builtFrom.push(series);
        }
        const identified = assignIds(built, builtFrom);
        identified.forEach((sub, i) => {
            const series = builtFrom[i];
            const entries = series.intro === null ? series.regular : [series.intro, ...series.regular];
            for (const entry of entries) {
                roles.set(entry.index, { role: "subscription-charge", subscriptionId: sub.id, reason: null });
            }
        });
        subscriptions.push(...sortSubscriptions(identified));
    }
    return { subscriptions, statement, usage: buildUsage(length, roles) };
}
/** Finds the subscriptions in one statement's normalized transactions. */
export function detectSubscriptions(transactions, options) {
    return detectSubscriptionsCounted(transactions, options, undefined);
}
