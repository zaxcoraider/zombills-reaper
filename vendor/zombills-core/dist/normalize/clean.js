// Pass loop, context snapshot and residue (design "Pass loop and residue", Req 3.1-3.11, 6.2).
//
// Pass 1 runs on the lexed original text, where the gap characters (`/`, `#`, `*`, `://`) still
// exist. Later passes run on the space-joined raw output of the previous pass and stop once the
// folded output no longer changes. Realistic descriptions need 2 passes: one that cleans and one
// that confirms. Every pass that changes anything makes the text shorter, so the loop ends.
import { joinTokens, lex } from "./lex.js";
import { removeCardNumbers } from "./rule-card-numbers.js";
import { removeDates } from "./rule-dates.js";
import { removeDomains } from "./rule-domains.js";
import { removePhones } from "./rule-phones.js";
import { removePrefixes } from "./rule-prefixes.js";
import { removeReferences, removeStoreNumbers } from "./rule-references.js";
import { removeTrailingCodes } from "./rule-trailing.js";
import { tokensFrom } from "./token-list.js";
const WHITESPACE_RUN = /[\s\p{Z}]+/gu;
const FOUR_DIGITS = /^[0-9]{4}$/u;
const OPENING_MARKS = /[(+#]+$/u;
const TRAILING_STARS = /\*+$/u;
/** Removal reasons that are left out of the Unidentified residue (Req 6.2). */
const RESIDUE_REASONS = new Set(["prefix", "card-number", "date"]);
/**
 * Runs steps 1-8 once. Step 3 records the processor in `ctx`. In pass 1 the folded tokens after
 * step 5 are returned as the context snapshot.
 */
function runPass(input, ctx) {
    let list = removeCardNumbers(input, ctx); // step 1
    list = removeDates(list, ctx); // step 2
    list = removePrefixes(list, ctx); // step 3
    list = removePhones(list, ctx); // step 4
    list = removeDomains(list, ctx); // step 5
    const context = ctx.firstPass ? list.tokens.map((token) => token.folded) : [];
    list = removeStoreNumbers(list, ctx); // step 6, before references so `STORE 1234` goes as a pair
    list = removeReferences(list, ctx); // step 7
    list = removeTrailingCodes(list, ctx); // step 8
    return { list, context };
}
/**
 * Unidentified residue (Req 6.2): the pass-1 lexemes without the spans removed for prefixes,
 * masked card numbers and dates, each together with the gap lexeme right after it. The rest is
 * concatenated in folded form, whitespace runs collapse to one space, and the ends are trimmed.
 */
function buildResidue(lexemes, log) {
    const dropped = new Array(lexemes.length).fill(false);
    const texts = lexemes.map((lexeme) => lexeme.folded);
    for (const record of log) {
        if (!RESIDUE_REASONS.has(record.reason) || record.span === null)
            continue;
        for (let i = record.span.first; i <= record.span.last; i++)
            dropped[i] = true;
        // Words and gaps alternate, so a lexeme right after a span is a gap.
        const after = record.span.last + 1;
        // The gap goes, except for the characters that open the next word (`(800)`, `+44`, `#0412`).
        if (after < lexemes.length) {
            texts[after] = (lexemes[after].folded.match(OPENING_MARKS) ?? [""])[0];
        }
        // `****1234`: the stars that made the 4 digits a masked card number belong to it.
        const before = record.span.first - 1;
        if (record.reason === "card-number" &&
            record.span.first === record.span.last &&
            before >= 0 &&
            FOUR_DIGITS.test(lexemes[record.span.first].folded)) {
            texts[before] = texts[before].replace(TRAILING_STARS, "");
        }
    }
    let text = "";
    for (let i = 0; i < lexemes.length; i++) {
        if (!dropped[i])
            text += texts[i];
    }
    return text.replace(WHITESPACE_RUN, " ").trim();
}
export function cleanDescription(description) {
    const lexemes = lex(description.normalize("NFKC"));
    const firstLog = [];
    const ctx = { firstPass: true, processor: null, log: firstLog };
    const first = runPass(tokensFrom(lexemes), ctx);
    let previous = first.list.tokens;
    let passes = 1;
    for (;;) {
        const later = { firstPass: false, processor: ctx.processor, log: [] };
        const next = runPass(tokensFrom(lex(joinTokens(previous, "raw")), false), later);
        passes++;
        const unchanged = joinTokens(next.list.tokens, "folded") === joinTokens(previous, "folded");
        previous = next.list.tokens;
        if (unchanged)
            break;
    }
    return {
        cleaned: previous,
        context: first.context,
        processor: ctx.processor,
        residue: buildResidue(lexemes, firstLog),
        passes,
    };
}
