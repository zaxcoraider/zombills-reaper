import { describe, expect, it } from "vitest";
import { refOf } from "./ref.ts";

describe("refOf", () => {
  it("matches sha256 of the key, first 12 hex characters", () => {
    // printf %s netflix | shasum -a 256 | cut -c1-12
    expect(refOf("netflix")).toBe("13ed070478ef");
  });

  it("is 12 lowercase hex characters", () => {
    expect(refOf("unidentified:paypal:ref 123")).toMatch(/^[0-9a-f]{12}$/);
  });

  it("differs for keys that differ in one character", () => {
    expect(refOf("netflix")).not.toBe(refOf("netflic"));
  });
});
