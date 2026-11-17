import type { CivilDate, Entry } from "./internal-types.js";
import type { StatementInfo } from "./types.js";
/**
 * Builds the `StatementInfo` from the valid entries in Content order (ascending date) and the
 * caller's options. `options` is read only when it is a non-null, non-array object, and
 * `options.asOf` is read once (Req 1.4, 1.14, 7.1, 7.2).
 */
export declare function buildStatementInfo(sorted: readonly Entry[], options: unknown): StatementInfo;
/** The As-of date as a `CivilDate`, or `null` when the statement has none. */
export declare function resolveAsOf(info: StatementInfo): CivilDate | null;
