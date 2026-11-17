// Token-list helpers (design "Token list helpers"). Rules never splice arrays in a loop: each
// makes one linear pass that builds a new list, or moves a cursor over the start or end.
// Removing tokens keeps their gaps: the removed tokens' gapBefore text is merged into the next
// remaining token, so `PAYPAL 12/03 *X` still has `*` in front of `X` once the date is gone.
// When the removed tokens have no next token, their gaps are merged into the list's trailingGap.
// Every removal is logged with its reason and lexeme span; the residue builder needs the log.
//
// All functions are pure apart from appending to the caller's removal log. There is no
// module-level state.
/**
 * Builds a token list from lexemes. Each word becomes a token whose `gapBefore` is the folded
 * text of the gap lexemes in front of it (several are concatenated, though the lexer never emits
 * two gaps in a row). The gap after the last word becomes `trailingGap`. With `withSpans`
 * (pass 1) the token's span is its word lexeme's index; otherwise `span` is null.
 */
export function tokensFrom(lexemes, withSpans = true) {
    const tokens = [];
    let gap = "";
    for (let index = 0; index < lexemes.length; index++) {
        const lexeme = lexemes[index];
        if (lexeme.kind === "gap") {
            gap += lexeme.folded;
            continue;
        }
        tokens.push({
            raw: lexeme.raw,
            folded: lexeme.folded,
            gapBefore: gap,
            span: withSpans ? { first: index, last: index } : null,
        });
        gap = "";
    }
    return { tokens, trailingGap: gap };
}
/** Span covering tokens[start, end), or null if any of them has no span or the range is empty. */
export function spanOfRun(tokens, start, end) {
    const first = tokens[start]?.span;
    const last = tokens[end - 1]?.span;
    if (end <= start || first == null || last == null)
        return null;
    for (let i = start; i < end; i++) {
        if (tokens[i]?.span == null)
            return null;
    }
    return { first: first.first, last: last.last };
}
/** Copy of `token` with `gap` put in front of its own gapBefore (textual order). */
function withGapInFront(token, gap) {
    return gap === "" ? token : { ...token, gapBefore: gap + token.gapBefore };
}
/**
 * Linear filter. `decide` returns the reason to remove a token, or null to keep it. Each removed
 * token is logged on its own. The removed tokens' gaps are merged into the next kept token, in
 * text order, so that token's own gap stays last and "gap ends in `*`" checks still hold. Gaps of
 * removed tokens at the very end are merged into the front of `trailingGap`. The input is not
 * modified.
 */
export function removeTokens(list, decide, log) {
    const kept = [];
    let carriedGap = "";
    for (let i = 0; i < list.tokens.length; i++) {
        const token = list.tokens[i];
        const reason = decide(token, i);
        if (reason === null) {
            kept.push(withGapInFront(token, carriedGap));
            carriedGap = "";
        }
        else {
            log.push({ reason, span: token.span });
            carriedGap += token.gapBefore;
        }
    }
    return { tokens: kept, trailingGap: carriedGap + list.trailingGap };
}
/**
 * Removes the `count` tokens starting at `start` as one logged removal (for multi-token matches
 * such as `card ending 1234`), merging their gaps into the next remaining token, or into
 * `trailingGap` when the run reaches the end. The range is clamped to the list; an empty range
 * changes and logs nothing.
 */
export function removeRun(list, start, count, reason, log) {
    const { tokens } = list;
    const from = Math.max(0, Math.min(start, tokens.length));
    const to = Math.max(from, Math.min(start + count, tokens.length));
    if (to === from)
        return { tokens: tokens.slice(), trailingGap: list.trailingGap };
    log.push({ reason, span: spanOfRun(tokens, from, to) });
    let gap = "";
    for (let i = from; i < to; i++)
        gap += tokens[i].gapBefore;
    const next = tokens[to];
    if (next === undefined) {
        return { tokens: tokens.slice(0, from), trailingGap: gap + list.trailingGap };
    }
    return {
        tokens: [...tokens.slice(0, from), withGapInFront(next, gap), ...tokens.slice(to + 1)],
        trailingGap: list.trailingGap,
    };
}
/**
 * Leading loop. A cursor starts at 0; `step(list, cursor)` looks at the tokens from the cursor
 * on and returns the run to remove, or null to stop. Each match is logged as one removal and the
 * cursor moves past it. The tokens in front of the cursor are dropped at the end, in one slice,
 * and their gaps are merged into the first remaining token (or into `trailingGap` if none is
 * left).
 */
export function removeLeading(list, step, log) {
    const { tokens } = list;
    let cursor = 0;
    while (cursor < tokens.length) {
        const match = step(list, cursor);
        if (match === null || match.length <= 0)
            break;
        const end = Math.min(cursor + match.length, tokens.length);
        log.push({ reason: match.reason, span: spanOfRun(tokens, cursor, end) });
        cursor = end;
    }
    if (cursor === 0)
        return { tokens: tokens.slice(), trailingGap: list.trailingGap };
    let gap = "";
    for (let i = 0; i < cursor; i++)
        gap += tokens[i].gapBefore;
    const next = tokens[cursor];
    if (next === undefined)
        return { tokens: [], trailingGap: gap + list.trailingGap };
    return {
        tokens: [withGapInFront(next, gap), ...tokens.slice(cursor + 1)],
        trailingGap: list.trailingGap,
    };
}
/**
 * Trailing loop. A cursor starts at the end of the list (`end` is exclusive);
 * `step(list, end)` looks at the tokens before `end` and returns the run ending there to remove,
 * or null to stop. Each match is logged as one removal, in the order found, and the end moves
 * back. The gaps of the removed tokens are merged into the front of `trailingGap`; the kept
 * tokens are unchanged.
 */
export function removeTrailing(list, step, log) {
    const { tokens } = list;
    let end = tokens.length;
    while (end > 0) {
        const match = step(list, end);
        if (match === null || match.length <= 0)
            break;
        const start = Math.max(0, end - match.length);
        log.push({ reason: match.reason, span: spanOfRun(tokens, start, end) });
        end = start;
    }
    let gap = "";
    for (let i = end; i < tokens.length; i++)
        gap += tokens[i].gapBefore;
    return { tokens: tokens.slice(0, end), trailingGap: gap + list.trailingGap };
}
