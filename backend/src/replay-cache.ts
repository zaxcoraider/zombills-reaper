// Nonce cache, mirroring Crew's ProxyPrincipalReplayCache (design "Proxy check v2").
// One instance lives as long as the backend process. A full cache refuses, never evicts.

export class ReplayCache {
  readonly maxEntries = 4096;
  private readonly seen = new Map<string, number>();

  accept(nonce: string, expiresAt: number, now: number): boolean {
    for (const [key, expiry] of this.seen) {
      if (expiry < now) this.seen.delete(key);
    }
    if (this.seen.has(nonce) || this.seen.size >= this.maxEntries) return false;
    this.seen.set(nonce, expiresAt);
    return true;
  }
}
