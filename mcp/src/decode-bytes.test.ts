import { describe, expect, it } from "vitest";
import { decodeStatementBytes } from "./decode-bytes.js";

const encode = (text: string): Uint8Array => new TextEncoder().encode(text);

describe("decodeStatementBytes", () => {
  it("decodes UTF-8 without a BOM", () => {
    expect(decodeStatementBytes(encode("Café,1"))).toBe("Café,1");
  });

  it("strips a UTF-8 BOM", () => {
    const body = encode("Date,Amount");
    const withBom = new Uint8Array([0xef, 0xbb, 0xbf, ...body]);
    expect(decodeStatementBytes(withBom)).toBe("Date,Amount");
  });

  it("falls back to Windows-1252: 0xE9 alone is é", () => {
    expect(decodeStatementBytes(new Uint8Array([0x63, 0x61, 0x66, 0xe9]))).toBe("café");
  });

  it("falls back to Windows-1252: 0x80 is €", () => {
    expect(decodeStatementBytes(new Uint8Array([0x80]))).toBe("€");
  });
});
