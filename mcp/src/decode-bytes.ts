// Decodes statement bytes (design "Scan algorithm" step 5, Req 4.3).

const BOM = [0xef, 0xbb, 0xbf] as const;

function hasBom(bytes: Uint8Array): boolean {
  return bytes.length >= 3 && BOM.every((b, i) => bytes[i] === b);
}

export function decodeStatementBytes(bytes: Uint8Array): string {
  const body = hasBom(bytes) ? bytes.subarray(3) : bytes;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(body);
  } catch {
    return new TextDecoder("windows-1252").decode(body);
  }
}
