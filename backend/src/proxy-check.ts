// Proxy check v2, mirroring verify_proxy_request_v2 in Crew's apps/proxy_auth.py
// (design "Proxy check v2"). Fails closed on every malformed input.
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { ReplayCache } from "./replay-cache.ts";

export interface ProxyV2Input {
  secret: string;
  v2Header: string | string[] | undefined; // req.headers["x-kirocrew-proxy-v2"]
  nonceHeader: string | string[] | undefined; // req.headers["x-kirocrew-proxy-nonce"]
  method: string; // req.method
  target: string; // req.url, raw
  body: Buffer;
  nowSeconds: number; // Date.now() / 1000, not rounded
  cache: ReplayCache;
}

export function verifyProxyV2(i: ProxyV2Input): boolean {
  if (!i.secret || typeof i.v2Header !== "string" || typeof i.nonceHeader !== "string") {
    return false;
  }
  if (!i.v2Header || !i.nonceHeader) return false;
  if (!/^[0-9a-f]{32}$/.test(i.nonceHeader)) return false; // _is_request_id
  const colon = i.v2Header.indexOf(":"); // str.partition
  const tsStr = colon < 0 ? i.v2Header : i.v2Header.slice(0, colon);
  const sig = colon < 0 ? "" : i.v2Header.slice(colon + 1);
  if (!/^[0-9]{1,12}$/.test(tsStr)) return false; // isascii + isdigit, at most 12
  if (sig === "") return false;
  const ts = Number(tsStr);
  if (!(i.nowSeconds - 60 <= ts && ts <= i.nowSeconds + 60)) return false;
  const bodyHash = createHash("sha256").update(i.body).digest("hex");
  const message = `v2:${tsStr}:${i.nonceHeader}:${i.method}:${i.target}:${bodyHash}`;
  const expected = createHmac("sha256", Buffer.from(i.secret, "utf8"))
    .update(message, "utf8")
    .digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(sig, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  return i.cache.accept(i.nonceHeader, ts + 60, i.nowSeconds); // replay check last
}
