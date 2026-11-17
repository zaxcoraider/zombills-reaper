import { createElement as h } from "react";
import type { GraveyardMonth } from "../../shared/src/types.ts";
import { moneyText } from "../../shared/src/money.ts";
import { PAGE_TEXT } from "./page-text.ts";

const PLOT_LEFT = 72;
const SLOT = 72;
const BAR = 22;
const GAP = 4;
const PLOT_TOP = 72;
const PLOT_HEIGHT = 160;
const AXIS_BOTTOM = 28;
const LEGEND_HEIGHT = 44;
const RIGHT_PAD = 16;
const FONT_SIZE = 10;

// Theme colours the Crew dashboard defines (`--warn`, `--ok`, `--border-strong`, `--muted`).
const COST_FILL = "var(--warn, currentColor)";
const SAVED_FILL = "var(--ok, currentColor)";
const AXIS_STROKE = "var(--border-strong, currentColor)";
const LABEL_FILL = "var(--muted, currentColor)";

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

interface DrawnBar {
  kind: "cost" | "saved";
  x: number;
  cents: number;
}

/** Two narrow bars per month: yearly cost and saved so far, in one currency. The table carries every number. */
export function TimelineChart({ months }: { months: GraveyardMonth[] }) {
  const currency = largestCurrency(months);
  if (currency === null || months.length === 0) return null;
  const width = PLOT_LEFT + months.length * SLOT + RIGHT_PAD;
  const baseline = PLOT_TOP + PLOT_HEIGHT;
  const height = baseline + AXIS_BOTTOM + LEGEND_HEIGHT;
  const costOf = (m: GraveyardMonth): number | null =>
    m.yearlyTotals?.[currency]?.yearlyCostCents ?? null;
  const savedOf = (m: GraveyardMonth): number | null =>
    m.cumulativeSavings[currency]?.yearlySavingCents ?? null;
  const top = Math.max(
    1,
    ...months.map((m) => costOf(m) ?? 0),
    ...months.map((m) => savedOf(m) ?? 0),
  );
  const barHeight = (cents: number): number => Math.round((cents / top) * PLOT_HEIGHT);
  const pairStart = (SLOT - (2 * BAR + GAP)) / 2;
  const labelProps = { fill: LABEL_FILL, fontSize: FONT_SIZE } as const;
  const legendY = baseline + AXIS_BOTTOM + 12;
  return (
    <div style={{ overflowX: "auto" }}>
      <svg aria-hidden="true" width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <line x1={PLOT_LEFT} y1={PLOT_TOP} x2={PLOT_LEFT} y2={baseline} stroke={AXIS_STROKE} />
        <line
          x1={PLOT_LEFT}
          y1={baseline}
          x2={width - RIGHT_PAD}
          y2={baseline}
          stroke={AXIS_STROKE}
        />
        <text x={PLOT_LEFT - 6} y={baseline + 3} textAnchor="end" {...labelProps}>
          {moneyText(0, currency)}
        </text>
        <text x={PLOT_LEFT - 6} y={PLOT_TOP + 3} textAnchor="end" {...labelProps}>
          {moneyText(top, currency)}
        </text>
        {months.map((month, i) => {
          const slotX = PLOT_LEFT + i * SLOT;
          const bars: DrawnBar[] = [];
          const cost = costOf(month);
          const saved = savedOf(month);
          if (cost !== null) bars.push({ kind: "cost", x: slotX + pairStart, cents: cost });
          if (saved !== null) {
            bars.push({ kind: "saved", x: slotX + pairStart + BAR + GAP, cents: saved });
          }
          return (
            <g key={month.month}>
              {bars.map((bar) => {
                const barH = barHeight(bar.cents);
                const y = baseline - barH;
                return (
                  <g key={bar.kind}>
                    <rect
                      data-bar={bar.kind}
                      x={bar.x}
                      y={y}
                      width={BAR}
                      height={barH}
                      fill={bar.kind === "cost" ? COST_FILL : SAVED_FILL}
                    />
                    <text
                      data-value={bar.kind}
                      x={bar.x + BAR / 2 + 3}
                      y={y - 4}
                      transform={`rotate(-90 ${bar.x + BAR / 2 + 3} ${y - 4})`}
                      {...labelProps}
                    >
                      {moneyText(bar.cents, currency)}
                    </text>
                  </g>
                );
              })}
              <text
                data-month={month.month}
                x={slotX + SLOT / 2}
                y={baseline + 16}
                textAnchor="middle"
                {...labelProps}
              >
                {month.month}
              </text>
            </g>
          );
        })}
        <circle cx={12} cy={legendY - 3} r={4} fill={COST_FILL} />
        <text data-legend="cost" x={22} y={legendY} {...labelProps}>
          {PAGE_TEXT.legendCost(currency)}
        </text>
        <circle cx={12} cy={legendY + 15} r={4} fill={SAVED_FILL} />
        <text data-legend="saved" x={22} y={legendY + 18} {...labelProps}>
          {PAGE_TEXT.legendSaved(currency)}
        </text>
      </svg>
    </div>
  );
}
