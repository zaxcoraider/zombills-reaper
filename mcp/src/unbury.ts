// `unbury` (design "`unbury`"): removes one Tombstone. Never reads the statements folder.
import type { ToolResult, Tombstone } from "../../shared/src/types.ts";
import { candidateOf } from "./bury.js";
import { ensureDataDir } from "./data-files.js";
import { withHistoryLock } from "./history-lock.js";
import { loadHistoryForWrite, saveHistory } from "./history-store.js";
import { logCounts } from "./log.js";
import { resolveService } from "./resolve-service.js";
import type { ToolContext } from "./tools.js";

export interface UnburyResult {
  name: string;
  /** Set only when this call's own load reset or dropped records (Req 7.3). */
  historyReset?: true;
  historyDropped?: number;
}

type TombstoneEntry = Tombstone & { merchant: string };

export async function unbury(
  context: ToolContext,
  args: { service: string },
): Promise<ToolResult<UnburyResult>> {
  await ensureDataDir(context.dataDir);
  return withHistoryLock(
    context.dataDir,
    async (): Promise<ToolResult<UnburyResult>> => {
      const loaded = await loadHistoryForWrite(context.dataDir, context.now());
      if ("error" in loaded) return { ok: false, reason: loaded.error };
      const { history } = loaded;
      const notes: Pick<UnburyResult, "historyReset" | "historyDropped"> = {
        ...(loaded.reset ? { historyReset: true as const } : {}),
        ...(loaded.dropped > 0 ? { historyDropped: loaded.dropped } : {}),
      };
      const entries: TombstoneEntry[] = history.tombstones.map((t) => ({ ...t, merchant: t.name }));
      const resolution = resolveService(args.service, entries);
      if (resolution.kind !== "one") {
        const found = resolution.kind === "several" ? resolution.candidates.length : 0;
        logCounts("unbury", { found });
        return {
          ok: false,
          reason: resolution.kind === "several" ? "ambiguous" : "not-found",
          candidates: resolution.candidates.map(candidateOf),
        };
      }
      const { key, name } = resolution.entry;
      await saveHistory(context.dataDir, {
        ...history,
        tombstones: history.tombstones.filter((t) => t.key !== key),
      });
      logCounts("unbury", { found: 1 });
      return { ok: true, name, ...notes };
    },
    context.lock?.timings,
    context.lock?.clock,
  );
}
