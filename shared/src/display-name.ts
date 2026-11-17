const MAX_NAME_CODE_POINTS = 80;
const CUT_CODE_POINTS = 79;

function collapse(text: string): string {
  return text.normalize("NFC").trim().replace(/\s+/gu, " ");
}

/** NFC, trimmed, white space collapsed, capped at 80 code points (79 plus an ellipsis). */
export function displayName(text: string): string {
  const collapsed = collapse(text);
  const points = [...collapsed];
  if (points.length <= MAX_NAME_CODE_POINTS) return collapsed;
  return points.slice(0, CUT_CODE_POINTS).join("") + "…";
}

/** The comparison form of a name: like `displayName` without the cap, lower case. */
export function foldName(text: string): string {
  return collapse(text).toLowerCase();
}
