import { ParseError } from "./parse-error.js";
/** The formats each shape can be read as. */
export const FORMATS_OF_SHAPE = {
    iso: ["yyyy-mm-dd"],
    slash: ["dd/mm/yyyy", "mm/dd/yyyy"],
    dot: ["dd.mm.yyyy"],
    dash: ["dd-mm-yyyy"],
};
/** Shapes in tie-break order (Req 3.12): ISO, then slash, then dot, then dash. */
export const SHAPE_PRIORITY = ["iso", "slash", "dot", "dash"];
const SHAPE_PATTERNS = [
    ["iso", /^([0-9]{4})-([0-9]{1,2})-([0-9]{1,2})$/],
    ["slash", /^([0-9]{1,2})\/([0-9]{1,2})\/([0-9]{2}|[0-9]{4})$/],
    ["dot", /^([0-9]{1,2})\.([0-9]{1,2})\.([0-9]{2}|[0-9]{4})$/],
    ["dash", /^([0-9]{1,2})-([0-9]{1,2})-([0-9]{2}|[0-9]{4})$/],
];
/** Splits a (trimmed) date cell by shape, or returns null when it has none of the supported shapes. */
export function matchDateShape(cell) {
    for (const [shape, pattern] of SHAPE_PATTERNS) {
        const match = pattern.exec(cell);
        if (match !== null) {
            return { shape, first: match[1] ?? "", second: match[2] ?? "", third: match[3] ?? "" };
        }
    }
    return null;
}
export function isLeapYear(year) {
    return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}
/** Days in a month under the Gregorian leap-year rule. `month` is 1-12. */
export function daysInMonth(year, month) {
    if (month === 2) {
        return isLeapYear(year) ? 29 : 28;
    }
    return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31;
}
function isRealDate(year, month, day) {
    return year >= 1 && month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
}
/** Reads the year as written: four digits as they are, two digits as 20yy (Req 3.11). */
function yearOf(digits) {
    return digits.length === 2 ? 2000 + Number(digits) : Number(digits);
}
/** Splits a matched cell into year, month and day according to `format`. */
function partsOf(cell, format) {
    switch (format) {
        case "yyyy-mm-dd":
            return { year: yearOf(cell.first), month: Number(cell.second), day: Number(cell.third) };
        case "mm/dd/yyyy":
            return { year: yearOf(cell.third), month: Number(cell.first), day: Number(cell.second) };
        case "dd/mm/yyyy":
        case "dd.mm.yyyy":
        case "dd-mm-yyyy":
            return { year: yearOf(cell.third), month: Number(cell.second), day: Number(cell.first) };
    }
}
/**
 * Whether the cell is a real calendar date when read as `format`. Used to decide which cells
 * count as candidates for format detection (Req 3.1).
 */
export function isDateIn(cell, format) {
    if (!FORMATS_OF_SHAPE[cell.shape].includes(format)) {
        return false;
    }
    const { year, month, day } = partsOf(cell, format);
    return isRealDate(year, month, day);
}
function pad(value, width) {
    return String(value).padStart(width, "0");
}
const MAX_QUOTED_LENGTH = 40;
function quote(raw) {
    const shown = raw.length > MAX_QUOTED_LENGTH ? `${raw.slice(0, MAX_QUOTED_LENGTH)}…` : raw;
    return JSON.stringify(shown);
}
/**
 * Parses one date cell written in `format` into an ISO `yyyy-mm-dd` string (Req 3.7, 3.8, 3.11).
 *
 * Day and month may be written with or without zero padding. A two-digit year is read as 20yy in
 * every format except `yyyy-mm-dd`, where the year always has four digits.
 *
 * @throws ParseError when the cell is not written in `format` or is not a real calendar date.
 */
export function parseDate(raw, format) {
    const cell = matchDateShape(raw.trim());
    if (cell === null || !FORMATS_OF_SHAPE[cell.shape].includes(format)) {
        throw new ParseError("date", `Expected a ${format} date but got ${quote(raw)}`);
    }
    const { year, month, day } = partsOf(cell, format);
    if (!isRealDate(year, month, day)) {
        throw new ParseError("date", `${quote(raw)} is not a real calendar date (expected ${format})`);
    }
    return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
}
const CONFLICT_REASON = "Conflicting date formats: some dates put a day above 12 first (dd/mm/yyyy) and others put a day above 12 in the middle (mm/dd/yyyy)";
/** Formats a winning shape is read as when the shape alone settles it (Req 3.2, 3.11). */
const FORMAT_OF_UNAMBIGUOUS_SHAPE = {
    iso: "yyyy-mm-dd",
    dot: "dd.mm.yyyy",
    dash: "dd-mm-yyyy",
};
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
export function detectDateFormat(cells) {
    const candidates = { iso: [], slash: [], dot: [], dash: [] };
    for (const raw of cells) {
        const cell = matchDateShape(raw.trim());
        if (cell !== null && FORMATS_OF_SHAPE[cell.shape].some((format) => isDateIn(cell, format))) {
            candidates[cell.shape].push(cell);
        }
    }
    let winner = null;
    for (const shape of SHAPE_PRIORITY) {
        const count = candidates[shape].length;
        if (count > 0 && (winner === null || count > candidates[winner].length)) {
            winner = shape;
        }
    }
    if (winner === null) {
        return { kind: "none" };
    }
    if (winner !== "slash") {
        return {
            kind: "detected",
            info: { format: FORMAT_OF_UNAMBIGUOUS_SHAPE[winner], assumed: false },
        };
    }
    const dayFirst = candidates.slash.some((cell) => Number(cell.first) > 12);
    const monthFirst = candidates.slash.some((cell) => Number(cell.second) > 12);
    if (dayFirst && monthFirst) {
        return { kind: "conflict", reason: CONFLICT_REASON };
    }
    if (dayFirst) {
        return { kind: "detected", info: { format: "dd/mm/yyyy", assumed: false } };
    }
    if (monthFirst) {
        return { kind: "detected", info: { format: "mm/dd/yyyy", assumed: false } };
    }
    return { kind: "detected", info: { format: "mm/dd/yyyy", assumed: true } };
}
