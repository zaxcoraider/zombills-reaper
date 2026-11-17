import { createElement as h } from "react";
import type { Ref } from "react";
import type { GraveyardResponse } from "../../shared/src/types.ts";
import { localDate } from "../../shared/src/local-date.ts";
import { moneyText } from "../../shared/src/money.ts";
import { PAGE_TEXT } from "./page-text.ts";

export interface SavingsHeadlineProps {
  data: GraveyardResponse;
  headingRef: Ref<HTMLHeadingElement>;
}

function browserZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function SavingsHeadline({ data, headingRef }: SavingsHeadlineProps) {
  const entries = Object.entries(data.savings);
  const guessed = entries.reduce((sum, [, saving]) => sum + saving.guessedCount, 0);
  const { lastScan } = data;
  return (
    <header>
      <h1 ref={headingRef} tabIndex={-1}>
        {PAGE_TEXT.heading}
      </h1>
      {data.tombstones.length === 0 && lastScan !== null ? <p>{PAGE_TEXT.nothingBuried}</p> : null}
      {entries.map(([currency, saving]) => (
        <p key={currency} style={{ fontSize: "1.25em", margin: "0.25em 0" }}>
          {PAGE_TEXT.youSave(moneyText(saving.yearlySavingCents, currency))}
        </p>
      ))}
      {guessed > 0 ? <p>{PAGE_TEXT.guessedNotCounted(guessed)}</p> : null}
      {lastScan !== null ? (
        <p>
          {PAGE_TEXT.lastChecked(
            localDate(new Date(lastScan.scannedAt), browserZone()),
            lastScan.statementRange.from,
            lastScan.statementRange.to,
          )}
        </p>
      ) : null}
    </header>
  );
}
