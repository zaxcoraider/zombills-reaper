import type { RuleContext, TokenList } from "./internal-types.js";
/** Reference number test of Req 3.8, on a folded word. */
export declare function isReferenceToken(text: string): boolean;
/** Step 7: removes reference numbers anywhere. Runs after removeStoreNumbers. */
export declare function removeReferences(list: TokenList, ctx: RuleContext): TokenList;
/** Step 6: removes `#ddd` (pass 1) and the pairs `store ddd`, `no ddd`, `nr ddd`. */
export declare function removeStoreNumbers(list: TokenList, ctx: RuleContext): TokenList;
