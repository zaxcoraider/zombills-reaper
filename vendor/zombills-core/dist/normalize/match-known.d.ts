import type { KnownService } from "./types.js";
/**
 * Finds the Known service for a description. `context` and `cleaned` are folded token lists.
 * Contains variants match in either list; exact variants match the whole cleaned text.
 * The longest variant text wins, then the lowest service index, then the lowest variant index.
 */
export declare function matchKnownService(context: readonly string[], cleaned: readonly string[]): KnownService | null;
