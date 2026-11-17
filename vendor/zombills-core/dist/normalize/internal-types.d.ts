import type { ProcessorId } from "./types.js";
/** Output of the lexer. Words and gaps alternate; either may come first. */
export type Lexeme = {
    kind: "word";
    raw: string;
    folded: string;
} | {
    kind: "gap";
    raw: string;
    folded: string;
};
/** A word as the cleaning rules see it. */
export interface Token {
    raw: string;
    folded: string;
    /** Folded text of every gap between the previous remaining token and this one (merged on removal) */
    gapBefore: string;
    /** Index range of the lexemes this token came from (pass 1); null in later passes */
    span: {
        first: number;
        last: number;
    } | null;
}
/**
 * The tokens of one pass plus the folded gap text after the last word. Rules need that gap for
 * "token is last and its trailing gap contains `*`" (the PayPal form in design step 3).
 */
export interface TokenList {
    tokens: readonly Token[];
    /** Folded text of the gap after the last remaining token ("" when there is none) */
    trailingGap: string;
}
export type RemovalReason = "card-number" | "date" | "prefix" | "processor" | "phone" | "domain" | "reference" | "store-number" | "trailing";
/** Index range of lexemes, as stored on a Token. */
export type LexemeSpan = NonNullable<Token["span"]>;
/** One logged removal. `span` is null when the removed tokens carry no spans (later passes). */
export interface RemovalRecord {
    reason: RemovalReason;
    span: LexemeSpan | null;
}
/** The removal log of one cleaning run. Rules append to it; nothing reads it back mid-pass. */
export type RemovalLog = RemovalRecord[];
export interface CleanResult {
    /** Tokens of the Cleaned name */
    cleaned: readonly Token[];
    /** Folded tokens after steps 1-5 of pass 1 (Req 4.5) */
    context: readonly string[];
    processor: ProcessorId | null;
    /** Unidentified residue (glossary); "" when nothing is left */
    residue: string;
    /** Number of passes run, for tests and diagnostics */
    passes: number;
}
/**
 * What every cleaning rule receives next to the token list (design "Cleaning engine"). A rule is
 * `(list, ctx) => list`: it returns a new list and appends its removals to `ctx.log`.
 */
export interface RuleContext {
    /** True in pass 1, where the original gap characters (`/`, `#`, `*`, `://`) still exist */
    firstPass: boolean;
    /** The ProcessorId recorded so far, or null */
    processor: ProcessorId | null;
    /** Removal log of the current cleaning run */
    log: RemovalLog;
}
