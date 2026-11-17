// Step 2: dates (design "Step 2", Req 3.5). A date is removed only when at least one reading has
// day 1-31 and month 1-12. Forms: ISO, dot, dash, slash (pass 1 only: it needs the `/` gap),
// month joined to a day, and month separated from a day by whitespace (stack scan).
// One left-to-right scan builds the new list; the gaps of removed tokens are merged into the next
// kept token (or into trailingGap).
import { MONTHS } from "./noise-lists.js";
import { spanOfRun } from "./token-list.js";
const ISO_DATE = /^[0-9]{4}-([0-9]{1,2})-([0-9]{1,2})$/u;
const DOT_DATE = /^([0-9]{1,2})\.([0-9]{1,2})(?:\.(?:[0-9]{2}|[0-9]{4}))?$/u;
const DASH_DATE = /^([0-9]{1,2})-([0-9]{1,2})$/u;
const DAY_THEN_MONTH = /^([0-9]{1,2})([a-z]{3})$/u;
const MONTH_THEN_DAY = /^([a-z]{3})([0-9]{1,2})$/u;
const ONE_OR_TWO_DIGITS = /^[0-9]{1,2}$/u;
const YEAR_PART = /^(?:[0-9]{2}|[0-9]{4})$/u;
const WHITESPACE_ONLY = /^\s+$/u;
const MONTH_SET = new Set(MONTHS);
function isDay(text) {
    if (!ONE_OR_TWO_DIGITS.test(text))
        return false;
    const value = Number(text);
    return value >= 1 && value <= 31;
}
function isMonthNumber(text) {
    if (!ONE_OR_TWO_DIGITS.test(text))
        return false;
    const value = Number(text);
    return value >= 1 && value <= 12;
}
/** `day` and `month` are digit strings of 1-2 digits. */
function isDayMonth(day, month) {
    return day !== undefined && month !== undefined && isDay(day) && isMonthNumber(month);
}
/** True when the word alone is a date: ISO, dot, dash, or a month joined to a day. */
function isSingleTokenDate(folded) {
    const iso = ISO_DATE.exec(folded);
    if (iso !== null)
        return isDayMonth(iso[2], iso[1]);
    const dot = DOT_DATE.exec(folded);
    if (dot !== null)
        return isDayMonth(dot[1], dot[2]);
    const dash = DASH_DATE.exec(folded);
    if (dash !== null)
        return isDayMonth(dash[1], dash[2]);
    const dayMonth = DAY_THEN_MONTH.exec(folded);
    if (dayMonth !== null)
        return isDay(dayMonth[1]) && MONTH_SET.has(dayMonth[2]);
    const monthDay = MONTH_THEN_DAY.exec(folded);
    if (monthDay !== null)
        return isDay(monthDay[2]) && MONTH_SET.has(monthDay[1]);
    return false;
}
/**
 * Length (2 or 3) of a slash date `d/m` or `d/m/yy[yy]` starting at `index`, or 0. The 3-part
 * shape is tried first; the first two parts must read as dd/mm or mm/dd.
 */
function slashDateLength(tokens, index) {
    const first = tokens[index];
    const second = tokens[index + 1];
    if (first === undefined || second === undefined || second.gapBefore !== "/")
        return 0;
    if (!ONE_OR_TWO_DIGITS.test(first.folded) || !ONE_OR_TWO_DIGITS.test(second.folded))
        return 0;
    if (!isDayMonth(first.folded, second.folded) && !isDayMonth(second.folded, first.folded)) {
        return 0;
    }
    const third = tokens[index + 2];
    if (third !== undefined && third.gapBefore === "/" && YEAR_PART.test(third.folded))
        return 3;
    return 2;
}
/** `12 JAN` or `JAN 12`: one day word and one month word. */
function isSpacedMonthPair(top, current) {
    return (isDay(top) && MONTH_SET.has(current)) || (MONTH_SET.has(top) && isDay(current));
}
export function removeDates(list, ctx) {
    const { tokens } = list;
    // The output doubles as the stack for the spaced month forms.
    const out = [];
    let carried = "";
    let i = 0;
    while (i < tokens.length) {
        const original = tokens[i];
        const gap = carried + original.gapBefore;
        carried = "";
        const token = gap === original.gapBefore ? original : { ...original, gapBefore: gap };
        if (isSingleTokenDate(token.folded)) {
            ctx.log.push({ reason: "date", span: token.span });
            carried = gap;
            i++;
            continue;
        }
        const slash = ctx.firstPass ? slashDateLength(tokens, i) : 0;
        if (slash > 0) {
            ctx.log.push({ reason: "date", span: spanOfRun(tokens, i, i + slash) });
            carried = gap;
            for (let j = 1; j < slash; j++)
                carried += tokens[i + j].gapBefore;
            i += slash;
            continue;
        }
        const top = out[out.length - 1];
        if (top !== undefined &&
            WHITESPACE_ONLY.test(gap) &&
            isSpacedMonthPair(top.folded, token.folded)) {
            out.pop();
            ctx.log.push({
                reason: "date",
                span: top.span !== null && token.span !== null
                    ? { first: top.span.first, last: token.span.last }
                    : null,
            });
            carried = top.gapBefore + gap;
            i++;
            continue;
        }
        out.push(token);
        i++;
    }
    return { tokens: out, trailingGap: carried + list.trailingGap };
}
