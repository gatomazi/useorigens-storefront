import type { RegionSlug } from "../geo/regions";
import { CART_REF_PATTERN, cartRefStorageKey } from "./constants";

/**
 * The cart token lives ONLY in sessionStorage (this tab, this session) — never localStorage, never the snapshot. If storage is
 * unavailable (private mode, blocked site data) it falls back to memory for the life of the page. Same-tab subscribers are
 * notified through a listener set, because `storage` events do not fire in the tab that wrote.
 * One token per REGION (each region's INK store has its own Worker and KV): a Norte token is never offered to the Sul route, or the reverse.
 * `region` is the last, optional argument and defaults to "sul" (the original single-region behavior).
 */
const memoryTokens = new Map<RegionSlug, string>();
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

export function getToken(region: RegionSlug = "sul"): string | null {
  if (typeof window === "undefined") return null;
  const key = cartRefStorageKey(region);
  try {
    const stored = window.sessionStorage.getItem(key);
    if (stored && CART_REF_PATTERN.test(stored)) return stored;
    if (stored) window.sessionStorage.removeItem(key); // malformed leftovers never become fetches
    return memoryTokens.get(region) ?? null;
  } catch {
    return memoryTokens.get(region) ?? null;
  }
}

export function setToken(token: string, region: RegionSlug = "sul"): void {
  if (!CART_REF_PATTERN.test(token)) return;
  memoryTokens.delete(region);
  try {
    window.sessionStorage.setItem(cartRefStorageKey(region), token);
  } catch {
    memoryTokens.set(region, token);
  }
  emit();
}

export function clearToken(region: RegionSlug = "sul"): void {
  memoryTokens.delete(region);
  try {
    window.sessionStorage.removeItem(cartRefStorageKey(region));
  } catch {
    // nothing to clear
  }
  emit();
}

export function subscribeToken(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
