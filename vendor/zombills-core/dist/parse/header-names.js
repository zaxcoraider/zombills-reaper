// Recognition lists for header names (Req 2.1-2.4, 10.4). Entries are compared after
// `normalizeHeader`, so they are written trimmed and in lower case.
export const DATE_HEADERS = [
    "date",
    "transaction date",
    "posted date",
    "value date",
    "trans. date",
    "posting date", // added by vertical-slice
];
export const DESCRIPTION_HEADERS = [
    "description",
    "memo",
    "narrative",
    "details",
    "merchant",
    "payee",
    "transaction description",
];
export const AMOUNT_HEADERS = [
    "amount",
    "transaction amount",
    "net amount",
    "value",
];
export const DEBIT_HEADERS = [
    "debit",
    "debit amount",
    "withdrawal",
    "withdrawals",
    "paid out", // added by vertical-slice
    "money out", // added by vertical-slice
];
export const CREDIT_HEADERS = [
    "credit",
    "credit amount",
    "deposit",
    "deposits",
    "paid in", // added by vertical-slice
    "money in", // added by vertical-slice
];
export const CURRENCY_HEADERS = ["currency", "ccy"];
/** Trims surrounding whitespace and lower-cases, independent of the user's locale (Req 2.10). */
export function normalizeHeader(name) {
    return name.trim().toLowerCase();
}
/** Whether a header cell, once normalized, is one of `names`. */
export function isHeaderIn(cell, names) {
    return names.includes(normalizeHeader(cell));
}
