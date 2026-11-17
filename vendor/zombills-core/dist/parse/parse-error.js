/**
 * Signals an unparseable value. Thrown by leaf parsers and caught only by `tryParseAmount` and the
 * row builder. It never escapes `parseStatement`.
 */
export class ParseError extends Error {
    field;
    constructor(field, message) {
        super(message);
        this.name = "ParseError";
        this.field = field;
    }
}
