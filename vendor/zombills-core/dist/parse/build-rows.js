import { combineDebitCredit } from "./debit-credit.js";
import { parseDate } from "./date-format.js";
import { resolveRowCurrency } from "./currency.js";
import { ParseError } from "./parse-error.js";
import { applySignConvention } from "./sign-convention.js";
import { serializeRow } from "./tokenize.js";
const NO_DATE_FORMAT_REASON = "no recognisable date format in the statement";
/**
 * Turns each data row into a `Transaction` or one `RowError`, in input order (Req 8.1).
 *
 * Every field of a row is checked, and all failures of the row are joined into a single `RowError`
 * whose reason reads "<field>: <message>; <field>: <message>". A row therefore produces exactly
 * one outcome, which is what keeps `transactions.length + rowErrors.length` equal to the number of
 * data rows. Cells missing from a short row count as empty.
 */
export function buildRows(input) {
    const { dataRows, columns, dateFormat, amounts, currencyFallback, delimiter } = input;
    const { signConvention } = input;
    if (columns.layout === "signed-amount" && signConvention === null) {
        throw new Error("buildRows needs a sign convention for the signed-amount layout");
    }
    const outcomesOf = (column) => {
        const outcomes = amounts.get(column);
        if (outcomes === undefined || outcomes.length !== dataRows.length) {
            throw new Error(`buildRows needs one amount outcome per data row for column ${column}`);
        }
        return outcomes;
    };
    const signedOutcomes = columns.layout === "signed-amount" ? outcomesOf(columns.amount) : [];
    const debitOutcomes = columns.layout === "debit-credit" ? outcomesOf(columns.debit) : [];
    const creditOutcomes = columns.layout === "debit-credit" ? outcomesOf(columns.credit) : [];
    const transactions = [];
    const rowErrors = [];
    dataRows.forEach((row, position) => {
        const cell = (index) => row.cells[index] ?? "";
        const failures = [];
        const fail = (field, message) => {
            failures.push(`${field}: ${message}`);
        };
        let date = "";
        if (dateFormat === null) {
            fail("date", NO_DATE_FORMAT_REASON);
        }
        else {
            try {
                date = parseDate(cell(columns.date), dateFormat);
            }
            catch (error) {
                if (!(error instanceof ParseError)) {
                    throw error;
                }
                fail("date", error.message);
            }
        }
        const description = cell(columns.description).trim();
        if (description === "") {
            fail("description", "missing required cell");
        }
        let amountCents = 0;
        try {
            if (columns.layout === "signed-amount") {
                const outcome = signedOutcomes[position];
                if (outcome === undefined || signConvention === null) {
                    throw new Error("buildRows is missing an amount outcome");
                }
                if (!outcome.ok) {
                    throw new ParseError("amount", outcome.reason);
                }
                amountCents = applySignConvention(outcome.cents, signConvention);
            }
            else {
                const debitOutcome = debitOutcomes[position];
                const creditOutcome = creditOutcomes[position];
                if (debitOutcome === undefined || creditOutcome === undefined) {
                    throw new Error("buildRows is missing an amount outcome");
                }
                amountCents = combineDebitCredit({ raw: cell(columns.debit), outcome: debitOutcome }, { raw: cell(columns.credit), outcome: creditOutcome });
            }
        }
        catch (error) {
            if (!(error instanceof ParseError)) {
                throw error;
            }
            fail(error.field, error.message);
        }
        let currency = currencyFallback;
        if (columns.currency !== null) {
            try {
                currency = resolveRowCurrency(cell(columns.currency), currencyFallback);
            }
            catch (error) {
                if (!(error instanceof ParseError)) {
                    throw error;
                }
                fail("currency", error.message);
            }
        }
        if (failures.length > 0) {
            rowErrors.push({
                rowIndex: row.ordinal,
                rawRow: serializeRow(row.cells, delimiter),
                reason: failures.join("; "),
            });
        }
        else {
            transactions.push({ date, description, amountCents, currency });
        }
    });
    return { transactions, rowErrors };
}
