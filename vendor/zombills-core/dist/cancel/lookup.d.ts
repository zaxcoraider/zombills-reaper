import type { CancelEntry, CancelHelp, CancelRegion } from "./types.js";
/** The Region of a statement currency: exact USD, GBP or EUR, else null (Req 2.2, 2.3). */
export declare function statementRegion(currency: string): CancelRegion | null;
/** Internal (not in the barrel): the lookup over any entry list. */
export declare function lookupIn(entries: readonly CancelEntry[]): (serviceId: string | null, currency: string) => CancelHelp;
/** Never throws. A serviceId with no Cancel entry, or not a string, gives "email-only" (Req 2.4). */
export declare const getCancelHelp: (serviceId: string | null, currency: string) => CancelHelp;
