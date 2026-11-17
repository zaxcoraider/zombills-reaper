const CHECKED_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const FLOOR_DATE = "2025-01-01";
/** yyyy-mm-dd, a real proleptic Gregorian date, not before 2025-01-01 (Req 6.7). */
export function isCheckedDate(value) {
    if (typeof value !== "string")
        return false;
    const m = CHECKED_DATE.exec(value);
    if (m === null)
        return false;
    const year = Number(m[1]);
    const month = Number(m[2]);
    const day = Number(m[3]);
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (month < 1 || month > 12)
        return false;
    const last = days[month - 1];
    if (last === undefined || day < 1 || day > last)
        return false;
    return value >= FLOOR_DATE;
}
