import { createElement as h } from "react";
import type { GraveyardMonth } from "../../shared/src/types.ts";
import { moneyText } from "../../shared/src/money.ts";
import { PAGE_TEXT } from "./page-text.ts";

const CELL = { padding: "0.25em 0.75em", textAlign: "left" } as const;

function joined(values: string[]): string {
  return values.length === 0 ? PAGE_TEXT.none : values.join(", ");
}

function yearlyCost(month: GraveyardMonth): string {
  if (month.yearlyTotals === null) return PAGE_TEXT.none;
  return joined(
    Object.entries(month.yearlyTotals).map(([currency, total]) =>
      moneyText(total.yearlyCostCents, currency),
    ),
  );
}

function saved(month: GraveyardMonth): string {
  return joined(
    Object.entries(month.cumulativeSavings).map(([currency, saving]) =>
      moneyText(saving.yearlySavingCents, currency),
    ),
  );
}

export function TimelineTable({ months }: { months: GraveyardMonth[] }) {
  const { columns } = PAGE_TEXT;
  return (
    <table style={{ borderCollapse: "collapse", margin: "1em 0" }}>
      <caption style={{ textAlign: "left", fontWeight: "bold" }}>{PAGE_TEXT.tableCaption}</caption>
      <thead>
        <tr>
          <th scope="col" style={CELL}>
            {columns.month}
          </th>
          <th scope="col" style={CELL}>
            {columns.undead}
          </th>
          <th scope="col" style={CELL}>
            {columns.yearlyCost}
          </th>
          <th scope="col" style={CELL}>
            {columns.buried}
          </th>
          <th scope="col" style={CELL}>
            {columns.saved}
          </th>
        </tr>
      </thead>
      <tbody>
        {months.map((month) => (
          <tr key={month.month}>
            <th scope="row" style={CELL}>
              {month.month}
            </th>
            <td style={CELL}>{month.undeadCount === null ? PAGE_TEXT.none : month.undeadCount}</td>
            <td style={CELL}>{yearlyCost(month)}</td>
            <td style={CELL}>{month.buriedCount}</td>
            <td style={CELL}>{saved(month)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
