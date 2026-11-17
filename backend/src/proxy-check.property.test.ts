import fc from "fast-check";
import { describe, it } from "vitest";
import { verifyProxyV2 } from "./proxy-check.ts";
import { ReplayCache } from "./replay-cache.ts";
import { referenceHeader, type SignInput } from "./test-proxy-signer.ts";

const NOW = 1_800_000_000;
const RUNS = 300;

const hex32 = fc.stringMatching(/^[0-9a-f]{32}$/);
const secret = fc.string({ minLength: 1, maxLength: 40 });
const method = fc.constantFrom("GET", "POST", "PUT", "DELETE", "HEAD");
const target = fc.string({ maxLength: 40 }).map((s) => `/api/${s.replace(/[\r\n]/g, "")}`);
const body = fc.uint8Array({ maxLength: 64 }).map((a) => Buffer.from(a));
const offset = fc.integer({ min: -60, max: 60 });

const scenario = fc.record({ secret, nonce: hex32, method, target, body, offset });

function inputs(s: {
  secret: string;
  nonce: string;
  method: string;
  target: string;
  body: Buffer;
  offset: number;
}) {
  const ts = NOW + s.offset;
  const sign: SignInput = {
    secret: s.secret,
    tsStr: String(ts),
    nonce: s.nonce,
    method: s.method,
    target: s.target,
    body: s.body,
  };
  return { sign, header: referenceHeader(sign) };
}

function verify(
  s: { secret: string; nonce: string; method: string; target: string; body: Buffer },
  header: string,
  cache = new ReplayCache(),
  now = NOW,
): boolean {
  return verifyProxyV2({
    secret: s.secret,
    v2Header: header,
    nonceHeader: s.nonce,
    method: s.method,
    target: s.target,
    body: s.body,
    nowSeconds: now,
    cache,
  });
}

function flipChar(text: string, at: number): string {
  const i = at % text.length;
  const c = text[i] ?? "0";
  const repl = c === "0" ? "1" : "0";
  return text.slice(0, i) + repl + text.slice(i + 1);
}

describe("verifyProxyV2 properties", () => {
  it("P10: a reference-signed header is accepted once, then refused", () => {
    fc.assert(
      fc.property(scenario, (s) => {
        const { header } = inputs(s);
        const cache = new ReplayCache();
        return verify(s, header, cache) && !verify(s, header, cache);
      }),
      { numRuns: RUNS },
    );
  });

  it("P10: one changed character in ts, signature or nonce is refused", () => {
    fc.assert(
      fc.property(scenario, fc.nat(), (s, at) => {
        const { header } = inputs(s);
        const colon = header.indexOf(":");
        const ts = header.slice(0, colon);
        const sig = header.slice(colon + 1);
        const badTs = `${flipChar(ts, at)}:${sig}`;
        const badSig = `${ts}:${flipChar(sig, at)}`;
        const badNonce = { ...s, nonce: flipChar(s.nonce, at) };
        return !verify(s, badTs) && !verify(s, badSig) && !verify(badNonce, header);
      }),
      { numRuns: RUNS },
    );
  });

  it("P10: a changed method, target, body or secret is refused", () => {
    fc.assert(
      fc.property(scenario, (s) => {
        const { header } = inputs(s);
        return (
          !verify({ ...s, method: `${s.method}X` }, header) &&
          !verify({ ...s, target: `${s.target}x` }, header) &&
          !verify({ ...s, body: Buffer.concat([s.body, Buffer.from("x")]) }, header) &&
          !verify({ ...s, secret: `${s.secret}x` }, header)
        );
      }),
      { numRuns: RUNS },
    );
  });

  it("P10: a ts outside the window is refused even when correctly signed", () => {
    fc.assert(
      fc.property(
        scenario,
        fc.integer({ min: 61, max: 100_000 }),
        fc.boolean(),
        (s, far, early) => {
          const { header } = inputs({ ...s, offset: 0 });
          return !verify(s, header, new ReplayCache(), early ? NOW - far : NOW + far);
        },
      ),
      { numRuns: RUNS },
    );
  });

  it("P10: a nonce of the wrong shape is refused even when correctly signed", () => {
    fc.assert(
      fc.property(
        scenario,
        fc.oneof(
          fc.stringMatching(/^[0-9a-f]{0,31}$/),
          fc.stringMatching(/^[0-9a-f]{33,40}$/),
          fc.stringMatching(/^[0-9A-F]{32}$/).filter((n) => n !== n.toLowerCase()),
        ),
        (s, nonce) => {
          const bad = { ...s, nonce };
          const { header } = inputs(bad);
          return !verify(bad, header);
        },
      ),
      { numRuns: RUNS },
    );
  });
});
