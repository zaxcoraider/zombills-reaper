// Merges the per-file transaction lists (design "Scan algorithm" step 6, first bullet).
import type { NormalizedTransaction } from "@zombills/core";

/** A transaction with its JSON text, computed once. */
interface Keyed {
  json: string;
  transaction: NormalizedTransaction;
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Longer list first; equal lengths compare element by element, smaller JSON wins. */
function isBetter(candidate: Keyed[], current: Keyed[]): boolean {
  if (candidate.length !== current.length) return candidate.length > current.length;
  for (let i = 0; i < candidate.length; i++) {
    const order = compareText(candidate[i]?.json ?? "", current[i]?.json ?? "");
    if (order !== 0) return order < 0;
  }
  return false;
}

/**
 * One file's rows are one list per key `[date, merchant.key, amountCents, currency]`. For each key
 * the longest list over all files is kept, so the same statement read twice, or two statements
 * that overlap, count a row once, while two equal rows inside one file both stay (Req 4.4).
 * The result depends only on the multiset of per-file lists, never on their order or names
 * (Req 4.7).
 */
export function mergeOverlap(perFile: NormalizedTransaction[][]): NormalizedTransaction[] {
  const best = new Map<string, Keyed[]>();
  for (const file of perFile) {
    const groups = new Map<string, Keyed[]>();
    for (const transaction of file) {
      const key = JSON.stringify([
        transaction.date,
        transaction.merchant.key,
        transaction.amountCents,
        transaction.currency,
      ]);
      const list = groups.get(key) ?? [];
      list.push({ json: JSON.stringify(transaction), transaction });
      groups.set(key, list);
    }
    for (const [key, list] of groups) {
      list.sort((a, b) => compareText(a.json, b.json));
      const current = best.get(key);
      if (current === undefined || isBetter(list, current)) best.set(key, list);
    }
  }
  return [...best.entries()]
    .sort(([a], [b]) => compareText(a, b))
    .flatMap(([, list]) => list.map((item) => item.transaction));
}
