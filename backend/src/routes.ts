// Request handling (design "Request handling", steps 1, 3, 4 and 5). Read-only:
// no write, rename or lock; no Settings file or statement is read (Req 11.5 to 11.7).
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { graveyardView } from "../../shared/src/graveyard-summary.ts";
import { decodeHistory, emptyHistory } from "../../shared/src/history-codec.ts";
import type { GraveyardResponse, History } from "../../shared/src/types.ts";
import { verifyProxyV2 } from "./proxy-check.ts";
import type { ReplayCache } from "./replay-cache.ts";

export interface RouteRequest {
  method: string;
  url: string;
  headers: Readonly<Record<string, string | string[] | undefined>>;
  body: Buffer;
}

export interface RouteContext {
  dataDir: string;
  secret: string;
  cache: ReplayCache;
  nowSeconds: number;
  timeZone: string;
}

export interface RouteReply {
  status: number;
  json: unknown;
}

type HistoryError = "history-unreadable" | "history-newer";

async function readHistoryFile(
  dataDir: string,
): Promise<{ history: History } | { error: HistoryError }> {
  let text: string;
  try {
    text = await readFile(join(dataDir, "history.json"), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { history: emptyHistory() };
    return { error: "history-unreadable" };
  }
  const decoded = decodeHistory(text);
  if (decoded.kind === "ok") return { history: decoded.history };
  return { error: decoded.kind === "newer" ? "history-newer" : "history-unreadable" };
}

function lastScanOf(history: History): GraveyardResponse["lastScan"] {
  const scan = history.scans[history.scans.length - 1];
  if (scan === undefined) return null;
  return {
    scannedAt: scan.scannedAt,
    statementRange: scan.statementRange,
    undeadCount: scan.undeadCount,
    yearlyTotals: scan.yearlyTotals,
  };
}

export async function handle(request: RouteRequest, context: RouteContext): Promise<RouteReply> {
  if (request.method === "GET" && request.url === "/api/health") {
    return { status: 200, json: { ok: true } };
  }
  const allowed = verifyProxyV2({
    secret: context.secret,
    v2Header: request.headers["x-kirocrew-proxy-v2"],
    nonceHeader: request.headers["x-kirocrew-proxy-nonce"],
    method: request.method,
    target: request.url,
    body: request.body,
    nowSeconds: context.nowSeconds,
    cache: context.cache,
  });
  if (!allowed) return { status: 401, json: { error: "unauthorized" } };
  if (request.method !== "GET") return { status: 405, json: { error: "method-not-allowed" } };
  const path = request.url.split("?")[0];
  if (path !== "/api/graveyard") return { status: 404, json: { error: "not-found" } };

  const loaded = await readHistoryFile(context.dataDir);
  if ("error" in loaded) return { status: 200, json: { ok: false, reason: loaded.error } };
  const response: { ok: true } & GraveyardResponse = {
    ok: true,
    ...graveyardView(loaded.history, context.timeZone),
    lastScan: lastScanOf(loaded.history),
  };
  return { status: 200, json: response };
}
