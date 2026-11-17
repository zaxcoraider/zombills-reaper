// Step 2: Groups and Amount bands. See design.md ("Groups and Amount bands") and Req 2.2, 3.1, 3.2.
/**
 * Builds the Groups, keyed by merchant key and currency, in Content order of the first entry each
 * Group holds. A Group holds its live Charges, its Zero-amount rows and its `"money-in"` Credits,
 * each in Content order. Fully refunded Charges and the Credits that refunded them are left out
 * (a Group that would hold only such entries is not created). `sorted` is in Content order.
 * Each Group's `bands` come from `splitIntoBands` over its Charges.
 */
export function groupCharges(sorted, refunded, refunds) {
    const groups = new Map();
    for (const entry of sorted) {
        if (refunded.has(entry) || refunds.has(entry))
            continue;
        const id = `${entry.merchant.key}\u0000${entry.currency}`;
        let group = groups.get(id);
        if (group === undefined) {
            group = {
                key: entry.merchant.key,
                currency: entry.currency,
                source: entry.merchant.source,
                charges: [],
                zeroRows: [],
                moneyIn: [],
                bands: [],
            };
            groups.set(id, group);
        }
        if (entry.amountCents > 0)
            group.charges.push(entry);
        else if (entry.amountCents === 0)
            group.zeroRows.push(entry);
        else
            group.moneyIn.push(entry);
    }
    const result = [...groups.values()];
    for (const group of result)
        group.bands = splitIntoBands(group.charges);
    return result;
}
/**
 * Splits Charges into Amount bands (Req 3.2). The smallest amount `m` not yet in a band starts a
 * band, and every larger amount `a` with `(a − m) × 20 ≤ m` joins it. The test is written as
 * `a − m ≤ (m − m % 20) / 20`, which is equivalent for integers and never leaves the safe range.
 * Bands get ids 0, 1, … in ascending `low`; each holds its Charges in the order given.
 */
export function splitIntoBands(charges) {
    const amounts = [...new Set(charges.map((c) => c.amountCents))].sort((a, b) => a - b);
    const bandOf = new Map();
    const bands = [];
    let i = 0;
    while (i < amounts.length) {
        const m = amounts[i];
        const limit = (m - (m % 20)) / 20;
        const band = { id: bands.length, low: m, high: m, charges: [] };
        let j = i;
        while (j < amounts.length && amounts[j] - m <= limit) {
            const a = amounts[j];
            band.high = a;
            bandOf.set(a, band);
            j++;
        }
        bands.push(band);
        i = j;
    }
    for (const charge of charges)
        bandOf.get(charge.amountCents)?.charges.push(charge);
    return bands;
}
