/** Replaces each lone surrogate with U+FFFD; surrogate pairs stay. */
export declare function toWellFormedText(s: string): string;
/** Cleans one text field for the email: repairs surrogates, folds separators, cuts to 80 code points. */
export declare function cleanField(value: unknown): string;
