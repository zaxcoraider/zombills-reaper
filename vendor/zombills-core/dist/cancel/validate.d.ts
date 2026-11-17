import type { AppStoreLinks, CancelDataIssue, CancelEntry, EmailOnlyService, ValidateCancelOptions } from "./types.js";
/** Pure and total; [] when the data follows every rule of Req 6 (Req 5). */
export declare function validateCancelDatabase(entries: readonly CancelEntry[], emailOnly: readonly EmailOnlyService[], knownServiceIds: readonly string[], appStoreLinks: AppStoreLinks, options?: ValidateCancelOptions): CancelDataIssue[];
