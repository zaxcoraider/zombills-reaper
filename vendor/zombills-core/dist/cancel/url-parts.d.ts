/** The parts of a parsed URL that the validator reads (WHATWG URL, Req 5.4). */
export interface UrlParts {
    readonly href: string;
    readonly protocol: string;
    readonly username: string;
    readonly password: string;
    readonly port: string;
    readonly hostname: string;
    readonly search: string;
}
/** null when the WHATWG parser rejects text or text is not a string. */
export declare function parseUrl(text: unknown): UrlParts | null;
