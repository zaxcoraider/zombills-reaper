// Step 1c: match full refunds. See design.md ("Full refunds") and Req 2.4–2.7.
//
// A Credit `r` fully refunds a Charge `c` of the same Group (merchant key and currency) when
// `−r.amountCents === c.amountCents` and `r` is dated 0 to 45 days after `c`. Credits are processed
// in Content order; each takes the latest unmatched qualifying Charge, and on that date the first
// unmatched Charge in Content order. Each Charge and each Credit is matched at most once.
const REFUND_WINDOW_DAYS = 45;
function newList() {
    return { charges: [], before: [], after: [] };
}
/** Largest unmatched index ≤ i, or -1. Path compression keeps matched Charges from being rescanned. */
function findBefore(list, i) {
    let root = i;
    while (root >= 0 && list.before[root] !== root)
        root = list.before[root] ?? -1;
    let node = i;
    while (node >= 0 && list.before[node] !== node) {
        const next = list.before[node] ?? -1;
        list.before[node] = root;
        node = next;
    }
    return root;
}
/** Smallest unmatched index ≥ i, or `charges.length`. */
function findAfter(list, i) {
    const end = list.charges.length;
    let root = i;
    while (root < end && list.after[root] !== root)
        root = list.after[root] ?? end;
    let node = i;
    while (node < end && list.after[node] !== node) {
        const next = list.after[node] ?? end;
        list.after[node] = root;
        node = next;
    }
    return root;
}
/** Index of the last Charge with `day ≤ target`, or -1. */
function lastOnOrBefore(charges, target) {
    let lo = 0;
    let hi = charges.length;
    while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        const charge = charges[mid];
        if (charge !== undefined && charge.date.day <= target)
            lo = mid + 1;
        else
            hi = mid;
    }
    return lo - 1;
}
/** Index of the first Charge with `day ≥ target`. */
function firstOnOrAfter(charges, target) {
    let lo = 0;
    let hi = charges.length;
    while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        const charge = charges[mid];
        if (charge !== undefined && charge.date.day < target)
            lo = mid + 1;
        else
            hi = mid;
    }
    return lo;
}
/**
 * Returns the Charges that are fully refunded and the Credits that refund them.
 * `sorted` holds the valid entries in Content order.
 */
export function matchRefunds(sorted) {
    const refunded = new Set();
    const refunds = new Set();
    // Per Group (currency, then key; a currency has no ':', so the pair is unambiguous),
    // Charges indexed by amount. The Credits of the Group are kept in Content order.
    const groups = new Map();
    for (const entry of sorted) {
        if (entry.amountCents === 0)
            continue;
        const id = `${entry.currency}:${entry.merchant.key}`;
        let group = groups.get(id);
        if (group === undefined) {
            group = { byAmount: new Map(), credits: [] };
            groups.set(id, group);
        }
        if (entry.amountCents < 0) {
            group.credits.push(entry);
            continue;
        }
        let list = group.byAmount.get(entry.amountCents);
        if (list === undefined) {
            list = newList();
            group.byAmount.set(entry.amountCents, list);
        }
        const i = list.charges.length;
        list.charges.push(entry);
        list.before.push(i);
        list.after.push(i);
    }
    for (const group of groups.values()) {
        for (const credit of group.credits) {
            const list = group.byAmount.get(-credit.amountCents);
            if (list === undefined)
                continue;
            const day = credit.date.day;
            const last = lastOnOrBefore(list.charges, day);
            if (last < 0)
                continue;
            const latest = findBefore(list, last);
            if (latest < 0)
                continue;
            const latestCharge = list.charges[latest];
            if (latestCharge === undefined || latestCharge.date.day < day - REFUND_WINDOW_DAYS)
                continue;
            // On the latest qualifying date, take the first unmatched Charge in Content order.
            const first = findAfter(list, firstOnOrAfter(list.charges, latestCharge.date.day));
            const chosen = list.charges[first];
            if (chosen === undefined)
                continue;
            refunded.add(chosen);
            refunds.add(credit);
            list.before[first] = first - 1;
            list.after[first] = first + 1;
        }
    }
    return { refunded, refunds };
}
