// Key and display name for merchants that cannot be identified.
// See .kiro/specs/merchant-normalizer/design.md ("Identity builder").
import { PROCESSOR_NAMES } from "./noise-lists.js";
export function unidentifiedKey(processor, residue) {
    return "unidentified:" + (processor ?? "none") + ":" + (residue || "-");
}
export function unidentifiedDisplayName(processor) {
    if (processor === null)
        return "Unknown merchant";
    return PROCESSOR_NAMES[processor] + " payment (merchant not shown)";
}
