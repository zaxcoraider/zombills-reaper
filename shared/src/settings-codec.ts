import type { Settings } from "./types.ts";

export type SettingsDecode = { kind: "ok"; settings: Settings } | { kind: "not-configured" };

/** Anything but a plain object with `version` 1 and a non-empty `statementsFolder` is "not-configured". */
export function decodeSettings(text: string): SettingsDecode {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { kind: "not-configured" };
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    Array.isArray(parsed) ||
    Object.getPrototypeOf(parsed) !== Object.prototype
  ) {
    return { kind: "not-configured" };
  }
  const object = parsed as Record<string, unknown>;
  const version = Object.hasOwn(object, "version") ? object["version"] : undefined;
  const folder = Object.hasOwn(object, "statementsFolder") ? object["statementsFolder"] : undefined;
  if (version !== 1 || typeof folder !== "string" || folder.length === 0) {
    return { kind: "not-configured" };
  }
  return { kind: "ok", settings: { version: 1, statementsFolder: folder } };
}

/** Writes only `version` and `statementsFolder`. */
export function encodeSettings(settings: Settings): string {
  return JSON.stringify({ version: 1, statementsFolder: settings.statementsFolder }) + "\n";
}
