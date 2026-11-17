import type { CivilDate, Group, Series } from "./internal-types.js";
/**
 * For every `"known"` Group with no accepted Series and at least one live charge, the latest
 * charge (ties by Content order) as a one-charge, low-confidence Series with an assumed cadence:
 * monthly when `asOf` is at most 3 days after the charge plus one month, else yearly (Req 5.4).
 * A charge of a Series rejected in step 6 can be reported here (Req 5.5).
 */
export declare function reportSingleKnownCharges(groups: readonly Group[], accepted: readonly Series[], asOf: CivilDate): Series[];
