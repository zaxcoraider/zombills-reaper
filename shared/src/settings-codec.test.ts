import { describe, expect, it } from "vitest";
import { decodeSettings, encodeSettings } from "./settings-codec.ts";

describe("decodeSettings", () => {
  it("reads a valid file", () => {
    const text = JSON.stringify({ version: 1, statementsFolder: "/a/b" });
    expect(decodeSettings(text)).toEqual({
      kind: "ok",
      settings: { version: 1, statementsFolder: "/a/b" },
    });
  });

  it("ignores extra keys", () => {
    const text = JSON.stringify({ version: 1, statementsFolder: "/a/b", extra: true });
    expect(decodeSettings(text)).toEqual({
      kind: "ok",
      settings: { version: 1, statementsFolder: "/a/b" },
    });
  });

  it.each([
    ["missing statementsFolder", JSON.stringify({ version: 1 })],
    ["empty statementsFolder", JSON.stringify({ version: 1, statementsFolder: "" })],
    ["non-string statementsFolder", JSON.stringify({ version: 1, statementsFolder: 5 })],
    ["version 2", JSON.stringify({ version: 2, statementsFolder: "/a" })],
    ["missing version", JSON.stringify({ statementsFolder: "/a" })],
    ["an array", "[]"],
    ["null", "null"],
    ["a string", '"x"'],
    ["not JSON", "{nope"],
    ["empty text", ""],
  ])("returns not-configured for %s", (_label, text) => {
    expect(decodeSettings(text)).toEqual({ kind: "not-configured" });
  });
});

describe("encodeSettings", () => {
  it("writes only version and statementsFolder, with a final newline", () => {
    const settings = { version: 1, statementsFolder: "/a/b", extra: 1 } as const;
    // The extra key is not in the Settings type; it stands for a value read from an old file.
    expect(encodeSettings(settings)).toBe('{"version":1,"statementsFolder":"/a/b"}\n');
  });

  it("round-trips through decodeSettings", () => {
    const settings = { version: 1 as const, statementsFolder: "/x y/z" };
    expect(decodeSettings(encodeSettings(settings))).toEqual({ kind: "ok", settings });
  });
});
