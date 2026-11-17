import type { RuleContext, TokenList } from "./internal-types.js";
/** Step 3. Removes leading prefixes and processor forms and records the processor in `ctx`. */
export declare function removePrefixes(list: TokenList, ctx: RuleContext): TokenList;
