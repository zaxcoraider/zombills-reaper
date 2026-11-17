// Calendar arithmetic on Day numbers. No Date object is ever built (Req 7.3).
// See .kiro/specs/subscription-detector/design.md ("Date arithmetic").
const ISO_DATE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;
const MONTH_LENGTHS = Object.freeze([
    31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31,
]);
export function isLeap(y) {
    return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}
/** Days in month `m` (1–12) of year `y`. */
export function daysInMonth(y, m) {
    const length = MONTH_LENGTHS[m - 1] ?? 0;
    return m === 2 && isLeap(y) ? length + 1 : length;
}
/** Pads the year to 4 digits (5 digits for year 10000), month and day to 2. */
export function formatDate(y, m, d) {
    const year = y < 0 ? `-${String(-y).padStart(4, "0")}` : String(y).padStart(4, "0");
    return `${year}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
/** Days since 1970-01-01 (days-from-civil, integer operations only). */
export function dayNumber(y, m, d) {
    const shifted = m <= 2 ? y - 1 : y;
    const era = Math.floor(shifted / 400);
    const yoe = shifted - era * 400;
    const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
    const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
    return era * 146097 + doe - 719468;
}
function makeDate(y, m, d) {
    return { y, m, d, day: dayNumber(y, m, d), iso: formatDate(y, m, d) };
}
/** Inverse of `dayNumber` (civil-from-days). */
export function fromDayNumber(day) {
    const z = day + 719468;
    const era = Math.floor(z / 146097);
    const doe = z - era * 146097;
    const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
    const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
    const mp = Math.floor((5 * doy + 2) / 153);
    const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
    const m = mp < 10 ? mp + 3 : mp - 9;
    const y = yoe + era * 400 + (m <= 2 ? 1 : 0);
    return { y, m, d, day, iso: formatDate(y, m, d) };
}
/** Parses a strict `yyyy-mm-dd` real calendar date; returns null for anything else. */
export function parseIsoDate(value) {
    if (typeof value !== "string" || !ISO_DATE.test(value))
        return null;
    const y = Number(value.slice(0, 4));
    const m = Number(value.slice(5, 7));
    const d = Number(value.slice(8, 10));
    if (m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m))
        return null;
    return { y, m, d, day: dayNumber(y, m, d), iso: value };
}
export function isLastDayOfMonth(date) {
    return date.d === daysInMonth(date.y, date.m);
}
/** The date `k` calendar months after `date` (any integer `k`), the day clamped to the month. */
export function addMonths(date, k) {
    const t = date.y * 12 + (date.m - 1) + k;
    const y = Math.floor(t / 12);
    const m = t - y * 12 + 1;
    return makeDate(y, m, Math.min(date.d, daysInMonth(y, m)));
}
