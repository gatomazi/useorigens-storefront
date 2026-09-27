import type { CommerceStoreKey } from "../geo/regions";
import { FAVORITES_MAX_ITEMS, type FavoriteItem, type FavoritesSnapshotV1 } from "./types";

/**
 * "Meus Lugares", client-only. Same shape as `cart-mirror/token-store.ts`: localStorage first (this is meant to
 * survive closing the browser, unlike the cart-mirror token), in-memory fallback when storage is unavailable, a
 * listener set for same-tab reactivity (`storage` never fires in the tab that wrote). Never sends this data
 * anywhere by itself — it is only read by the Meus Lugares page and the buy-session request it makes.
 */
const STORAGE_KEY = "origens:favorites:v1";

let memorySnapshot: FavoritesSnapshotV1 = { v: 1, items: [] };
let usingMemory = false;
// `useSyncExternalStore` requires the same snapshot to be `===`-stable between renders, or it re-renders forever
// (React error: "The result of getSnapshot should be cached to avoid an infinite loop"). `read()` used to re-parse
// localStorage — a fresh array — on every call; this cache is invalidated only by `write()`, never by a plain read.
let cache: FavoritesSnapshotV1 | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((listener) => listener());
}

function isFavoriteItem(value: unknown): value is FavoriteItem {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.inkProductId === "string" &&
    typeof v.commerceStoreKey === "string" &&
    typeof v.title === "string" &&
    (v.context === null || typeof v.context === "string") &&
    typeof v.imageUrl === "string" &&
    (v.price === null || typeof v.price === "number") &&
    typeof v.addedAt === "number"
  );
}

/** Parses and whitelists whatever was in storage. Anything malformed (older/foreign format, tampering) becomes an empty list, never a crash. */
function parse(raw: string | null): FavoritesSnapshotV1 {
  if (!raw) return { v: 1, items: [] };
  try {
    const data = JSON.parse(raw) as unknown;
    if (!data || typeof data !== "object" || (data as { v?: unknown }).v !== 1) return { v: 1, items: [] };
    const items = (data as { items?: unknown }).items;
    if (!Array.isArray(items)) return { v: 1, items: [] };
    return { v: 1, items: items.filter(isFavoriteItem).slice(0, FAVORITES_MAX_ITEMS) };
  } catch {
    return { v: 1, items: [] };
  }
}

function read(): FavoritesSnapshotV1 {
  if (cache) return cache;
  if (typeof window === "undefined") return { v: 1, items: [] };
  if (usingMemory) return (cache = memorySnapshot);
  try {
    return (cache = parse(window.localStorage.getItem(STORAGE_KEY)));
  } catch {
    return (cache = memorySnapshot);
  }
}

function write(snapshot: FavoritesSnapshotV1): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    usingMemory = false;
  } catch {
    memorySnapshot = snapshot;
    usingMemory = true;
  }
  cache = snapshot;
  emit();
}

const sameProduct = (a: Pick<FavoriteItem, "inkProductId" | "commerceStoreKey">, b: Pick<FavoriteItem, "inkProductId" | "commerceStoreKey">) =>
  a.inkProductId === b.inkProductId && a.commerceStoreKey === b.commerceStoreKey;

export function getFavorites(): FavoriteItem[] {
  return read().items;
}

export function isFavorite(inkProductId: string, commerceStoreKey: CommerceStoreKey): boolean {
  return read().items.some((item) => sameProduct(item, { inkProductId, commerceStoreKey }));
}

/** Adds if not already saved (no-op if already there); keeps insertion order; drops the oldest past the cap. */
export function addFavorite(input: Omit<FavoriteItem, "addedAt">): void {
  const current = read();
  if (current.items.some((item) => sameProduct(item, input))) return;
  const items = [...current.items, { ...input, addedAt: Date.now() }].slice(-FAVORITES_MAX_ITEMS);
  write({ v: 1, items });
}

export function removeFavorite(inkProductId: string, commerceStoreKey: CommerceStoreKey): void {
  const current = read();
  const items = current.items.filter((item) => !sameProduct(item, { inkProductId, commerceStoreKey }));
  if (items.length === current.items.length) return;
  write({ v: 1, items });
}

export function toggleFavorite(input: Omit<FavoriteItem, "addedAt">): void {
  if (isFavorite(input.inkProductId, input.commerceStoreKey)) removeFavorite(input.inkProductId, input.commerceStoreKey);
  else addFavorite(input);
}

export function subscribeFavorites(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
