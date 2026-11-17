// Lexer: one left-to-right scan that splits NFKC text into alternating words and gaps
// (design "Lexer"). No regex runs over the whole string, so there is no backtracking risk.
import { fold } from "./fold.js";
const WORD_CHAR = /^[\p{L}\p{N}\p{M}]$/u;
const LETTER_OR_DIGIT = /^[\p{L}\p{N}]$/u;
const LETTER = /^\p{L}$/u;
/** Characters that join two word characters into one word (Req 3.1). */
const CONNECTORS = new Set(["&", "'", "\u2019", "-", "."]);
function isWordChar(ch) {
    return ch !== undefined && WORD_CHAR.test(ch);
}
function isLetterOrDigit(ch) {
    return ch !== undefined && LETTER_OR_DIGIT.test(ch);
}
/** Whether the character at index i of `chars` is part of a word. */
function belongsToWord(chars, i) {
    const ch = chars[i];
    if (ch === undefined)
        return false;
    if (isWordChar(ch))
        return true;
    const prev = chars[i - 1];
    const next = chars[i + 1];
    if (CONNECTORS.has(ch)) {
        return isWordChar(prev) && isLetterOrDigit(next);
    }
    if (ch === "+") {
        // A plus joins after a word character when a letter or digit follows ("DISNEY+PLUS"),
        // or when it directly follows a letter ("DISNEY+", "APPLE TV+").
        return isWordChar(prev) && (isLetterOrDigit(next) || (prev !== undefined && LETTER.test(prev)));
    }
    return false;
}
/**
 * Splits NFKC-normalized text into words and gaps. Words are runs of letters, digits and marks
 * plus the connectors that sit inside them; everything else (whitespace, punctuation, `#`,
 * emoji, control characters, lone surrogates) is a gap. Each lexeme carries its raw text and
 * its folded text.
 */
export function lex(nfkcText) {
    // Array.from splits by code point, so astral characters stay whole and lone surrogates
    // become one element each.
    const chars = Array.from(nfkcText);
    const lexemes = [];
    let run = [];
    let runIsWord = false;
    const flush = () => {
        if (run.length === 0)
            return;
        const raw = run.join("");
        lexemes.push({ kind: runIsWord ? "word" : "gap", raw, folded: fold(raw) });
        run = [];
    };
    for (let i = 0; i < chars.length; i++) {
        const inWord = belongsToWord(chars, i);
        if (run.length > 0 && inWord !== runIsWord)
            flush();
        runIsWord = inWord;
        run.push(chars[i]);
    }
    flush();
    return lexemes;
}
/** Joins the raw or folded text of tokens with single spaces. */
export function joinTokens(tokens, form) {
    return tokens.map((token) => token[form]).join(" ");
}
