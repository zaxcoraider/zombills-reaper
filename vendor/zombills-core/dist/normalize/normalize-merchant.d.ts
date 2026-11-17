import type { MerchantIdentity } from "./types.js";
/** @throws TypeError when `description` is not a string (type contract violation, Req 1.9). */
export declare function normalizeMerchant(description: string): MerchantIdentity;
