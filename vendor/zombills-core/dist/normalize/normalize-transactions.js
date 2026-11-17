// Normalizes every transaction of a parsed statement. Money, date and currency are copied, never read.
// See .kiro/specs/merchant-normalizer/design.md ("normalizeTransactions").
import { normalizeMerchant } from "./normalize-merchant.js";
export function normalizeTransactions(transactions) {
    // Local to the call: not module state (Req 10.4).
    const memo = new Map();
    return transactions.map((t) => {
        let merchant = memo.get(t.description);
        if (merchant === undefined) {
            merchant = normalizeMerchant(t.description);
            memo.set(t.description, merchant);
        }
        return {
            date: t.date,
            description: t.description,
            amountCents: t.amountCents,
            currency: t.currency,
            merchant: { ...merchant },
        };
    });
}
