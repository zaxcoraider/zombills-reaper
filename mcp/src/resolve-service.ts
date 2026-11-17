// Resolves the text a user typed after "bury" to one entry (design "Resolving the service text").
import { foldName } from "../../shared/src/display-name.ts";

/** What the resolver reads from a Tracked charge or, through a `merchant` accessor, a Tombstone. */
export interface Resolvable {
  key: string;
  merchant: string;
  serviceId: string | null;
  amountCents: number;
}

export type Resolution<E> =
  { kind: "one"; entry: E } | { kind: "none" | "several"; candidates: E[] };

const MAX_TEXT_CODE_POINTS = 200;
const MAX_CANDIDATES = 5;
const MIN_PREFIX_CODE_POINTS = 2;
const AMOUNT_SUFFIX = /^(.*\S)\s+(?:[$€£¥]|[A-Za-z]{3}\s?)?(\d{1,7}(?:[.,]\d{1,2})?)$/u;
const TRAILING_CURRENCY = /^(.*\S)\s+[A-Za-z]{3}$/u;

const compareText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

const codePoints = (text: string): number => [...text].length;

function centsOf(amountText: string): number {
  const [whole = "0", fraction = ""] = amountText.split(/[.,]/u);
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

function commonPrefixLength(a: string, b: string): number {
  const left = [...a];
  const right = [...b];
  let n = 0;
  while (n < left.length && n < right.length && left[n] === right[n]) n += 1;
  return n;
}

function byNameAmountKey<E extends Resolvable>(a: E, b: E): number {
  return (
    compareText(foldName(a.merchant), foldName(b.merchant)) ||
    a.amountCents - b.amountCents ||
    compareText(a.key, b.key)
  );
}

function candidatesFor<E extends Resolvable>(q: string, entries: readonly E[]): E[] {
  if (q === "") return [];
  const containing = entries.filter((e) => foldName(e.merchant).includes(q));
  const taken = new Set(containing);
  const rest = entries.filter((e) => !taken.has(e));
  const lengths = rest.map((e) => commonPrefixLength(foldName(e.merchant), q));
  const longest = Math.max(0, ...lengths);
  const sharing =
    longest >= MIN_PREFIX_CODE_POINTS ? rest.filter((_, i) => lengths[i] === longest) : [];
  return [...containing.sort(byNameAmountKey), ...sharing.sort(byNameAmountKey)].slice(
    0,
    MAX_CANDIDATES,
  );
}

function resolveName<E extends Resolvable>(
  name: string,
  amountCents: number | null,
  entries: readonly E[],
): Resolution<E> {
  const q = foldName(name);
  if (q === "") return { kind: "none", candidates: [] };
  let hits = entries.filter((e) => e.serviceId !== null && foldName(e.serviceId) === q);
  if (hits.length === 0) hits = entries.filter((e) => foldName(e.merchant) === q);
  if (hits.length === 0 && codePoints(q) >= MIN_PREFIX_CODE_POINTS) {
    hits = entries.filter((e) => foldName(e.merchant).startsWith(q));
  }
  if (amountCents !== null) hits = hits.filter((e) => e.amountCents === amountCents);
  const [only] = hits;
  if (only !== undefined && hits.length === 1) return { kind: "one", entry: only };
  if (hits.length > 1) {
    return {
      kind: "several",
      candidates: [...hits].sort(byNameAmountKey).slice(0, MAX_CANDIDATES),
    };
  }
  return { kind: "none", candidates: candidatesFor(q, entries) };
}

export function resolveService<E extends Resolvable>(
  text: string,
  entries: readonly E[],
): Resolution<E> {
  if (codePoints(text) > MAX_TEXT_CODE_POINTS) return { kind: "none", candidates: [] };
  const whole = resolveName(text, null, entries);
  if (whole.kind !== "none") return whole;

  const trimmed = text.normalize("NFC").trim();
  const match = AMOUNT_SUFFIX.exec(trimmed);
  const name = match?.[1];
  const amountText = match?.[2];
  if (name === undefined || amountText === undefined) return whole;
  const amountCents = centsOf(amountText);

  const split = resolveName(name, amountCents, entries);
  if (split.kind !== "none") return split;
  // "Spotify USD 16.99": the greedy name part swallowed the currency code, so try without it.
  const bare = TRAILING_CURRENCY.exec(name)?.[1];
  if (bare !== undefined) {
    const stripped = resolveName(bare, amountCents, entries);
    if (stripped.kind !== "none") return stripped;
  }
  return split;
}
