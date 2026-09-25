import { CART_REF_PATTERN, CART_REF_STORAGE_KEY } from "./constants";

/**
 * The cart token lives ONLY in sessionStorage (this tab, this session) — never localStorage, never the snapshot. If storage is
 * unavailable (private mode, blocked site data) it falls back to memory for the life of the page. Same-tab subscribers are
 * notified through a listener set, because `storage` events do not fire in the tab that wrote.
 */
let memoryToken: string | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.sessionStorage.getItem(CART_REF_STORAGE_KEY);
    if (stored && CART_REF_PATTERN.test(stored)) return stored;
    if (stored) window.sessionStorage.removeItem(CART_REF_STORAGE_KEY); // malformed leftovers never become fetches
    return memoryToken;
  } catch {
    return memoryToken;
  }
}

export function setToken(token: string): void {
  if (!CART_REF_PATTERN.test(token)) return;
  memoryToken = null;
  try {
    window.sessionStorage.setItem(CART_REF_STORAGE_KEY, token);
  } catch {
    memoryToken = token;
  }
  emit();
}

export function clearToken(): void {
  memoryToken = null;
  try {
    window.sessionStorage.removeItem(CART_REF_STORAGE_KEY);
  } catch {
    // nothing to clear
  }
  emit();
}

export function subscribeToken(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
