import { describe, expect, it } from "vitest";
import { verifyProxyV2, type ProxyV2Input } from "./proxy-check.ts";
import { ReplayCache } from "./replay-cache.ts";
import { referenceHeader } from "./test-proxy-signer.ts";

// Fixed vector from Crew's own signer, run once on this machine:
// ~/.kiro/crew-venv/bin/python -c "from kiro_crew.apps.proxy_auth import sign_proxy_request_v2;
//   print(sign_proxy_request_v2(secret='test-secret-for-reaper', ts=1800000000,
//   nonce='0123456789abcdef0123456789abcdef', method='GET', target='/api/graveyard?x=1', body=b''))"
const VECTOR = {
  secret: "test-secret-for-reaper",
  ts: 1800000000,
  nonce: "0123456789abcdef0123456789abcdef",
  method: "GET",
  target: "/api/graveyard?x=1",
  header: "1800000000:3f28248cf66d996f5397ce8adfa7b73ecbfe471ad37eabb30467fe7568574fea",
};

function vectorInput(over: Partial<ProxyV2Input> = {}): ProxyV2Input {
  return {
    secret: VECTOR.secret,
    v2Header: VECTOR.header,
    nonceHeader: VECTOR.nonce,
    method: VECTOR.method,
    target: VECTOR.target,
    body: Buffer.alloc(0),
    nowSeconds: VECTOR.ts,
    cache: new ReplayCache(),
    ...over,
  };
}

function signed(tsStr: string, nonce = VECTOR.nonce): string {
  return referenceHeader({
    secret: VECTOR.secret,
    tsStr,
    nonce,
    method: VECTOR.method,
    target: VECTOR.target,
    body: Buffer.alloc(0),
  });
}

describe("verifyProxyV2", () => {
  it("accepts Crew's own vector once, then refuses the replay", () => {
    const cache = new ReplayCache();
    expect(verifyProxyV2(vectorInput({ cache }))).toBe(true);
    expect(verifyProxyV2(vectorInput({ cache }))).toBe(false);
  });

  it("refuses a changed method, target, body or secret", () => {
    expect(verifyProxyV2(vectorInput({ method: "POST" }))).toBe(false);
    expect(verifyProxyV2(vectorInput({ target: "/api/graveyard?x=2" }))).toBe(false);
    expect(verifyProxyV2(vectorInput({ body: Buffer.from("x") }))).toBe(false);
    expect(verifyProxyV2(vectorInput({ secret: "other" }))).toBe(false);
  });

  it("accepts a leading-zero ts signed as sent", () => {
    const tsStr = "01800000000";
    expect(verifyProxyV2(vectorInput({ v2Header: signed(tsStr) }))).toBe(true);
  });

  it("refuses a ts 61 s off and accepts 60 s off", () => {
    const now = VECTOR.ts;
    expect(verifyProxyV2(vectorInput({ nowSeconds: now + 61 }))).toBe(false);
    expect(verifyProxyV2(vectorInput({ nowSeconds: now - 61 }))).toBe(false);
    expect(verifyProxyV2(vectorInput({ nowSeconds: now + 60 }))).toBe(true);
    expect(verifyProxyV2(vectorInput({ nowSeconds: now - 60 }))).toBe(true);
  });

  it("refuses a doubled header joined with a comma and a space", () => {
    const joined = `${VECTOR.header}, ${VECTOR.header}`;
    expect(verifyProxyV2(vectorInput({ v2Header: joined }))).toBe(false);
  });

  it("refuses an array value", () => {
    expect(verifyProxyV2(vectorInput({ v2Header: [VECTOR.header] }))).toBe(false);
    expect(verifyProxyV2(vectorInput({ nonceHeader: [VECTOR.nonce] }))).toBe(false);
  });

  it.each([
    ["31 characters", VECTOR.nonce.slice(1)],
    ["33 characters", `${VECTOR.nonce}0`],
    ["upper case", VECTOR.nonce.toUpperCase()],
  ])("refuses a nonce of %s", (_name, nonce) => {
    expect(
      verifyProxyV2(vectorInput({ nonceHeader: nonce, v2Header: signed("1800000000", nonce) })),
    ).toBe(false);
  });

  it("refuses an empty signature, a missing colon and missing headers", () => {
    expect(verifyProxyV2(vectorInput({ v2Header: "1800000000:" }))).toBe(false);
    expect(verifyProxyV2(vectorInput({ v2Header: "1800000000" }))).toBe(false);
    expect(verifyProxyV2(vectorInput({ v2Header: undefined }))).toBe(false);
    expect(verifyProxyV2(vectorInput({ nonceHeader: undefined }))).toBe(false);
    expect(verifyProxyV2(vectorInput({ v2Header: "" }))).toBe(false);
  });

  it("refuses an empty secret and a ts that is not 1 to 12 ASCII digits", () => {
    expect(verifyProxyV2(vectorInput({ secret: "" }))).toBe(false);
    expect(verifyProxyV2(vectorInput({ v2Header: signed("²") }))).toBe(false);
    expect(verifyProxyV2(vectorInput({ v2Header: signed("1800000000000") }))).toBe(false);
    expect(verifyProxyV2(vectorInput({ v2Header: signed("") }))).toBe(false);
  });

  it("does not take a cache entry when the signature is wrong", () => {
    const cache = new ReplayCache();
    const bad = VECTOR.header.slice(0, -1) + (VECTOR.header.endsWith("a") ? "b" : "a");
    expect(verifyProxyV2(vectorInput({ cache, v2Header: bad }))).toBe(false);
    expect(verifyProxyV2(vectorInput({ cache }))).toBe(true);
  });
});
