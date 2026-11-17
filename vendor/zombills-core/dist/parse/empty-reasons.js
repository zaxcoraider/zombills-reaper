// Reasons `parseStatement` gives for input with nothing to parse. Exported so callers can tell an
// empty statement from other parse errors by comparing against these constants.
export const EMPTY_CSV_REASON = "The CSV is empty";
export const NO_CONTENT_ROWS_REASON = "The CSV has no rows with content";
