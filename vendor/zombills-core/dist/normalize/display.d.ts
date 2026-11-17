/** Replace each run of non-letter, non-digit characters with "-" and trim the ends. */
export declare function slugify(foldedText: string): string;
/**
 * Upper-case initial letters (the first letter or digit of the token, or a letter
 * right after "-") and lower-case the rest. An initial letter whose upper-case form
 * is more than one code point (ß → SS) is left unchanged, which keeps the function
 * idempotent (Req 9.5).
 */
export declare function titleCase(rawToken: string): string;
