import type { CivilDate, Series } from "./internal-types.js";
import type { StatementInfo, Subscription } from "./types.js";
/**
 * Builds the Subscription of an accepted Series, or `null` when its yearly cost is not a safe
 * integer (Req 6.5). `series.regular` is never empty.
 */
export declare function buildSubscription(series: Series, statement: StatementInfo, asOf: CivilDate): Omit<Subscription, "id"> | null;
