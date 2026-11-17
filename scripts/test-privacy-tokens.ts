// Test helper for the privacy scans (design "Privacy enforcement", rows 1 and 2): the tokens
// that mean a network call or a child process, and a line-by-line finder.

export interface PrivacyToken {
  name: string;
  pattern: RegExp;
}

/** Network tokens of Req 13.1. Each pattern is global so a finder can walk every hit. */
export const NETWORK_TOKENS: readonly PrivacyToken[] = [
  { name: "fetch(", pattern: /fetch\(/g },
  { name: "XMLHttpRequest", pattern: /XMLHttpRequest/g },
  { name: "WebSocket", pattern: /WebSocket/g },
  { name: "sendBeacon", pattern: /sendBeacon/g },
  { name: "http.request", pattern: /http\.request/g },
  { name: "https.request", pattern: /https\.request/g },
  { name: "http.get", pattern: /http\.get/g },
  { name: "https.get", pattern: /https\.get/g },
  { name: "net.connect", pattern: /net\.connect/g },
  { name: "tls.connect", pattern: /tls\.connect/g },
  { name: "dgram", pattern: /dgram/g },
  { name: "dns", pattern: /\bdns\b/g },
  { name: "EventSource", pattern: /EventSource/g },
];

export const CHILD_PROCESS_TOKEN: PrivacyToken = {
  name: "child_process",
  pattern: /child_process/g,
};

export interface TokenHit {
  token: string;
  /** 1-based line number. */
  line: number;
  /** Offset of the hit in the whole text. */
  index: number;
}

export function findHits(text: string, tokens: readonly PrivacyToken[]): TokenHit[] {
  const hits: TokenHit[] = [];
  for (const token of tokens) {
    for (const match of text.matchAll(token.pattern)) {
      const index = match.index;
      const line = text.slice(0, index).split("\n").length;
      hits.push({ token: token.name, line, index });
    }
  }
  return hits.sort((a, b) => a.index - b.index);
}
