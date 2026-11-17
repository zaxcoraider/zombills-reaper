import type { Lexeme, Token } from "./internal-types.js";
/**
 * Splits NFKC-normalized text into words and gaps. Words are runs of letters, digits and marks
 * plus the connectors that sit inside them; everything else (whitespace, punctuation, `#`,
 * emoji, control characters, lone surrogates) is a gap. Each lexeme carries its raw text and
 * its folded text.
 */
export declare function lex(nfkcText: string): Lexeme[];
/** Joins the raw or folded text of tokens with single spaces. */
export declare function joinTokens(tokens: readonly Pick<Token, "raw" | "folded">[], form: "raw" | "folded"): string;
