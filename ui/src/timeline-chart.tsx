import { createElement as h } from "react";
import type { GraveyardMonth } from "../../shared/src/types.ts";

const WIDTH = 300;
const HEIGHT = 100;

/** The currency whose yearly cost peaks highest; the first in key order wins a tie. */
function largestCurrency(months: GraveyardMonth[]): string | null {
  const peaks = new Map<string, number>();
  for (const month of months) {
    for (const [currency, total] of Object.entries(month.yearlyTotals ?? {})) {
      peaks.set(currency, Math.max(peaks.get(currency) ?? 0, total.yearlyCostCents));
    }
  }
  let best: string | null = null;
  let bestPeak = -1;
  for (const [currency, peak] of peaks) {
    if (peak > bestPeak) {
      best = currency;
      bestPeak = peak;
    }
  }
  return best;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Bars show yearly cost and a line shows cumulative savings, in one currency. No text: the table carries every number. */
export function TimelineChart({ months }: { months: GraveyardMonth[] }) {
  const currency = largestCurrency(months);
  if (currency === null || months.length === 0) return null;
  const costs = months.map((m) => m.yearlyTotals?.[currency]?.yearlyCostCents ?? 0);
  const savings = months.map((m) => m.cumulativeSavings[currency]?.yearlySavingCents ?? 0);
  const top = Math.max(1, ...costs, ...savings);
  const slot = WIDTH / months.length;
  const y = (cents: number): number => HEIGHT - (cents / top) * HEIGHT;
  const points = savings
    .map((cents, i) => `${round1(i * slot + slot / 2)},${round1(y(cents))}`)
    .join(" ");
  return (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      style={{ width: "100%", maxWidth: "40em", height: "auto", color: "inherit" }}
    >
      {costs.map((cents, i) => (
        <rect
          key={months[i]?.month}
          x={i * slot + slot * 0.1}
          y={y(cents)}
          width={slot * 0.8}
          height={HEIGHT - y(cents)}
          fill="currentColor"
          fillOpacity={0.35}
        />
      ))}
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth={2} />
    </svg>
  );
}
