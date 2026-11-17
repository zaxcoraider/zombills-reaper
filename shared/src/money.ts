import type { Cadence } from "@zombills/core";

export const CADENCE_FACTOR: Record<Cadence, number> = { weekly: 52, monthly: 12, yearly: 1 };

/** The only place integer cents are divided by 100 and formatted. */
export function moneyText(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}
