// Builds a MerchantIdentity from a raw description.
// See .kiro/specs/merchant-normalizer/design.md ("Building the identity").
import { cleanDescription } from "./clean.js";
import { slugify, titleCase } from "./display.js";
import { joinTokens } from "./lex.js";
import { matchKnownService } from "./match-known.js";
import { unidentifiedDisplayName, unidentifiedKey } from "./unidentified.js";
/** @throws TypeError when `description` is not a string (type contract violation, Req 1.9). */
export function normalizeMerchant(description) {
    if (typeof description !== "string") {
        throw new TypeError("normalizeMerchant: description must be a string");
    }
    const result = cleanDescription(description);
    const processor = result.processor;
    const service = matchKnownService(result.context, result.cleaned.map((token) => token.folded));
    if (service !== null) {
        return {
            key: service.serviceId,
            displayName: service.displayName,
            source: "known",
            serviceId: service.serviceId,
            processor,
        };
    }
    const slug = slugify(joinTokens(result.cleaned, "folded"));
    if (slug !== "") {
        return {
            key: "merchant:" + slug,
            displayName: result.cleaned
                .map((token) => titleCase(token.raw))
                .join(" ")
                .normalize("NFC"),
            source: "generic",
            serviceId: null,
            processor,
        };
    }
    return {
        key: unidentifiedKey(processor, result.residue),
        displayName: unidentifiedDisplayName(processor),
        source: "unidentified",
        serviceId: null,
        processor,
    };
}
