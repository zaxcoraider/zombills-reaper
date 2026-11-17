import Papa from "papaparse";
import { isBlankRow } from "./blank-row.js";
import { detectHeaderRow } from "./header-detect.js";
const BYTE_ORDER_MARK = "\uFEFF";
const DELIMITERS_TO_GUESS = [",", ";", "\t"];
function isDelimiter(value) {
    return value === "," || value === ";" || value === "\t";
}
/** Removes one leading UTF-8 byte order mark (U+FEFF), if present. */
export function stripBom(csv) {
    return csv.startsWith(BYTE_ORDER_MARK) ? csv.slice(1) : csv;
}
export { isBlankRow };
/**
 * How well a delimiter splits the file, compared field by field:
 * 1. whether a header row with a known column name (Req 11.1) shows up in the first 20 rows;
 * 2. how many non-blank rows have the most common width among rows split into two or more cells;
 * 3. how many non-blank rows it splits into two or more cells at all.
 * Ties go to Papa Parse's own guess.
 *
 * The right delimiter turns the header into separate, recognisable cells and splits every data
 * row the same way. A wrong delimiter that only occurs in some rows (a decimal comma in a
 * semicolon file) agrees on fewer rows, and one that cuts rows apart at quoted line breaks it
 * cannot see agrees on even fewer. Narrow preamble rows above the header do not count against the
 * right delimiter.
 */
function splitQuality(rows) {
    const widthCounts = new Map();
    let wide = 0;
    for (const row of rows) {
        if (row.length >= 2 && !isBlankRow(row)) {
            wide += 1;
            widthCounts.set(row.length, (widthCounts.get(row.length) ?? 0) + 1);
        }
    }
    let modalCount = 0;
    for (const count of widthCounts.values()) {
        modalCount = Math.max(modalCount, count);
    }
    const knownHeader = detectHeaderRow(rows) === null ? 0 : 1;
    return [knownHeader, modalCount, wide];
}
function isBetter(candidate, best) {
    for (let i = 0; i < candidate.length; i += 1) {
        const a = candidate[i] ?? 0;
        const b = best[i] ?? 0;
        if (a !== b) {
            return a > b;
        }
    }
    return false;
}
/**
 * Splits CSV text into rows and cells with Papa Parse. All cells stay strings and blank rows are
 * kept, so the caller applies its own blank-row rule.
 *
 * The delimiter is one of comma, semicolon and tab. Papa Parse guesses it first. That guess only
 * looks at the first ten rows and prefers the most consistent row width, so a file with narrow
 * preamble lines above a wide header can be misread. The guess is therefore checked against the
 * whole file: each of the three delimiters is tried with Papa Parse, and the one that splits the
 * file best wins. Papa Parse's own guess wins ties, and comma is the fallback when nothing splits
 * any row.
 *
 * Papa Parse problems (for example unbalanced quotes) are not fatal here. They surface later as
 * row errors on the affected rows.
 */
export function tokenize(csv) {
    // No worker and no download: Papa Parse runs synchronously on the string, so none of its
    // network, file or Web Worker code paths are reachable.
    const baseConfig = {
        header: false,
        dynamicTyping: false,
        skipEmptyLines: false,
        worker: false,
        download: false,
    };
    const guessed = Papa.parse(csv, {
        ...baseConfig,
        delimiter: "",
        delimitersToGuess: DELIMITERS_TO_GUESS,
    });
    const papaChoice = isDelimiter(guessed.meta.delimiter) ? guessed.meta.delimiter : ",";
    let best = { rows: guessed.data, delimiter: papaChoice };
    let bestQuality = splitQuality(guessed.data);
    for (const delimiter of DELIMITERS_TO_GUESS) {
        if (delimiter === papaChoice) {
            continue;
        }
        const rows = Papa.parse(csv, { ...baseConfig, delimiter }).data;
        const quality = splitQuality(rows);
        if (isBetter(quality, bestQuality)) {
            best = { rows, delimiter };
            bestQuality = quality;
        }
    }
    return best;
}
/** Re-serialises a row with the given delimiter, quoting cells where needed. Used for `RowError.rawRow`. */
export function serializeRow(cells, delimiter) {
    return Papa.unparse([cells], { delimiter });
}
