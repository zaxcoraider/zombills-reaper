export declare const DATE_HEADERS: readonly string[];
export declare const DESCRIPTION_HEADERS: readonly string[];
export declare const AMOUNT_HEADERS: readonly string[];
export declare const DEBIT_HEADERS: readonly string[];
export declare const CREDIT_HEADERS: readonly string[];
export declare const CURRENCY_HEADERS: readonly string[];
/** Trims surrounding whitespace and lower-cases, independent of the user's locale (Req 2.10). */
export declare function normalizeHeader(name: string): string;
/** Whether a header cell, once normalized, is one of `names`. */
export declare function isHeaderIn(cell: string, names: readonly string[]): boolean;
