import type { NormalizedTransaction } from "../normalize/types.js";
import type { ComparisonCounter } from "./internal-types.js";
import type { DetectionResult, DetectOptions } from "./types.js";
/**
 * Internal entry point; not exported from `index.ts`. `counter`, when given, counts the pairwise
 * charge comparisons of steps 3–4 (Req 11.14). It is a per-call object, never module state.
 */
export declare function detectSubscriptionsCounted(transactions: readonly unknown[], options: unknown, counter: ComparisonCounter | undefined): DetectionResult;
/** Finds the subscriptions in one statement's normalized transactions. */
export declare function detectSubscriptions(transactions: readonly NormalizedTransaction[], options?: DetectOptions): DetectionResult;
