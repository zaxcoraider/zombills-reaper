import type { SeparatorDetection } from "./internal-types.js";
/**
 * Decides once per statement whether amounts use "." or "," as the decimal separator.
 *
 * Looks at every non-empty cell passed in (Req 4.1), so the result depends only on the set of cells
 * and not on their order (Req 4.7). Contradicting evidence is a conflict (Req 4.5); no evidence
 * defaults to "." (Req 4.6).
 */
export declare function detectDecimalSeparator(cells: readonly string[]): SeparatorDetection;
