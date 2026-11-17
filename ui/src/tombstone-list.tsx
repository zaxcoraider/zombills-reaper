import { createElement as h } from "react";
import { Badge, Card, CardTitle, EmptyState } from "@kirocrew/app-sdk/ui";
import type { TombstoneView } from "../../shared/src/types.ts";
import { moneyText } from "../../shared/src/money.ts";
import { PAGE_TEXT } from "./page-text.ts";

export function TombstoneList({ tombstones }: { tombstones: TombstoneView[] }) {
  if (tombstones.length === 0) return <EmptyState title={PAGE_TEXT.empty} />;
  // The backend already sorts newest first; sorting again keeps the page correct on its own.
  const newestFirst = [...tombstones].sort((a, b) =>
    a.buriedAt < b.buriedAt ? 1 : a.buriedAt > b.buriedAt ? -1 : 0,
  );
  return (
    <section>
      <h2 className="text-sm font-semibold text-text-strong mb-3">{PAGE_TEXT.tombstonesHeading}</h2>
      <ul className="list-none m-0 p-0">
        {newestFirst.map((tombstone) => (
          <li key={tombstone.ref}>
            <Card>
              <CardTitle>{PAGE_TEXT.tombstoneTitle(tombstone.name)}</CardTitle>
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
                <span>
                  {PAGE_TEXT.amountPer(
                    moneyText(tombstone.amountCents, tombstone.currency),
                    tombstone.cadence,
                  )}
                </span>
                {tombstone.yearlySavingCents === null ? (
                  <Badge variant="muted">{PAGE_TEXT.savingNotCounted}</Badge>
                ) : (
                  <span>
                    {PAGE_TEXT.saves(moneyText(tombstone.yearlySavingCents, tombstone.currency))}
                  </span>
                )}
                <span>{PAGE_TEXT.buriedOn(tombstone.buriedAt)}</span>
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </section>
  );
}
