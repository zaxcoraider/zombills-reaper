import type { AmountOutcome, DataRow, Delimiter, ResolvedColumns } from "./internal-types.js";
import type { DateFormat, RowError, SignConvention, Transaction } from "./types.js";
export interface BuildRowsInput {
    dataRows: readonly DataRow[];
    columns: ResolvedColumns;
    /** null when no date cell matched any supported format (Req 3.9) */
    dateFormat: DateFormat | null;
    /**
     * Amount outcomes by column index, one entry per data row in the same order as `dataRows`:
     * the amount column for the signed layout, the debit and credit columns for debit/credit.
     */
    amounts: ReadonlyMap<number, readonly AmountOutcome[]>;
    /** Required for the signed layout, ignored for debit/credit */
    signConvention: SignConvention | null;
    /** Statement-level currency, already validated and upper-cased */
    currencyFallback: string;
    delimiter: Delimiter;
}
/**
 * Turns each data row into a `Transaction` or one `RowError`, in input order (Req 8.1).
 *
 * Every field of a row is checked, and all failures of the row are joined into a single `RowError`
 * whose reason reads "<field>: <message>; <field>: <message>". A row therefore produces exactly
 * one outcome, which is what keeps `transactions.length + rowErrors.length` equal to the number of
 * data rows. Cells missing from a short row count as empty.
 */
export declare function buildRows(input: BuildRowsInput): {
    transactions: Transaction[];
    rowErrors: RowError[];
};
