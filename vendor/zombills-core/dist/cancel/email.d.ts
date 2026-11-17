import type { CancellationEmail, EmailInput } from "./types.js";
/** Pure and total; reads exactly the five EmailInput properties. */
export declare function cancellationEmail(input: EmailInput): CancellationEmail;
/** "mailto:?subject=…&body=…" with CRLF line breaks; never throws. */
export declare function mailtoHref(email: CancellationEmail): string;
