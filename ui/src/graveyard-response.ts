import type { GraveyardResponse } from "../../shared/src/types.ts";

export type FailedResponse = { ok: false; reason: string };
export type GraveyardReply = ({ ok: true } & GraveyardResponse) | FailedResponse;

type Obj = Record<string, unknown>;

function isObj(value: unknown): value is Obj {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCents(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

function isCount(value: unknown): value is number {
  return isCents(value) && value >= 0;
}

function isCurrency(value: unknown): value is string {
  return typeof value === "string" && /^[A-Z]{3}$/.test(value);
}

function isText(value: unknown): value is string {
  return typeof value === "string";
}

function isMap(value: unknown, entry: (v: unknown) => boolean): boolean {
  if (!isObj(value)) return false;
  return Object.entries(value).every(([currency, v]) => isCurrency(currency) && entry(v));
}

function isYearlyTotal(value: unknown): boolean {
  return isObj(value) && isCents(value["yearlyCostCents"]) && isCount(value["guessedCount"]);
}

function isSaving(value: unknown): boolean {
  return isObj(value) && isCents(value["yearlySavingCents"]) && isCount(value["guessedCount"]);
}

function isTotals(value: unknown): boolean {
  return isMap(value, isYearlyTotal);
}

function isSavings(value: unknown): boolean {
  return isMap(value, isSaving);
}

function isCadence(value: unknown): boolean {
  return value === "weekly" || value === "monthly" || value === "yearly";
}

function isTombstone(value: unknown): boolean {
  if (!isObj(value)) return false;
  const saving = value["yearlySavingCents"];
  return (
    isText(value["ref"]) &&
    isText(value["name"]) &&
    isCurrency(value["currency"]) &&
    isCadence(value["cadence"]) &&
    isCents(value["amountCents"]) &&
    typeof value["cadenceAssumed"] === "boolean" &&
    (saving === null || isCents(saving)) &&
    isText(value["buriedAt"])
  );
}

function isMonth(value: unknown): boolean {
  if (!isObj(value)) return false;
  const undead = value["undeadCount"];
  const totals = value["yearlyTotals"];
  return (
    isText(value["month"]) &&
    (undead === null || isCount(undead)) &&
    (totals === null || isTotals(totals)) &&
    isCount(value["buriedCount"]) &&
    isSavings(value["cumulativeSavings"])
  );
}

function isRange(value: unknown): boolean {
  return isObj(value) && isText(value["from"]) && isText(value["to"]);
}

function isLastScan(value: unknown): boolean {
  return (
    isObj(value) &&
    isText(value["scannedAt"]) &&
    isRange(value["statementRange"]) &&
    isCount(value["undeadCount"]) &&
    isTotals(value["yearlyTotals"])
  );
}

function isArrayOf(value: unknown, item: (v: unknown) => boolean): boolean {
  return Array.isArray(value) && value.every(item);
}

/** Structural guard for the backend reply: a graveyard, or `{ ok: false, reason }`. */
export function isGraveyardResponse(value: unknown): value is GraveyardReply {
  if (!isObj(value)) return false;
  if (value["ok"] === false) return isText(value["reason"]);
  if (value["ok"] !== true) return false;
  const lastScan = value["lastScan"];
  return (
    isArrayOf(value["tombstones"], isTombstone) &&
    isSavings(value["savings"]) &&
    isArrayOf(value["months"], isMonth) &&
    (lastScan === null || isLastScan(lastScan))
  );
}
