// Step 6: minimum evidence and density. See design.md ("Minimum evidence and density") and Req 5.1, 5.2, 5.5, 5.6.
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
/**
 * The Req 5.1 table, with `n` the number of Regular charges. Returns the `confidence`, or `null`
 * when the Series does not meet the minimum for its source and cadence. Weekly Series of a
 * `"generic"` or `"unidentified"` source never meet it (Req 5.2).
 */
export function meetsMinimum(series) {
    const n = series.regular.length;
    if (series.group.source === "known") {
        if (series.cadence === "weekly")
            return n >= 3 ? "high" : null;
        return n >= 2 ? "high" : null;
    }
    if (series.cadence === "weekly")
        return null;
    if (series.cadence === "yearly") {
        if (n >= 3)
            return "high";
        return n === 2 ? "medium" : null;
    }
    if (n >= 3)
        return "high";
    if (n === 2 && series.regular[0].amountCents === series.regular[1].amountCents) {
        return "medium";
    }
    return null;
}
/**
 * `m` of Req 5.6: for every Amount band of the Regular charges, the band's live charges dated
 * from the first to the last Regular charge inclusive. Fully refunded charges are not in any
 * band; the Introductory charge's band is counted only when a Regular charge lies in it.
 */
export function densityCount(series) {
    const first = series.regular[0].date.day;
    const last = series.regular[series.regular.length - 1].date.day;
    let m = 0;
    for (const bandId of series.bandIds) {
        const band = series.group.bands[bandId];
        if (band === undefined)
            continue;
        m += firstAtOrAfter(band.charges, last + 1) - firstAtOrAfter(band.charges, first);
    }
    return m;
}
/**
 * The `confidence` of an accepted Series, or `null` when it is rejected: it misses its minimum
 * (Req 5.1) or `m ≥ 2n − 1` (Req 5.6). A rejected Series is never split or re-chosen (Req 5.5).
 */
export function acceptSeries(series) {
    const confidence = meetsMinimum(series);
    if (confidence === null)
        return null;
    if (densityCount(series) >= 2 * series.regular.length - 1)
        return null;
    return confidence;
}
