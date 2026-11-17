import type { Lexeme, LexemeSpan, RemovalLog, RemovalReason, Token, TokenList } from "./internal-types.js";
/** A match found by a leading or trailing loop step: how many tokens to remove, and why. */
export interface RunMatch {
    length: number;
    reason: RemovalReason;
}
/**
 * Builds a token list from lexemes. Each word becomes a token whose `gapBefore` is the folded
 * text of the gap lexemes in front of it (several are concatenated, though the lexer never emits
 * two gaps in a row). The gap after the last word becomes `trailingGap`. With `withSpans`
 * (pass 1) the token's span is its word lexeme's index; otherwise `span` is null.
 */
export declare function tokensFrom(lexemes: readonly Lexeme[], withSpans?: boolean): TokenList;
/** Span covering tokens[start, end), or null if any of them has no span or the range is empty. */
export declare function spanOfRun(tokens: readonly Token[], start: number, end: number): LexemeSpan | null;
/**
 * Linear filter. `decide` returns the reason to remove a token, or null to keep it. Each removed
 * token is logged on its own. The removed tokens' gaps are merged into the next kept token, in
 * text order, so that token's own gap stays last and "gap ends in `*`" checks still hold. Gaps of
 * removed tokens at the very end are merged into the front of `trailingGap`. The input is not
 * modified.
 */
export declare function removeTokens(list: TokenList, decide: (token: Token, index: number) => RemovalReason | null, log: RemovalLog): TokenList;
/**
 * Removes the `count` tokens starting at `start` as one logged removal (for multi-token matches
 * such as `card ending 1234`), merging their gaps into the next remaining token, or into
 * `trailingGap` when the run reaches the end. The range is clamped to the list; an empty range
 * changes and logs nothing.
 */
export declare function removeRun(list: TokenList, start: number, count: number, reason: RemovalReason, log: RemovalLog): TokenList;
/**
 * Leading loop. A cursor starts at 0; `step(list, cursor)` looks at the tokens from the cursor
 * on and returns the run to remove, or null to stop. Each match is logged as one removal and the
 * cursor moves past it. The tokens in front of the cursor are dropped at the end, in one slice,
 * and their gaps are merged into the first remaining token (or into `trailingGap` if none is
 * left).
 */
export declare function removeLeading(list: TokenList, step: (list: TokenList, cursor: number) => RunMatch | null, log: RemovalLog): TokenList;
/**
 * Trailing loop. A cursor starts at the end of the list (`end` is exclusive);
 * `step(list, end)` looks at the tokens before `end` and returns the run ending there to remove,
 * or null to stop. Each match is logged as one removal, in the order found, and the end moves
 * back. The gaps of the removed tokens are merged into the front of `trailingGap`; the kept
 * tokens are unchanged.
 */
export declare function removeTrailing(list: TokenList, step: (list: TokenList, end: number) => RunMatch | null, log: RemovalLog): TokenList;
