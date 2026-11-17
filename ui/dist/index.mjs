// ui/src/index.tsx
import { createElement as h7 } from "react";

// ui/src/graveyard-page.tsx
import { createElement as h6, useEffect, useRef, useState } from "react";
import { useAppApi } from "@kirocrew/app-sdk";
import { Card as Card2, CardTitle as CardTitle2, PageHeader } from "@kirocrew/app-sdk/ui";

// shared/src/local-date.ts
function localDate(date, timeZone) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

// ui/src/graveyard-response.ts
function isObj(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isCents(value) {
  return typeof value === "number" && Number.isInteger(value);
}
function isCount(value) {
  return isCents(value) && value >= 0;
}
function isCurrency(value) {
  return typeof value === "string" && /^[A-Z]{3}$/.test(value);
}
function isText(value) {
  return typeof value === "string";
}
function isMap(value, entry) {
  if (!isObj(value)) return false;
  return Object.entries(value).every(([currency, v]) => isCurrency(currency) && entry(v));
}
function isYearlyTotal(value) {
  return isObj(value) && isCents(value["yearlyCostCents"]) && isCount(value["guessedCount"]);
}
function isSaving(value) {
  return isObj(value) && isCents(value["yearlySavingCents"]) && isCount(value["guessedCount"]);
}
function isTotals(value) {
  return isMap(value, isYearlyTotal);
}
function isSavings(value) {
  return isMap(value, isSaving);
}
function isCadence(value) {
  return value === "weekly" || value === "monthly" || value === "yearly";
}
function isTombstone(value) {
  if (!isObj(value)) return false;
  const saving = value["yearlySavingCents"];
  return isText(value["ref"]) && isText(value["name"]) && isCurrency(value["currency"]) && isCadence(value["cadence"]) && isCents(value["amountCents"]) && typeof value["cadenceAssumed"] === "boolean" && (saving === null || isCents(saving)) && isText(value["buriedAt"]);
}
function isMonth(value) {
  if (!isObj(value)) return false;
  const undead = value["undeadCount"];
  const totals = value["yearlyTotals"];
  return isText(value["month"]) && (undead === null || isCount(undead)) && (totals === null || isTotals(totals)) && isCount(value["buriedCount"]) && isSavings(value["cumulativeSavings"]);
}
function isRange(value) {
  return isObj(value) && isText(value["from"]) && isText(value["to"]);
}
function isLastScan(value) {
  return isObj(value) && isText(value["scannedAt"]) && isRange(value["statementRange"]) && isCount(value["undeadCount"]) && isTotals(value["yearlyTotals"]);
}
function isArrayOf(value, item) {
  return Array.isArray(value) && value.every(item);
}
function isGraveyardResponse(value) {
  if (!isObj(value)) return false;
  if (value["ok"] === false) return isText(value["reason"]);
  if (value["ok"] !== true) return false;
  const lastScan = value["lastScan"];
  return isArrayOf(value["tombstones"], isTombstone) && isSavings(value["savings"]) && isArrayOf(value["months"], isMonth) && (lastScan === null || isLastScan(lastScan));
}

// ui/src/page-text.ts
var CADENCE_WORD = { weekly: "week", monthly: "month", yearly: "year" };
var PAGE_TEXT = {
  loading: "Reading the graveyard…",
  error: "The graveyard could not be read.",
  retry: "Try again",
  empty: "Nothing buried yet. The Reaper checks your statements on the 1st of each month.",
  heading: "The graveyard",
  nothingBuried: "Nothing buried yet.",
  tableCaption: "Month by month",
  columns: {
    month: "Month",
    undead: "Undead",
    yearlyCost: "Yearly cost",
    buried: "Buried",
    saved: "Saved so far"
  },
  tombstonesHeading: "Tombstones",
  none: "—",
  savingNotCounted: "saving not counted (cadence guessed)",
  cadenceWord: (cadence) => CADENCE_WORD[cadence],
  youSave: (money) => `You save ${money} a year`,
  guessedNotCounted: (count) => `${count} ${count === 1 ? "saving" : "savings"} not counted (cadence guessed)`,
  lastChecked: (date, from, to) => `Last checked ${date}, statements ${from} to ${to}.`,
  amountPer: (money, cadence) => `${money} a ${CADENCE_WORD[cadence]}`,
  saves: (money) => `saves ${money} a year`,
  buriedOn: (date) => `buried ${date}`,
  savedPerYear: "Saved per year",
  tombstoneTitle: (name) => `⚰ ${name}`,
  legendCost: (currency) => `Yearly cost (${currency})`,
  legendSaved: (currency) => `Saved so far (${currency})`
};

// ui/src/savings-headline.tsx
import { createElement as h } from "react";
function SavingsHeadline({ data }) {
  if (data.tombstones.length > 0 || data.lastScan === null) return null;
  return /* @__PURE__ */ h("p", { className: "text-muted text-sm mb-4" }, PAGE_TEXT.nothingBuried);
}

// ui/src/stat-row.tsx
import { createElement as h2 } from "react";
import { StatCard } from "@kirocrew/app-sdk/ui";

// shared/src/money.ts
function moneyText(cents, currency) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

// ui/src/stat-row.tsx
function joined(values) {
  return values.length === 0 ? PAGE_TEXT.none : values.join(", ");
}
function StatRow({ data }) {
  const savings = Object.entries(data.savings);
  const guessed = savings.reduce((sum, [, saving]) => sum + saving.guessedCount, 0);
  const { lastScan } = data;
  const cost = lastScan === null ? [] : Object.entries(lastScan.yearlyTotals);
  return /* @__PURE__ */ h2(
    "div",
    {
      className: "grid gap-3 mb-4",
      style: { gridTemplateColumns: "repeat(auto-fit, minmax(14em, 1fr))" }
    },
    /* @__PURE__ */ h2("div", null, /* @__PURE__ */ h2(
      StatCard,
      {
        label: PAGE_TEXT.savedPerYear,
        value: joined(savings.map(([c, s]) => moneyText(s.yearlySavingCents, c)))
      }
    ), savings.map(([currency, saving]) => /* @__PURE__ */ h2("p", { key: currency, className: "text-muted text-sm mt-1" }, PAGE_TEXT.youSave(moneyText(saving.yearlySavingCents, currency)))), guessed > 0 ? /* @__PURE__ */ h2("p", { className: "text-muted text-sm mt-1" }, PAGE_TEXT.guessedNotCounted(guessed)) : null),
    /* @__PURE__ */ h2("div", null, /* @__PURE__ */ h2(
      StatCard,
      {
        label: PAGE_TEXT.columns.undead,
        value: lastScan === null ? PAGE_TEXT.none : lastScan.undeadCount
      }
    )),
    /* @__PURE__ */ h2("div", null, /* @__PURE__ */ h2(
      StatCard,
      {
        label: PAGE_TEXT.columns.yearlyCost,
        value: joined(cost.map(([c, t]) => moneyText(t.yearlyCostCents, c)))
      }
    ))
  );
}

// ui/src/timeline-chart.tsx
import { createElement as h3 } from "react";
var PLOT_LEFT = 72;
var SLOT = 72;
var BAR = 22;
var GAP = 4;
var PLOT_TOP = 72;
var PLOT_HEIGHT = 160;
var AXIS_BOTTOM = 28;
var LEGEND_HEIGHT = 44;
var RIGHT_PAD = 16;
var FONT_SIZE = 10;
var COST_FILL = "var(--warn, currentColor)";
var SAVED_FILL = "var(--ok, currentColor)";
var AXIS_STROKE = "var(--border-strong, currentColor)";
var LABEL_FILL = "var(--muted, currentColor)";
function largestCurrency(months) {
  const peaks = /* @__PURE__ */ new Map();
  for (const month of months) {
    for (const [currency, total] of Object.entries(month.yearlyTotals ?? {})) {
      peaks.set(currency, Math.max(peaks.get(currency) ?? 0, total.yearlyCostCents));
    }
  }
  let best = null;
  let bestPeak = -1;
  for (const [currency, peak] of peaks) {
    if (peak > bestPeak) {
      best = currency;
      bestPeak = peak;
    }
  }
  return best;
}
function TimelineChart({ months }) {
  const currency = largestCurrency(months);
  if (currency === null || months.length === 0) return null;
  const width = PLOT_LEFT + months.length * SLOT + RIGHT_PAD;
  const baseline = PLOT_TOP + PLOT_HEIGHT;
  const height = baseline + AXIS_BOTTOM + LEGEND_HEIGHT;
  const costOf = (m) => m.yearlyTotals?.[currency]?.yearlyCostCents ?? null;
  const savedOf = (m) => m.cumulativeSavings[currency]?.yearlySavingCents ?? null;
  const top = Math.max(
    1,
    ...months.map((m) => costOf(m) ?? 0),
    ...months.map((m) => savedOf(m) ?? 0)
  );
  const barHeight = (cents) => Math.round(cents / top * PLOT_HEIGHT);
  const pairStart = (SLOT - (2 * BAR + GAP)) / 2;
  const labelProps = { fill: LABEL_FILL, fontSize: FONT_SIZE };
  const legendY = baseline + AXIS_BOTTOM + 12;
  return /* @__PURE__ */ h3("div", { style: { overflowX: "auto" } }, /* @__PURE__ */ h3("svg", { "aria-hidden": "true", width, height, viewBox: `0 0 ${width} ${height}` }, /* @__PURE__ */ h3("line", { x1: PLOT_LEFT, y1: PLOT_TOP, x2: PLOT_LEFT, y2: baseline, stroke: AXIS_STROKE }), /* @__PURE__ */ h3(
    "line",
    {
      x1: PLOT_LEFT,
      y1: baseline,
      x2: width - RIGHT_PAD,
      y2: baseline,
      stroke: AXIS_STROKE
    }
  ), /* @__PURE__ */ h3("text", { x: PLOT_LEFT - 6, y: baseline + 3, textAnchor: "end", ...labelProps }, moneyText(0, currency)), /* @__PURE__ */ h3("text", { x: PLOT_LEFT - 6, y: PLOT_TOP + 3, textAnchor: "end", ...labelProps }, moneyText(top, currency)), months.map((month, i) => {
    const slotX = PLOT_LEFT + i * SLOT;
    const bars = [];
    const cost = costOf(month);
    const saved2 = savedOf(month);
    if (cost !== null) bars.push({ kind: "cost", x: slotX + pairStart, cents: cost });
    if (saved2 !== null) {
      bars.push({ kind: "saved", x: slotX + pairStart + BAR + GAP, cents: saved2 });
    }
    return /* @__PURE__ */ h3("g", { key: month.month }, bars.map((bar) => {
      const barH = barHeight(bar.cents);
      const y = baseline - barH;
      return /* @__PURE__ */ h3("g", { key: bar.kind }, /* @__PURE__ */ h3(
        "rect",
        {
          "data-bar": bar.kind,
          x: bar.x,
          y,
          width: BAR,
          height: barH,
          fill: bar.kind === "cost" ? COST_FILL : SAVED_FILL
        }
      ), /* @__PURE__ */ h3(
        "text",
        {
          "data-value": bar.kind,
          x: bar.x + BAR / 2 + 3,
          y: y - 4,
          transform: `rotate(-90 ${bar.x + BAR / 2 + 3} ${y - 4})`,
          ...labelProps
        },
        moneyText(bar.cents, currency)
      ));
    }), /* @__PURE__ */ h3(
      "text",
      {
        "data-month": month.month,
        x: slotX + SLOT / 2,
        y: baseline + 16,
        textAnchor: "middle",
        ...labelProps
      },
      month.month
    ));
  }), /* @__PURE__ */ h3("circle", { cx: 12, cy: legendY - 3, r: 4, fill: COST_FILL }), /* @__PURE__ */ h3("text", { "data-legend": "cost", x: 22, y: legendY, ...labelProps }, PAGE_TEXT.legendCost(currency)), /* @__PURE__ */ h3("circle", { cx: 12, cy: legendY + 15, r: 4, fill: SAVED_FILL }), /* @__PURE__ */ h3("text", { "data-legend": "saved", x: 22, y: legendY + 18, ...labelProps }, PAGE_TEXT.legendSaved(currency))));
}

// ui/src/timeline-table.tsx
import { createElement as h4 } from "react";
var CELL = { padding: "0.25em 0.75em", textAlign: "left" };
function joined2(values) {
  return values.length === 0 ? PAGE_TEXT.none : values.join(", ");
}
function yearlyCost(month) {
  if (month.yearlyTotals === null) return PAGE_TEXT.none;
  return joined2(
    Object.entries(month.yearlyTotals).map(
      ([currency, total]) => moneyText(total.yearlyCostCents, currency)
    )
  );
}
function saved(month) {
  return joined2(
    Object.entries(month.cumulativeSavings).map(
      ([currency, saving]) => moneyText(saving.yearlySavingCents, currency)
    )
  );
}
function TimelineTable({ months }) {
  const { columns } = PAGE_TEXT;
  return /* @__PURE__ */ h4("table", { style: { borderCollapse: "collapse", margin: "1em 0" } }, /* @__PURE__ */ h4("caption", { style: { textAlign: "left", fontWeight: "bold" } }, PAGE_TEXT.tableCaption), /* @__PURE__ */ h4("thead", null, /* @__PURE__ */ h4("tr", null, /* @__PURE__ */ h4("th", { scope: "col", style: CELL }, columns.month), /* @__PURE__ */ h4("th", { scope: "col", style: CELL }, columns.undead), /* @__PURE__ */ h4("th", { scope: "col", style: CELL }, columns.yearlyCost), /* @__PURE__ */ h4("th", { scope: "col", style: CELL }, columns.buried), /* @__PURE__ */ h4("th", { scope: "col", style: CELL }, columns.saved))), /* @__PURE__ */ h4("tbody", null, months.map((month) => /* @__PURE__ */ h4("tr", { key: month.month }, /* @__PURE__ */ h4("th", { scope: "row", style: CELL }, month.month), /* @__PURE__ */ h4("td", { style: CELL }, month.undeadCount === null ? PAGE_TEXT.none : month.undeadCount), /* @__PURE__ */ h4("td", { style: CELL }, yearlyCost(month)), /* @__PURE__ */ h4("td", { style: CELL }, month.buriedCount), /* @__PURE__ */ h4("td", { style: CELL }, saved(month))))));
}

// ui/src/tombstone-list.tsx
import { createElement as h5 } from "react";
import { Badge, Card, CardTitle, EmptyState } from "@kirocrew/app-sdk/ui";
function TombstoneList({ tombstones }) {
  if (tombstones.length === 0) return /* @__PURE__ */ h5(EmptyState, { title: PAGE_TEXT.empty });
  const newestFirst = [...tombstones].sort(
    (a, b) => a.buriedAt < b.buriedAt ? 1 : a.buriedAt > b.buriedAt ? -1 : 0
  );
  return /* @__PURE__ */ h5("section", null, /* @__PURE__ */ h5("h2", { className: "text-sm font-semibold text-text-strong mb-3" }, PAGE_TEXT.tombstonesHeading), /* @__PURE__ */ h5("ul", { className: "list-none m-0 p-0" }, newestFirst.map((tombstone) => /* @__PURE__ */ h5("li", { key: tombstone.ref }, /* @__PURE__ */ h5(Card, null, /* @__PURE__ */ h5(CardTitle, null, PAGE_TEXT.tombstoneTitle(tombstone.name)), /* @__PURE__ */ h5("div", { className: "flex flex-wrap items-center gap-2 text-sm text-muted" }, /* @__PURE__ */ h5("span", null, PAGE_TEXT.amountPer(
    moneyText(tombstone.amountCents, tombstone.currency),
    tombstone.cadence
  )), tombstone.yearlySavingCents === null ? /* @__PURE__ */ h5(Badge, { variant: "muted" }, PAGE_TEXT.savingNotCounted) : /* @__PURE__ */ h5("span", null, PAGE_TEXT.saves(moneyText(tombstone.yearlySavingCents, tombstone.currency))), /* @__PURE__ */ h5("span", null, PAGE_TEXT.buriedOn(tombstone.buriedAt))))))));
}

// ui/src/graveyard-page.tsx
var GRAVEYARD_PATH = "/apps/zombills-reaper/api/graveyard";
function browserZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}
function GraveyardPage() {
  const api = useAppApi();
  const [state, setState] = useState({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  const heading = useRef(null);
  const afterRetry = useRef(false);
  const apiRef = useRef(api);
  apiRef.current = api;
  useEffect(() => {
    let current = true;
    apiRef.current.get(GRAVEYARD_PATH).then((reply2) => {
      if (!current) return;
      setState(
        isGraveyardResponse(reply2) && reply2.ok ? { kind: "ready", reply: reply2 } : { kind: "error" }
      );
    }).catch(() => {
      if (current) setState({ kind: "error" });
    });
    return () => {
      current = false;
    };
  }, [attempt]);
  useEffect(() => {
    if (state.kind === "ready" && afterRetry.current) {
      afterRetry.current = false;
      heading.current?.focus();
    }
  }, [state]);
  function retry() {
    afterRetry.current = true;
    setState({ kind: "loading" });
    setAttempt((n) => n + 1);
  }
  if (state.kind === "loading") {
    return /* @__PURE__ */ h6("div", { role: "status", style: { padding: "1rem" } }, PAGE_TEXT.loading);
  }
  if (state.kind === "error") {
    return /* @__PURE__ */ h6(Card2, null, /* @__PURE__ */ h6("p", null, PAGE_TEXT.error), /* @__PURE__ */ h6("button", { type: "button", onClick: retry }, PAGE_TEXT.retry));
  }
  const { reply } = state;
  const { lastScan } = reply;
  return /* @__PURE__ */ h6("div", { style: { padding: "1rem" } }, /* @__PURE__ */ h6(
    PageHeader,
    {
      title: /* @__PURE__ */ h6(
        "h1",
        {
          ref: heading,
          tabIndex: -1,
          style: { margin: 0, font: "inherit", letterSpacing: "inherit" }
        },
        PAGE_TEXT.heading
      ),
      subtitle: lastScan === null ? void 0 : PAGE_TEXT.lastChecked(
        localDate(new Date(lastScan.scannedAt), browserZone()),
        lastScan.statementRange.from,
        lastScan.statementRange.to
      )
    }
  ), /* @__PURE__ */ h6(StatRow, { data: reply }), /* @__PURE__ */ h6(SavingsHeadline, { data: reply }), reply.months.length > 0 ? /* @__PURE__ */ h6(Card2, null, /* @__PURE__ */ h6(CardTitle2, null, PAGE_TEXT.tableCaption), /* @__PURE__ */ h6(TimelineChart, { months: reply.months }), /* @__PURE__ */ h6(TimelineTable, { months: reply.months })) : null, /* @__PURE__ */ h6(TombstoneList, { tombstones: reply.tombstones }));
}

// ui/src/index.tsx
function mount() {
  return /* @__PURE__ */ h7(GraveyardPage, null);
}
var index_default = mount;
export {
  index_default as default,
  mount
};
