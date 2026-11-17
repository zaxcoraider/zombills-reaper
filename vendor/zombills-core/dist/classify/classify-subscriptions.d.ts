import type { Subscription } from "../detect/types.js";
import type { ClassifiedSubscription, UsageAnswer } from "./types.js";
/**
 * Labels each Subscription. Nested values (`charges`, `priceHistory`, `evidence`, `cancel`)
 * are shared with the input; treat results as read-only.
 */
export declare function classifySubscriptions(subscriptions: readonly Subscription[], answers?: ReadonlyMap<string, UsageAnswer>): ClassifiedSubscription[];
/** Internal. `answer` is whatever answers.get(id) returned, or undefined. */
export declare function classifyOne(subscription: Subscription, answer: unknown): ClassifiedSubscription;
/** Internal. undefined when answers is not a Map. */
export declare function answerFor(answers: unknown, id: string): unknown;
