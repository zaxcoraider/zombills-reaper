import type { CivilDate } from "./internal-types.js";
export declare function isLeap(y: number): boolean;
/** Days in month `m` (1–12) of year `y`. */
export declare function daysInMonth(y: number, m: number): number;
/** Pads the year to 4 digits (5 digits for year 10000), month and day to 2. */
export declare function formatDate(y: number, m: number, d: number): string;
/** Days since 1970-01-01 (days-from-civil, integer operations only). */
export declare function dayNumber(y: number, m: number, d: number): number;
/** Inverse of `dayNumber` (civil-from-days). */
export declare function fromDayNumber(day: number): CivilDate;
/** Parses a strict `yyyy-mm-dd` real calendar date; returns null for anything else. */
export declare function parseIsoDate(value: unknown): CivilDate | null;
export declare function isLastDayOfMonth(date: CivilDate): boolean;
/** The date `k` calendar months after `date` (any integer `k`), the day clamped to the month. */
export declare function addMonths(date: CivilDate, k: number): CivilDate;
