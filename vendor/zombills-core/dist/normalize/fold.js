// Folding: the comparison form used for matching and keys (glossary "Folding", Req 2.1).
// Locale-independent: only normalize(), toUpperCase() and toLowerCase().
/** Letters that NFKD does not decompose, mapped to their ASCII spelling (lower case). */
export const FOLD_LETTER_MAP = Object.freeze({
    ø: "o",
    Ø: "o",
    æ: "ae",
    Æ: "ae",
    œ: "oe",
    Œ: "oe",
    ł: "l",
    Ł: "l",
    đ: "d",
    Đ: "d",
    ð: "d",
    Ð: "d",
    þ: "th",
    Þ: "th",
});
const COMBINING_MARKS = /\p{M}/gu;
const MAPPED_LETTERS = /[øØæÆœŒłŁđĐðÐþÞ]/g;
/**
 * Case round trip, NFKD, remove combining marks, apply the letter map, then lower-case.
 * The round trip comes first so "ẞ", "ß" and "SS" all become "ss" and iota subscripts become
 * real iotas in every case form. That makes fold(s), fold(s.toUpperCase()) and
 * fold(s.toLowerCase()) equal.
 */
export function fold(text) {
    return text
        .toLowerCase()
        .toUpperCase()
        .toLowerCase()
        .normalize("NFKD")
        .replace(COMBINING_MARKS, "")
        .replace(MAPPED_LETTERS, (letter) => FOLD_LETTER_MAP[letter] ?? letter)
        .toLowerCase();
}
