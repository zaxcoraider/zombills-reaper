// Step 7: single known charges. See design.md ("Single known charges") and Req 5.4.
import { addMonths } from "./dates.js";
/** Days after `addMonths(charge, 1)` that still count as a monthly plan (Req 5.4). */
const MONTHLY_GRACE_DAYS = 3;
/** The band of `group` that holds `entry`, as an id list for the Series' density bookkeeping. */
function bandIdsOf(group, entry) {
    const band = group.bands.find((b) => b.charges.includes(entry));
    return band === undefined ? [] : [band.id];
}
/**
 * For every `"known"` Group with no accepted Series and at least one live charge, the latest
 * charge (ties by Content order) as a one-charge, low-confidence Series with an assumed cadence:
 * monthly when `asOf` is at most 3 days after the charge plus one month, else yearly (Req 5.4).
 * A charge of a Series rejected in step 6 can be reported here (Req 5.5).
 */
export function reportSingleKnownCharges(groups, accepted, asOf) {
    const covered = new Set();
    for (const series of accepted)
        covered.add(series.group);
    const reported = [];
    for (const group of groups) {
        if (group.source !== "known" || covered.has(group))
            continue;
        let latest = null;
        // `charges` is in Content order, so a strict `>` keeps the first of equal dates.
        for (const entry of group.charges) {
            if (latest === null || entry.date.day > latest.date.day)
                latest = entry;
        }
        if (latest === null)
            continue;
        const cadence = asOf.day <= addMonths(latest.date, 1).day + MONTHLY_GRACE_DAYS ? "monthly" : "yearly";
        reported.push({
            group,
            cadence,
            regular: [latest],
            intervals: [],
            bandIds: bandIdsOf(group, latest),
            intro: null,
            cadenceAssumed: true,
            confidence: "low",
        });
    }
    return reported;
}
