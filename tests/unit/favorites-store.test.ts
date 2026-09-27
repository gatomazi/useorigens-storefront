import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { FavoriteItem } from "@/lib/favorites/types";

const mkStorage = (data: Map<string, string>) => ({
  getItem: (k: string) => data.get(k) ?? null,
  setItem: (k: string, v: string) => void data.set(k, v),
  removeItem: (k: string) => void data.delete(k),
});

const item = (over: Partial<Omit<FavoriteItem, "addedAt">> = {}): Omit<FavoriteItem, "addedAt"> => ({
  inkProductId: "4932916",
  commerceStoreKey: "use-sul",
  title: "Ponto de Origem",
  context: "Florianópolis · SC",
  imageUrl: "https://example.com/a.jpg",
  price: 109.9,
  ...over,
});

describe("favorites store (localStorage)", () => {
  let local: Map<string, string>;
  beforeEach(() => {
    vi.resetModules();
    local = new Map();
    vi.stubGlobal("window", { localStorage: mkStorage(local) });
  });
  afterEach(() => vi.unstubAllGlobals());

  test("given a new item, then addFavorite saves it and isFavorite is true", async () => {
    const store = await import("@/lib/favorites/store");
    store.addFavorite(item());
    expect(store.isFavorite("4932916", "use-sul")).toBe(true);
    expect(store.getFavorites()).toHaveLength(1);
    expect(local.size).toBe(1);
  });

  test("given the same product added twice, then it is saved only once", async () => {
    const store = await import("@/lib/favorites/store");
    store.addFavorite(item());
    store.addFavorite(item({ title: "different cached title" })); // still same identity: inkProductId + store
    expect(store.getFavorites()).toHaveLength(1);
    expect(store.getFavorites()[0].title).toBe("Ponto de Origem"); // first write wins, not overwritten
  });

  test("given the same INK id from a different store, then both are kept (identity is id + store)", async () => {
    const store = await import("@/lib/favorites/store");
    store.addFavorite(item({ commerceStoreKey: "use-sul" }));
    store.addFavorite(item({ commerceStoreKey: "use-norte" }));
    expect(store.getFavorites()).toHaveLength(2);
  });

  test("given a saved item, then removeFavorite removes only that one", async () => {
    const store = await import("@/lib/favorites/store");
    store.addFavorite(item({ inkProductId: "1" }));
    store.addFavorite(item({ inkProductId: "2" }));
    store.removeFavorite("1", "use-sul");
    expect(store.getFavorites().map((i) => i.inkProductId)).toEqual(["2"]);
  });

  test("given toggleFavorite, then it saves when absent and removes when present", async () => {
    const store = await import("@/lib/favorites/store");
    store.toggleFavorite(item());
    expect(store.isFavorite("4932916", "use-sul")).toBe(true);
    store.toggleFavorite(item());
    expect(store.isFavorite("4932916", "use-sul")).toBe(false);
  });

  test("given malformed JSON in storage, then getFavorites returns an empty list instead of throwing", async () => {
    local.set("origens:favorites:v1", "{not json");
    const store = await import("@/lib/favorites/store");
    expect(store.getFavorites()).toEqual([]);
  });

  test("given a foreign/old-format payload in storage, then it is discarded", async () => {
    local.set("origens:favorites:v1", JSON.stringify({ v: 2, items: [item()] }));
    const store = await import("@/lib/favorites/store");
    expect(store.getFavorites()).toEqual([]);
  });

  test("given blocked storage, then it falls back to memory without throwing", async () => {
    const boom = () => {
      throw new Error("blocked");
    };
    vi.stubGlobal("window", { localStorage: { getItem: boom, setItem: boom, removeItem: boom } });
    const store = await import("@/lib/favorites/store");
    store.addFavorite(item());
    expect(store.isFavorite("4932916", "use-sul")).toBe(true);
  });

  test("given subscribers, then add and remove notify them", async () => {
    const store = await import("@/lib/favorites/store");
    const listener = vi.fn();
    const off = store.subscribeFavorites(listener);
    store.addFavorite(item());
    store.removeFavorite("4932916", "use-sul");
    off();
    store.addFavorite(item());
    expect(listener).toHaveBeenCalledTimes(2);
  });

  test("given more than the cap, then the oldest is dropped and order is kept", async () => {
    const store = await import("@/lib/favorites/store");
    const { FAVORITES_MAX_ITEMS } = await import("@/lib/favorites/types");
    for (let i = 0; i < FAVORITES_MAX_ITEMS + 5; i++) store.addFavorite(item({ inkProductId: String(i) }));
    const ids = store.getFavorites().map((f) => f.inkProductId);
    expect(ids).toHaveLength(FAVORITES_MAX_ITEMS);
    expect(ids[0]).toBe("5"); // the first 5 (oldest) were dropped
    expect(ids.at(-1)).toBe(String(FAVORITES_MAX_ITEMS + 4));
  });
});
