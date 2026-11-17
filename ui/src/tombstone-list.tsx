import { createElement as h } from "react";
import type { TombstoneView } from "../../shared/src/types.ts";
import { moneyText } from "../../shared/src/money.ts";
import { PAGE_TEXT } from "./page-text.ts";

export function TombstoneList({ tombstones }: { tombstones: TombstoneView[] }) {
  if (tombstones.length === 0) return null;
  // The backend already sorts newest first; sorting again keeps the page correct on its own.
  const newestFirst = [...tombstones].sort((a, b) =>
    a.buriedAt < b.buriedAt ? 1 : a.buriedAt > b.buriedAt ? -1 : 0,
  );
  return (
    <section>
      <h2>{PAGE_TEXT.tombstonesHeading}</h2>
      <ul style={{ paddingLeft: "1.25em" }}>
        {newestFirst.map((tombstone) => (
          <li key={tombstone.ref} style={{ margin: "0.5em 0" }}>
            <strong>{tombstone.name}</strong>
            {": "}
            {PAGE_TEXT.amountPer(
              moneyText(tombstone.amountCents, tombstone.currency),
              tombstone.cadence,
            )}
            {", "}
            {tombstone.yearlySavingCents === null
              ? PAGE_TEXT.savingNotCounted
              : PAGE_TEXT.saves(moneyText(tombstone.yearlySavingCents, tombstone.currency))}
            {", "}
            {PAGE_TEXT.buriedOn(tombstone.buriedAt)}
          </li>
        ))}
      </ul>
    </section>
  );
}
