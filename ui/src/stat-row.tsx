import { createElement as h } from "react";
import { StatCard } from "@kirocrew/app-sdk/ui";
import type { GraveyardResponse } from "../../shared/src/types.ts";
import { moneyText } from "../../shared/src/money.ts";
import { PAGE_TEXT } from "./page-text.ts";

function joined(values: string[]): string {
  return values.length === 0 ? PAGE_TEXT.none : values.join(", ");
}

/** Three stat cards: saved per year, undead and yearly cost (Req 12.3). */
export function StatRow({ data }: { data: GraveyardResponse }) {
  const savings = Object.entries(data.savings);
  const guessed = savings.reduce((sum, [, saving]) => sum + saving.guessedCount, 0);
  const { lastScan } = data;
  const cost = lastScan === null ? [] : Object.entries(lastScan.yearlyTotals);
  return (
    <div
      className="grid gap-3 mb-4"
      style={{ gridTemplateColumns: "repeat(auto-fit, minmax(14em, 1fr))" }}
    >
      <div>
        <StatCard
          label={PAGE_TEXT.savedPerYear}
          value={joined(savings.map(([c, s]) => moneyText(s.yearlySavingCents, c)))}
        />
        {savings.map(([currency, saving]) => (
          <p key={currency} className="text-muted text-sm mt-1">
            {PAGE_TEXT.youSave(moneyText(saving.yearlySavingCents, currency))}
          </p>
        ))}
        {guessed > 0 ? (
          <p className="text-muted text-sm mt-1">{PAGE_TEXT.guessedNotCounted(guessed)}</p>
        ) : null}
      </div>
      <div>
        <StatCard
          label={PAGE_TEXT.columns.undead}
          value={lastScan === null ? PAGE_TEXT.none : lastScan.undeadCount}
        />
      </div>
      <div>
        <StatCard
          label={PAGE_TEXT.columns.yearlyCost}
          value={joined(cost.map(([c, t]) => moneyText(t.yearlyCostCents, c)))}
        />
      </div>
    </div>
  );
}
