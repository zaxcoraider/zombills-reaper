/** Which cell of a row an unparseable value came from. */
export type ParseErrorField = "date" | "description" | "amount" | "debit" | "credit" | "currency";
/**
 * Signals an unparseable value. Thrown by leaf parsers and caught only by `tryParseAmount` and the
 * row builder. It never escapes `parseStatement`.
 */
export declare class ParseError extends Error {
    readonly field: ParseErrorField;
    constructor(field: ParseErrorField, message: string);
}
