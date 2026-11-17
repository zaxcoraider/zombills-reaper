/** Letters that NFKD does not decompose, mapped to their ASCII spelling (lower case). */
export declare const FOLD_LETTER_MAP: Readonly<Record<string, string>>;
/**
 * Case round trip, NFKD, remove combining marks, apply the letter map, then lower-case.
 * The round trip comes first so "ẞ", "ß" and "SS" all become "ss" and iota subscripts become
 * real iotas in every case form. That makes fold(s), fold(s.toUpperCase()) and
 * fold(s.toLowerCase()) equal.
 */
export declare function fold(text: string): string;
