import type { Cadence } from "../detect/types.js";
/** Periods per year (the classifier's own copy; `band.test.ts` ties it to the detector). */
export declare const CADENCE_FACTOR: Readonly<Record<Cadence, number>>;
/**
 * True when `to` is more than one Band above `from`: `(to − from) × 20 > from`, written so that
 * no intermediate leaves the safe-integer range. `(from − from % 20) / 20` is `floor(from / 20)`.
 */
export declare function isBandRise(from: number, to: number): boolean;
