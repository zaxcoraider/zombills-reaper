import { AMOUNT_HEADERS, CREDIT_HEADERS, CURRENCY_HEADERS, DATE_HEADERS, DEBIT_HEADERS, DESCRIPTION_HEADERS, isHeaderIn, normalizeHeader, } from "./header-names.js";
/** Index of the leftmost header cell that is one of `names` once normalized, or null. */
function leftmostMatch(header, names) {
    const index = header.findIndex((cell) => isHeaderIn(cell, names));
    return index >= 0 ? index : null;
}
/**
 * Index of the header cell whose normalized name comes earliest in `names`, leftmost among cells
 * with the same name, or null when no cell is named in `names`.
 */
function firstByListOrder(header, names) {
    let best = null;
    let bestRank = names.length;
    for (let index = 0; index < header.length; index += 1) {
        const rank = names.indexOf(normalizeHeader(header[index] ?? ""));
        if (rank >= 0 && rank < bestRank) {
            best = index;
            bestRank = rank;
        }
    }
    return best;
}
/**
 * Index of the currency column: the leftmost header named `currency` or `ccy`, ignoring case and
 * surrounding whitespace (Req 10.4), or null when the statement has none.
 */
export function findCurrencyColumn(header) {
    return leftmostMatch(header, CURRENCY_HEADERS);
}
/**
 * Works out which column holds what from the header names alone (Req 2.1-2.7, 2.10).
 *
 * Each role takes the leftmost matching header, except the description: it takes the header whose
 * name comes earliest in `DESCRIPTION_HEADERS` (leftmost among equal names), so `Description` beats
 * `Details` or `Memo` wherever they sit (Req 11.7). A statement with both a debit and a credit column
 * uses the debit/credit layout even when it also has an amount column (Req 2.5); otherwise an
 * amount column selects the signed layout.
 *
 * @returns the resolved columns, or null when the date, the description or the amount columns
 *   cannot all be found, so the caller asks the user for a mapping.
 */
export function autoDetectColumns(header) {
    const date = leftmostMatch(header, DATE_HEADERS);
    const description = firstByListOrder(header, DESCRIPTION_HEADERS);
    if (date === null || description === null) {
        return null;
    }
    const currency = findCurrencyColumn(header);
    const debit = leftmostMatch(header, DEBIT_HEADERS);
    const credit = leftmostMatch(header, CREDIT_HEADERS);
    if (debit !== null && credit !== null) {
        return { layout: "debit-credit", date, description, debit, credit, currency };
    }
    const amount = leftmostMatch(header, AMOUNT_HEADERS);
    if (amount !== null) {
        return { layout: "signed-amount", date, description, amount, currency };
    }
    return null;
}
/**
 * Checks a user-supplied column map against the header cells and turns it into column indices
 * (Req 2.8, 2.9, 9.3-9.5). Auto-detection does not run.
 *
 * The layout follows from the map: setting `debit` or `credit` selects debit/credit, which then
 * needs `date`, `description`, `debit` and `credit`. Otherwise the signed layout needs `date`,
 * `description` and `amount`. An `amount` given next to both `debit` and `credit` is ignored.
 *
 * Names are matched exactly against the raw header cells, which are the strings the caller
 * received in `columns`; with duplicate names the leftmost column wins. Every problem is
 * collected, one per role, before returning. The optional `currency` role is checked only when it
 * is set; when it is not, a column named `currency` or `ccy` is used if the statement has one.
 *
 * Pure: it reads its arguments and nothing else, so a rejected map changes no state (Req 9.5).
 */
export function resolveColumnMap(header, map) {
    const layout = map.debit !== undefined || map.credit !== undefined ? "debit-credit" : "signed-amount";
    const roles = layout === "debit-credit"
        ? ["date", "description", "debit", "credit"]
        : ["date", "description", "amount"];
    if (map.currency !== undefined) {
        roles.push("currency");
    }
    const indices = new Map();
    const errors = [];
    for (const role of roles) {
        const name = map[role];
        if (name === undefined) {
            errors.push({ role, column: null, problem: "missing-mapping" });
            continue;
        }
        const index = header.indexOf(name);
        if (index < 0) {
            errors.push({ role, column: name, problem: "unknown-column" });
            continue;
        }
        indices.set(role, index);
    }
    if (errors.length > 0) {
        return { ok: false, errors };
    }
    const at = (role) => indices.get(role) ?? -1;
    const currency = map.currency !== undefined ? at("currency") : findCurrencyColumn(header);
    if (layout === "debit-credit") {
        return {
            ok: true,
            columns: {
                layout,
                date: at("date"),
                description: at("description"),
                debit: at("debit"),
                credit: at("credit"),
                currency,
            },
        };
    }
    return {
        ok: true,
        columns: {
            layout,
            date: at("date"),
            description: at("description"),
            amount: at("amount"),
            currency,
        },
    };
}
