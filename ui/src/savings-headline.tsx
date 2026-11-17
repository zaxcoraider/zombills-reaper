import { createElement as h } from "react";
import type { GraveyardResponse } from "../../shared/src/types.ts";
import { PAGE_TEXT } from "./page-text.ts";

/** The line for a scan with no Tombstones. The savings numbers sit in the stat row. */
export function SavingsHeadline({ data }: { data: GraveyardResponse }) {
  if (data.tombstones.length > 0 || data.lastScan === null) return null;
  return <p className="text-muted text-sm mb-4">{PAGE_TEXT.nothingBuried}</p>;
}
