/** A small in-process sliding-window limiter (the service is a single instance). Login and sync triggers only: not a general WAF. */
const hits = new Map<string, number[]>();

export function allow(key: string, limit: number, windowMs: number, now: number = Date.now()): boolean {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5_000) for (const [k, v] of hits) if (v.every((t) => now - t >= windowMs)) hits.delete(k);
  return true;
}

export const clientKey = (headers: { get(name: string): string | null }): string => (headers.get("x-forwarded-for") ?? "unknown").split(",")[0].trim().slice(0, 64) || "unknown";

export function resetRateLimitsForTests(): void {
  hits.clear();
}
