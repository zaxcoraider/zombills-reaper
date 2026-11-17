import type { Entry } from "./internal-types.js";
type Comparable = Omit<Entry, "rank">;
/**
 * Compares by date, amount, description, displayName, source, serviceId, processor,
 * currency and key, and only then by input position.
 */
export declare function compareContent(a: Comparable, b: Comparable): number;
export {};
