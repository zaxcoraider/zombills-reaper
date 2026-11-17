import type { PricePoint, Subscription } from "../detect/types.js";
import type { TrialDetails } from "./types.js";
/**
 * The trial details of `subscription`, or null when it is not a trial trap. `inferred` is the
 * Inferred intro charge from `findInferredIntro`. The caller has already checked that the
 * subscription is Eligible.
 */
export declare function findTrial(subscription: Subscription, inferred: PricePoint | null): TrialDetails | null;
