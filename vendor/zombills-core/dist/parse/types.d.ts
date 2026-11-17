export type DateFormat = "yyyy-mm-dd" | "dd/mm/yyyy" | "mm/dd/yyyy" | "dd.mm.yyyy" | "dd-mm-yyyy";
export type SignConvention = "positive-out" | "negative-out";
export interface Transaction {
    /** ISO yyyy-mm-dd */
    date: string;
    /** Trimmed, non-empty */
    description: string;
    /** Integer cents. Positive = money out, negative = money in, 0 allowed. */
    amountCents: number;
    /** ISO 4217 alpha-3, upper case, e.g. "USD" */
    currency: string;
}
export interface RowError {
    /** 1-based ordinal among data rows (blank rows are not counted). */
    rowIndex: number;
    /** The row's cells re-serialised with the detected delimiter. */
    rawRow: string;
    /** "<field>: <why>" entries joined with "; " */
    reason: string;
}
export interface DateFormatInfo {
    format: DateFormat;
    /** true when the format could not be disambiguated from the data and a default was applied */
    assumed: boolean;
}
export interface SignConventionInfo {
    convention: SignConvention;
    /** true when positive and negative non-zero counts were equal and the default was applied */
    assumed: boolean;
}
/**
 * Column names as they appear in MappingRequiredResult.columns (exact, untrimmed).
 * Every field is optional at the type level because the UI may submit an incomplete map;
 * completeness is checked at runtime (Req 9.4).
 */
export interface ColumnMap {
    date?: string;
    description?: string;
    amount?: string;
    debit?: string;
    credit?: string;
    currency?: string;
}
export type ColumnRole = keyof ColumnMap;
export interface ColumnMapValidationError {
    role: ColumnRole;
    /** The offending column name, or null when the role was omitted. */
    column: string | null;
    problem: "missing-mapping" | "unknown-column";
}
export interface ParseOptions {
    columnMap?: ColumnMap;
    /** ISO 4217 alpha-3, matched case-insensitively and normalised to upper case; default "USD" */
    currency?: string;
    /** Overrides auto-detection for the signed-amount layout */
    signConvention?: SignConvention;
}
/** How the statement currency was decided (Req 10.7-10.9). */
export type CurrencySource = "option" | "column" | "symbol" | "default";
export interface CurrencyInfo {
    /** Upper-case ISO 4217 alpha-3 code: the currency of every row without one of its own */
    code: string;
    source: CurrencySource;
}
export interface MappedResult {
    status: "mapped";
    transactions: Transaction[];
    rowErrors: RowError[];
    /** null only when no date cell matched any supported format (Req 3.9) */
    detectedDateFormat: DateFormatInfo | null;
    /** null for the debit/credit layout, where no sign convention applies */
    detectedSignConvention: SignConventionInfo | null;
    /** Always present: lets the UI say where the currency came from and offer an override */
    detectedCurrency: CurrencyInfo;
}
export interface MappingRequiredResult {
    status: "mapping-required";
    columns: string[];
    validationErrors?: ColumnMapValidationError[];
    /** Always empty: no data rows are read before mapping is resolved */
    rowErrors: RowError[];
}
export interface ErrorResult {
    status: "error";
    reason: string;
}
export type ParseResult = MappedResult | MappingRequiredResult | ErrorResult;
