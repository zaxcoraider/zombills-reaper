// ui/src/index.tsx
import { createElement as h6 } from "react";

// ui/src/graveyard-page.tsx
import { createElement as h5, useEffect, useRef, useState } from "react";
import { useAppApi } from "@kirocrew/app-sdk";

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
  buriedOn: (date) => `buried ${date}`
};

// ui/src/savings-headline.tsx
import { createElement as h } from "react";

// shared/src/local-date.ts
function localDate(date, timeZone) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

// shared/src/money.ts
function moneyText(cents, currency) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

// ui/src/savings-headline.tsx
function browserZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}
function SavingsHeadline({ data, headingRef }) {
  const entries = Object.entries(data.savings);
  const guessed = entries.reduce((sum, [, saving]) => sum + saving.guessedCount, 0);
  const { lastScan } = data;
  return /* @__PURE__ */ h("header", null, /* @__PURE__ */ h("h1", { ref: headingRef, tabIndex: -1 }, PAGE_TEXT.heading), data.tombstones.length === 0 && lastScan !== null ? /* @__PURE__ */ h("p", null, PAGE_TEXT.nothingBuried) : null, entries.map(([currency, saving]) => /* @__PURE__ */ h("p", { key: currency, style: { fontSize: "1.25em", margin: "0.25em 0" } }, PAGE_TEXT.youSave(moneyText(saving.yearlySavingCents, currency)))), guessed > 0 ? /* @__PURE__ */ h("p", null, PAGE_TEXT.guessedNotCounted(guessed)) : null, lastScan !== null ? /* @__PURE__ */ h("p", null, PAGE_TEXT.lastChecked(
    localDate(new Date(lastScan.scannedAt), browserZone()),
    lastScan.statementRange.from,
    lastScan.statementRange.to
  )) : null);
}

// ui/src/timeline-chart.tsx
import { createElement as h2 } from "react";
var WIDTH = 300;
var HEIGHT = 100;
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
function round1(value) {
  return Math.round(value * 10) / 10;
}
function TimelineChart({ months }) {
  const currency = largestCurrency(months);
  if (currency === null || months.length === 0) return null;
  const costs = months.map((m) => m.yearlyTotals?.[currency]?.yearlyCostCents ?? 0);
  const savings = months.map((m) => m.cumulativeSavings[currency]?.yearlySavingCents ?? 0);
  const top = Math.max(1, ...costs, ...savings);
  const slot = WIDTH / months.length;
  const y = (cents) => HEIGHT - cents / top * HEIGHT;
  const points = savings.map((cents, i) => `${round1(i * slot + slot / 2)},${round1(y(cents))}`).join(" ");
  return /* @__PURE__ */ h2(
    "svg",
    {
      "aria-hidden": "true",
      viewBox: `0 0 ${WIDTH} ${HEIGHT}`,
      style: { width: "100%", maxWidth: "40em", height: "auto", color: "inherit" }
    },
    costs.map((cents, i) => /* @__PURE__ */ h2(
      "rect",
      {
        key: months[i]?.month,
        x: i * slot + slot * 0.1,
        y: y(cents),
        width: slot * 0.8,
        height: HEIGHT - y(cents),
        fill: "currentColor",
        fillOpacity: 0.35
      }
    )),
    /* @__PURE__ */ h2("polyline", { points, fill: "none", stroke: "currentColor", strokeWidth: 2 })
  );
}

// ui/src/timeline-table.tsx
import { createElement as h3 } from "react";
var CELL = { padding: "0.25em 0.75em", textAlign: "left" };
function joined(values) {
  return values.length === 0 ? PAGE_TEXT.none : values.join(", ");
}
function yearlyCost(month) {
  if (month.yearlyTotals === null) return PAGE_TEXT.none;
  return joined(
    Object.entries(month.yearlyTotals).map(
      ([currency, total]) => moneyText(total.yearlyCostCents, currency)
    )
  );
}
function saved(month) {
  return joined(
    Object.entries(month.cumulativeSavings).map(
      ([currency, saving]) => moneyText(saving.yearlySavingCents, currency)
    )
  );
}
function TimelineTable({ months }) {
  const { columns } = PAGE_TEXT;
  return /* @__PURE__ */ h3("table", { style: { borderCollapse: "collapse", margin: "1em 0" } }, /* @__PURE__ */ h3("caption", { style: { textAlign: "left", fontWeight: "bold" } }, PAGE_TEXT.tableCaption), /* @__PURE__ */ h3("thead", null, /* @__PURE__ */ h3("tr", null, /* @__PURE__ */ h3("th", { scope: "col", style: CELL }, columns.month), /* @__PURE__ */ h3("th", { scope: "col", style: CELL }, columns.undead), /* @__PURE__ */ h3("th", { scope: "col", style: CELL }, columns.yearlyCost), /* @__PURE__ */ h3("th", { scope: "col", style: CELL }, columns.buried), /* @__PURE__ */ h3("th", { scope: "col", style: CELL }, columns.saved))), /* @__PURE__ */ h3("tbody", null, months.map((month) => /* @__PURE__ */ h3("tr", { key: month.month }, /* @__PURE__ */ h3("th", { scope: "row", style: CELL }, month.month), /* @__PURE__ */ h3("td", { style: CELL }, month.undeadCount === null ? PAGE_TEXT.none : month.undeadCount), /* @__PURE__ */ h3("td", { style: CELL }, yearlyCost(month)), /* @__PURE__ */ h3("td", { style: CELL }, month.buriedCount), /* @__PURE__ */ h3("td", { style: CELL }, saved(month))))));
}

// ui/src/tombstone-list.tsx
import { createElement as h4 } from "react";
function TombstoneList({ tombstones }) {
  if (tombstones.length === 0) return null;
  const newestFirst = [...tombstones].sort(
    (a, b) => a.buriedAt < b.buriedAt ? 1 : a.buriedAt > b.buriedAt ? -1 : 0
  );
  return /* @__PURE__ */ h4("section", null, /* @__PURE__ */ h4("h2", null, PAGE_TEXT.tombstonesHeading), /* @__PURE__ */ h4("ul", { style: { paddingLeft: "1.25em" } }, newestFirst.map((tombstone) => /* @__PURE__ */ h4("li", { key: tombstone.ref, style: { margin: "0.5em 0" } }, /* @__PURE__ */ h4("strong", null, tombstone.name), ": ", PAGE_TEXT.amountPer(
    moneyText(tombstone.amountCents, tombstone.currency),
    tombstone.cadence
  ), ", ", tombstone.yearlySavingCents === null ? PAGE_TEXT.savingNotCounted : PAGE_TEXT.saves(moneyText(tombstone.yearlySavingCents, tombstone.currency)), ", ", PAGE_TEXT.buriedOn(tombstone.buriedAt)))));
}

// ui/src/graveyard-page.tsx
var GRAVEYARD_PATH = "/apps/zombills-reaper/api/graveyard";
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
    return /* @__PURE__ */ h5("div", { role: "status", style: { padding: "1rem" } }, PAGE_TEXT.loading);
  }
  if (state.kind === "error") {
    return /* @__PURE__ */ h5("div", { style: { padding: "1rem" } }, /* @__PURE__ */ h5("p", null, PAGE_TEXT.error), /* @__PURE__ */ h5("button", { type: "button", onClick: retry }, PAGE_TEXT.retry));
  }
  const { reply } = state;
  const isEmpty = reply.tombstones.length === 0 && reply.lastScan === null;
  return /* @__PURE__ */ h5("div", { style: { padding: "1rem" } }, /* @__PURE__ */ h5(SavingsHeadline, { data: reply, headingRef: heading }), isEmpty ? /* @__PURE__ */ h5("p", null, PAGE_TEXT.empty) : null, reply.months.length > 0 ? /* @__PURE__ */ h5("section", null, /* @__PURE__ */ h5(TimelineChart, { months: reply.months }), /* @__PURE__ */ h5(TimelineTable, { months: reply.months })) : null, /* @__PURE__ */ h5(TombstoneList, { tombstones: reply.tombstones }));
}

// ui/src/index.tsx
function mount() {
  return /* @__PURE__ */ h6(GraveyardPage, null);
}
var index_default = mount;
export {
  index_default as default,
  mount
};
