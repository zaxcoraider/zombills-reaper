/**
 * Fixed word lists used by the noise-removal rules (Req 3.2, 3.5, 3.7).
 * Everything here is in folded form and deep-frozen.
 */
import type { ProcessorId } from "./types.js";
/**
 * Card, POS and debit prefixes (Req 3.2) as folded token sequences.
 * Sorted longest first (token count, then character count) so the first
 * match found is the longest. `sepa-lastschrift` is one token because the
 * lexer keeps `-` inside a word.
 */
export declare const CARD_PREFIXES: readonly (readonly string[])[];
/** English three-letter month abbreviations (Req 3.5). */
export declare const MONTHS: readonly string[];
/**
 * Top-level domains recognised in domain tokens (Req 3.7 list plus `ca`, `au`,
 * `ch`, `at`, `se`, `ie`, `be`, `info`). Two-label entries are dot-joined.
 */
export declare const TLDS: readonly string[];
/** US state and territory codes: 50 states, DC, PR, GU, VI, AS, MP. */
export declare const US_STATE_CODES: readonly string[];
/** Canadian province and territory codes (10 provinces, 3 territories). */
export declare const CA_PROVINCE_CODES: readonly string[];
/** ISO 3166-1 alpha-2 country codes, lower case, alphabetical. */
export declare const ISO_COUNTRY_CODES: readonly string[];
/**
 * Location tokens stripped from the end of a descriptor: US states, Canadian
 * provinces, ISO country codes and `usa`, de-duplicated.
 */
export declare const LOCATION_CODES: readonly string[];
/**
 * One leading payment-processor form (Req 3.4, design step 3).
 *
 * - `tokens`: the folded leading tokens of the form.
 * - `link`: the gap required between its tokens. `"space"` means whitespace
 *   only; `"slash"` means exactly `/`. Ignored for one-token forms.
 * - `after`: what the gap after the last token must contain. `"asterisk"`
 *   needs a `*`, `"underscore-asterisk"` needs both `_` and `*`, `"none"`
 *   needs nothing. The `*` forms can only match in pass 1, because later
 *   passes see single-space gaps.
 * - `countryCode`: the form may also consume a following 2-letter ISO 3166-1
 *   code, under the conditions in design step 3 (Amazon Marketplace only).
 */
export interface ProcessorForm {
    readonly processor: ProcessorId;
    readonly tokens: readonly string[];
    readonly link: "space" | "slash";
    readonly after: "asterisk" | "underscore-asterisk" | "none";
    readonly countryCode: boolean;
}
/**
 * Processor forms of Req 3.4, multi-token forms first. Forms that need a `*`
 * never match without it, so `GOOGLE STORAGE` and `SQUARESPACE` stay merchant
 * text. `ZETTLE_*` is listed before `IZ *`; both record `zettle`.
 */
export declare const PROCESSOR_FORMS: readonly ProcessorForm[];
/** Processor display names used in unidentified display names (Req 6.4). */
export declare const PROCESSOR_NAMES: Readonly<Record<ProcessorId, string>>;
