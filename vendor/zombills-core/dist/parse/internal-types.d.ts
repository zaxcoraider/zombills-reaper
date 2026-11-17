import type { DateFormatInfo } from "./types.js";
export type DecimalSeparator = "." | ",";
export type Layout = "signed-amount" | "debit-credit";
export type Delimiter = "," | ";" | "\t";
export interface ParsedTable {
    rows: string[][];
    delimiter: Delimiter;
}
/** Column indices into a row's cells. `currency` is null when the statement has no currency column. */
export type ResolvedColumns = {
    layout: "signed-amount";
    date: number;
    description: number;
    amount: number;
    currency: number | null;
} | {
    layout: "debit-credit";
    date: number;
    description: number;
    debit: number;
    credit: number;
    currency: number | null;
};
export interface DataRow {
    /** 1-based ordinal among data rows; becomes RowError.rowIndex */
    ordinal: number;
    cells: string[];
}
export type AmountOutcome = {
    ok: true;
    cents: number;
} | {
    ok: false;
    reason: string;
};
export type DateDetection = {
    kind: "detected";
    info: DateFormatInfo;
} | {
    kind: "none";
} | {
    kind: "conflict";
    reason: string;
};
export type SeparatorDetection = {
    kind: "detected";
    separator: DecimalSeparator;
} | {
    kind: "conflict";
    reason: string;
};
