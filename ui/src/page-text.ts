import type { Cadence } from "@zombills/core";

const CADENCE_WORD: Record<Cadence, string> = { weekly: "week", monthly: "month", yearly: "year" };

/** Every sentence on the dashboard page (Req 9.5 tone: plain, no exclamation marks). */
export const PAGE_TEXT = {
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
    saved: "Saved so far",
  },
  tombstonesHeading: "Tombstones",
  none: "—",
  savingNotCounted: "saving not counted (cadence guessed)",
  cadenceWord: (cadence: Cadence): string => CADENCE_WORD[cadence],
  youSave: (money: string): string => `You save ${money} a year`,
  guessedNotCounted: (count: number): string =>
    `${count} ${count === 1 ? "saving" : "savings"} not counted (cadence guessed)`,
  lastChecked: (date: string, from: string, to: string): string =>
    `Last checked ${date}, statements ${from} to ${to}.`,
  amountPer: (money: string, cadence: Cadence): string => `${money} a ${CADENCE_WORD[cadence]}`,
  saves: (money: string): string => `saves ${money} a year`,
  buriedOn: (date: string): string => `buried ${date}`,
} as const;
