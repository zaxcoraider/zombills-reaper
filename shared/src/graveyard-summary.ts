import { localMonth } from "./local-date.ts";
import { refOf } from "./ref.ts";
import type {
  GraveyardMonth,
  GraveyardView,
  History,
  Tombstone,
  TombstoneView,
  YearlyTotals,
} from "./types.ts";

type Savings = GraveyardView["savings"];

function compareText(a: string, b: string): number {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

/** Newest `buriedAt` first, then name, then key (the key itself is not returned). */
function compareTombstones(a: Tombstone, b: Tombstone): number {
  return (
    compareText(b.buriedAt, a.buriedAt) || compareText(a.name, b.name) || compareText(a.key, b.key)
  );
}

function viewOf(tombstone: Tombstone): TombstoneView {
  const view: Partial<Tombstone> = { ...tombstone };
  delete view.key;
  delete view.merchantKey;
  // The two keys are deleted above, so the rest is exactly a TombstoneView without `ref`.
  return { ...(view as Omit<Tombstone, "key" | "merchantKey">), ref: refOf(tombstone.key) };
}

function savingsOf(tombstones: readonly Tombstone[]): Savings {
  const byCurrency = new Map<string, { yearlySavingCents: number; guessedCount: number }>();
  for (const t of tombstones) {
    const entry = byCurrency.get(t.currency) ?? { yearlySavingCents: 0, guessedCount: 0 };
    if (t.yearlySavingCents === null) entry.guessedCount += 1;
    else entry.yearlySavingCents += t.yearlySavingCents;
    byCurrency.set(t.currency, entry);
  }
  // fromEntries defines own properties, so a currency text such as "__proto__" stays data.
  return Object.fromEntries(byCurrency);
}

/** The Graveyard as the tool and the backend return it (design "Graveyard summary"). */
export function graveyardView(history: History, timeZone: string): GraveyardView {
  const sorted = [...history.tombstones].sort(compareTombstones);

  const lastScanOfMonth = new Map<string, { undeadCount: number; yearlyTotals: YearlyTotals }>();
  for (const scan of history.scans) {
    lastScanOfMonth.set(localMonth(scan.scannedAt, timeZone), {
      undeadCount: scan.undeadCount,
      yearlyTotals: scan.yearlyTotals,
    });
  }
  const monthSet = new Set<string>(lastScanOfMonth.keys());
  for (const t of history.tombstones) monthSet.add(t.buriedAt.slice(0, 7));

  let carried: { undeadCount: number; yearlyTotals: YearlyTotals } | null = null;
  const months: GraveyardMonth[] = [];
  for (const month of [...monthSet].sort(compareText)) {
    carried = lastScanOfMonth.get(month) ?? carried;
    // buriedAt is yyyy-mm-dd, so "in or before month m" is a comparison of its first 7 characters.
    const buried = history.tombstones.filter((t) => t.buriedAt.slice(0, 7) <= month);
    months.push({
      month,
      undeadCount: carried ? carried.undeadCount : null,
      yearlyTotals: carried ? carried.yearlyTotals : null,
      buriedCount: buried.length,
      cumulativeSavings: savingsOf(buried),
    });
  }

  return { tombstones: sorted.map(viewOf), savings: savingsOf(history.tombstones), months };
}
