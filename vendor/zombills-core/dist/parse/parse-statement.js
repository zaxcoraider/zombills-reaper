import { tryParseAmount } from "./amount.js";
import { buildRows } from "./build-rows.js";
import { autoDetectColumns, resolveColumnMap } from "./columns.js";
import { decideStatementCurrency, isCurrencyCode, normalizeCurrency } from "./currency.js";
import { detectDateFormat } from "./date-format.js";
import { detectDecimalSeparator } from "./decimal-separator.js";
import { EMPTY_CSV_REASON, NO_CONTENT_ROWS_REASON } from "./empty-reasons.js";
import { detectHeaderRow, firstNonBlankRow } from "./header-detect.js";
import { detectSignConvention } from "./sign-convention.js";
import { isBlankRow, stripBom, tokenize } from "./tokenize.js";
const MAX_QUOTED_LENGTH = 40;
function error(reason) {
    return { status: "error", reason };
}
function mappingRequired(columns, validationErrors) {
    return validationErrors === undefined
        ? { status: "mapping-required", columns, rowErrors: [] }
        : { status: "mapping-required", columns, validationErrors, rowErrors: [] };
}
function describeOption(value) {
    const text = typeof value === "string" ? value : String(value);
    const shown = text.length > MAX_QUOTED_LENGTH ? `${text.slice(0, MAX_QUOTED_LENGTH)}…` : text;
    return JSON.stringify(shown);
}
/** The columns whose cells hold amounts: the amount column, or the debit and credit columns. */
function amountColumnsOf(columns) {
    return columns.layout === "signed-amount" ? [columns.amount] : [columns.debit, columns.credit];
}
/**
 * Parses a bank-statement CSV into transactions.
 *
 * The statement-level decisions (header row, columns, date format, decimal separator, sign
 * convention) are made once from the whole statement. Then each data row becomes a transaction or
 * a row error. See `.kiro/specs/statement-parser/design.md` for the order of the steps.
 *
 * @throws TypeError only when `csv` is not a string. Every other problem is a returned result.
 */
export function parseStatement(csv, optionsArgument) {
    const options = optionsArgument ?? {};
    // Step 0: the only throw (Req 8.2).
    if (typeof csv !== "string") {
        throw new TypeError("parseStatement expects the CSV to be a string");
    }
    // Steps 1-2: strip a byte order mark, then reject empty input (Req 1.4, 1.6).
    const text = stripBom(csv);
    if (text.trim() === "") {
        return error(EMPTY_CSV_REASON);
    }
    // Step 3: validate the options before touching any row (Req 10.1-10.3).
    let optionCurrency = null;
    if (options.currency !== undefined) {
        if (typeof options.currency !== "string" || !isCurrencyCode(options.currency)) {
            return error(`Invalid currency option ${describeOption(options.currency)}: expected a 3-letter ISO 4217 code such as "USD"`);
        }
        optionCurrency = normalizeCurrency(options.currency);
    }
    const { signConvention: signOption } = options;
    if (signOption !== undefined && signOption !== "positive-out" && signOption !== "negative-out") {
        return error(`Invalid signConvention option ${describeOption(signOption)}: expected "positive-out" or "negative-out"`);
    }
    // Step 4: split into rows and cells.
    const { rows, delimiter } = tokenize(text);
    const firstRow = firstNonBlankRow(rows);
    if (firstRow === null) {
        return error(NO_CONTENT_ROWS_REASON);
    }
    // Step 5: find the header row. Without a recognised header, a supplied column map makes the
    // first non-blank row the header; otherwise the caller must map the columns (Req 11.3).
    const columnMap = options.columnMap;
    let headerIndex = detectHeaderRow(rows);
    if (headerIndex === null) {
        if (columnMap === undefined) {
            return mappingRequired(firstRow);
        }
        headerIndex = rows.findIndex((row) => !isBlankRow(row));
    }
    const header = [...(rows[headerIndex] ?? [])];
    // Step 6: resolve the columns from the map or from the header names (Req 2.6-2.9, 9.4).
    let columns;
    if (columnMap !== undefined) {
        const resolved = resolveColumnMap(header, columnMap);
        if (!resolved.ok) {
            return mappingRequired(header, resolved.errors);
        }
        columns = resolved.columns;
    }
    else {
        const detected = autoDetectColumns(header);
        if (detected === null) {
            return mappingRequired(header);
        }
        columns = detected;
    }
    // Step 7: the data rows are every row after the header that is not blank (glossary "Data row").
    const dataRows = [];
    for (const cells of rows.slice(headerIndex + 1)) {
        if (!isBlankRow(cells)) {
            dataRows.push({ ordinal: dataRows.length + 1, cells });
        }
    }
    const cellsOf = (column) => dataRows.map((row) => row.cells[column] ?? "");
    // Step 8: one date format for the whole statement (Req 3).
    const dateDetection = detectDateFormat(cellsOf(columns.date));
    if (dateDetection.kind === "conflict") {
        return error(dateDetection.reason);
    }
    // Step 9: one decimal separator for the whole statement (Req 4).
    const amountColumns = amountColumnsOf(columns);
    const separatorDetection = detectDecimalSeparator(amountColumns.flatMap(cellsOf));
    if (separatorDetection.kind === "conflict") {
        return error(separatorDetection.reason);
    }
    const { separator } = separatorDetection;
    // Step 10: parse every amount cell once and keep the outcome (Req 4.7, 5).
    const amounts = new Map(amountColumns.map((column) => [
        column,
        cellsOf(column).map((cell) => tryParseAmount(cell, separator)),
    ]));
    // Step 10a: one currency for the rows that have none of their own (Req 10).
    const detectedCurrency = decideStatementCurrency({
        option: optionCurrency,
        currencyCells: columns.currency === null ? null : cellsOf(columns.currency),
        amountCells: amountColumns.flatMap(cellsOf),
    });
    // Step 11: the sign convention, for the signed layout only (Req 6.1, 6.2).
    let signConvention = null;
    if (columns.layout === "signed-amount") {
        if (signOption !== undefined) {
            signConvention = { convention: signOption, assumed: false };
        }
        else {
            const rawValues = (amounts.get(columns.amount) ?? []).flatMap((outcome) => outcome.ok && outcome.cents !== 0 ? [outcome.cents] : []);
            signConvention = detectSignConvention(rawValues);
        }
    }
    // Steps 12-13: build the rows and assemble the result (Req 8.3-8.5).
    const { transactions, rowErrors } = buildRows({
        dataRows,
        columns,
        dateFormat: dateDetection.kind === "detected" ? dateDetection.info.format : null,
        amounts,
        signConvention: signConvention === null ? null : signConvention.convention,
        currencyFallback: detectedCurrency.code,
        delimiter,
    });
    return {
        status: "mapped",
        transactions,
        rowErrors,
        detectedDateFormat: dateDetection.kind === "detected" ? dateDetection.info : null,
        detectedSignConvention: signConvention,
        detectedCurrency,
    };
}
