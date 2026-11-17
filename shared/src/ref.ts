import { createHash } from "node:crypto";

/** Short stable id for a History key. Tool results carry this, never the key (design "Types"). */
export function refOf(key: string): string {
  return createHash("sha256").update(key, "utf8").digest("hex").slice(0, 12);
}
