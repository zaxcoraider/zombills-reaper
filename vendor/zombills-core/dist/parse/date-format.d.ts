import type { DateDetection } from "./internal-types.js";
import type { DateFormat } from "./types.js";
/**
 * The four ways a date cell can be written, told apart by separator and by how many digits come
 * first. Several `DateFormat`s can share one shape ("1/5/2026" is both dd/mm/yyyy and mm/dd/yyyy).
 */
export type DateShape = "iso" | "slash" | "dot" | "dash";
/** The formats each shape can be read as. */
export declare const FORMATS_OF_SHAPE: Record<DateShape, readonly DateFormat[]>;
/** Shapes in tie-break order (Req 3.12): ISO, then slash, then dot, then dash. */
export declare const SHAPE_PRIORITY: readonly DateShape[];
/** A date cell split into its three numeric parts, in the order they were written. */
export interface DateCell {
    shape: DateShape;
    /** Leftmost part, as written */
    first: string;
    /** Middle part, as written */
    second: string;
    /** Rightmost part, as written */
    third: string;
}
/** Splits a (trimmed) date cell by shape, or returns null when it has none of the supported shapes. */
export declare function matchDateShape(cell: string): DateCell | null;
export declare function isLeapYear(year: number): boolean;
/** Days in a month under the Gregorian leap-year rule. `month` is 1-12. */
export declare function daysInMonth(year: number, month: number): number;
/**
 * Whether the cell is a real calendar date when read as `format`. Used to decide which cells
 * count as candidates for format detection (Req 3.1).
 */
export declare function isDateIn(cell: DateCell, format: DateFormat): boolean;
/**
 * Parses one date cell written in `format` into an ISO `yyyy-mm-dd` string (Req 3.7, 3.8, 3.11).
 *
 * Day and month may be written with or without zero padding. A two-digit year is read as 20yy in
 * every format except `yyyy-mm-dd`, where the year always has four digits.
 *
 * @throws ParseError when the cell is not written in `format` or is not a real calendar date.
 */
export declare function parseDate(raw: string, format: DateFormat): string;
/**
 * Decides once per statement how the date cells are written.
 *
 * 1. Candidates (Req 3.1): every cell with a supported shape that is a real calendar date in at
 *    least one format of that shape. All cells are used, in any order.
 * 2. Shape (Req 3.12): the most frequent shape among the candidates decides the format; ties go to
 *    ISO, then slash, then dot, then dash. Cells of other shapes are not used here and later fail
 *    `parseDate` as row errors.
 * 3. Format: ISO, dot and dash settle it. For slash, a leftmost part above 12 means dd/mm/yyyy
 *    (Req 3.3), a middle part above 12 means mm/dd/yyyy (Req 3.4), both is a conflict (Req 3.10),
 *    and neither defaults to mm/dd/yyyy with `assumed: true` (Req 3.5).
 *
 * The result depends only on the set of cells, not on their order (Req 3.6).
 */
export declare function detectDateFormat(cells: readonly string[]): DateDetection;
