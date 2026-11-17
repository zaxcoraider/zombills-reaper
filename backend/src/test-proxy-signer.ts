// Test-only reference signer for the v2 proxy header, written from Crew's
// apps/proxy_auth.py (_proxy_v2_signature). Independent of verifyProxyV2.
import { createHash, createHmac } from "node:crypto";

export interface SignInput {
  secret: string;
  tsStr: string;
  nonce: string;
  method: string;
  target: string;
  body: Buffer;
}

export function referenceSignature(i: SignInput): string {
  const bodyHash = createHash("sha256").update(i.body).digest("hex");
  const message = `v2:${i.tsStr}:${i.nonce}:${i.method}:${i.target}:${bodyHash}`;
  return createHmac("sha256", Buffer.from(i.secret, "utf8")).update(message, "utf8").digest("hex");
}

export function referenceHeader(i: SignInput): string {
  return `${i.tsStr}:${referenceSignature(i)}`;
}
