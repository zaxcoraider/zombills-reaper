// `list_graveyard` (design "list_graveyard"): reads the History without the lock and writes nothing.
import { graveyardView } from "../../shared/src/graveyard-summary.ts";
import type { GraveyardView, ToolResult } from "../../shared/src/types.ts";
import { readHistory } from "./history-store.js";
import { logCounts } from "./log.js";
import type { ToolContext } from "./tools.js";

export async function listGraveyard(context: ToolContext): Promise<ToolResult<GraveyardView>> {
  const loaded = await readHistory(context.dataDir);
  if ("error" in loaded) {
    logCounts("graveyard", { reason: loaded.error });
    return { ok: false, reason: loaded.error };
  }
  const view = graveyardView(loaded.history, context.timeZone);
  logCounts("graveyard", { tombstones: view.tombstones.length, months: view.months.length });
  return { ok: true, ...view };
}
