import { describe, expect, it } from "vitest";
import { readBackendEnv } from "./env.ts";

const SECRET = "s3cret";

describe("readBackendEnv", () => {
  it.each(["0", "65536", "08", "80a", "", "-1", "123456"])("rejects PORT %j", (port) => {
    expect(readBackendEnv({ PORT: port, KIROCREW_PROXY_SECRET: SECRET })).toEqual({
      ok: false,
      bad: "PORT",
    });
  });

  it("rejects a missing PORT", () => {
    expect(readBackendEnv({ KIROCREW_PROXY_SECRET: SECRET })).toEqual({ ok: false, bad: "PORT" });
  });

  it("rejects an empty or missing secret", () => {
    expect(readBackendEnv({ PORT: "8080", KIROCREW_PROXY_SECRET: "" })).toEqual({
      ok: false,
      bad: "KIROCREW_PROXY_SECRET",
    });
    expect(readBackendEnv({ PORT: "8080" })).toEqual({
      ok: false,
      bad: "KIROCREW_PROXY_SECRET",
    });
  });

  it("names PORT first when both are bad", () => {
    expect(readBackendEnv({})).toEqual({ ok: false, bad: "PORT" });
  });

  it.each([1, 65535])("accepts PORT %i", (port) => {
    expect(readBackendEnv({ PORT: String(port), KIROCREW_PROXY_SECRET: SECRET })).toEqual({
      ok: true,
      port,
      secret: SECRET,
    });
  });
});
