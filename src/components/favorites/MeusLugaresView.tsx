"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { ProductPhoto } from "@/components/catalog/ProductPhoto";
import { TrackedInkLink } from "@/components/analytics/TrackedInkLink";
import { SOURCES } from "@/lib/analytics/sources";
import { trackGoToInk } from "@/lib/analytics/track";
import { formatPrice } from "@/lib/format";
import { withListSession } from "@/lib/favorites/buy-session-url";
import { getFavorites, removeFavorite, subscribeFavorites } from "@/lib/favorites/store";
import type { FavoriteItem } from "@/lib/favorites/types";
import { REGIONS, type CommerceStoreKey, type RegionSlug } from "@/lib/geo/regions";

type Resolved = { available: true; title: string; context: string | null; imageUrl: string; price: number | null; url: string } | { available: false };

// `useSyncExternalStore`'s getServerSnapshot must return the SAME reference every call (React compares by
// identity) — an inline `() => []` allocates a new array each time and triggers "The result of getServerSnapshot
// should be cached to avoid an infinite loop" during hydration.
const EMPTY_FAVORITES: readonly FavoriteItem[] = [];

const storeLabel = (storeKey: CommerceStoreKey): string => Object.values(REGIONS).find((r) => r.storeKey === storeKey)?.name ?? "Use Origens";
const groupKey = (storeKey: CommerceStoreKey, id: string) => `${storeKey}:${id}`;

/** One request per store, batching every id currently favorited there — never one request per item. */
async function resolveGroup(storeKey: CommerceStoreKey, ids: string[], signal: AbortSignal): Promise<Map<string, Resolved>> {
  const out = new Map<string, Resolved>();
  try {
    const response = await fetch(`/api/favorites/resolve?store=${encodeURIComponent(storeKey)}&ids=${encodeURIComponent(ids.join(","))}`, { signal, credentials: "omit" });
    if (!response.ok) return out;
    const data = (await response.json()) as { items: ({ inkProductId: string } & Record<string, unknown>)[] };
    for (const item of data.items ?? []) {
      out.set(
        groupKey(storeKey, item.inkProductId),
        item.available ? { available: true, title: item.title as string, context: item.context as string | null, imageUrl: item.imageUrl as string, price: item.price as number | null, url: item.url as string } : { available: false },
      );
    }
  } catch {
    // Offline/timeout: the page keeps showing the cached snapshot, nothing crashes.
  }
  return out;
}

export function MeusLugaresView({ region }: { region: RegionSlug }) {
  const favorites = useSyncExternalStore(subscribeFavorites, getFavorites, () => EMPTY_FAVORITES) as FavoriteItem[];
  const [resolved, setResolved] = useState<Map<string, Resolved>>(new Map());
  const [buying, setBuying] = useState<CommerceStoreKey | null>(null);

  const byStore = new Map<CommerceStoreKey, FavoriteItem[]>();
  for (const item of favorites) byStore.set(item.commerceStoreKey, [...(byStore.get(item.commerceStoreKey) ?? []), item]);

  // Refetches only when the actual set of saved ids changes (order-independent key), never on every render.
  const idsKey = [...byStore.entries()].map(([store, items]) => `${store}:${items.map((i) => i.inkProductId).sort().join("|")}`).join(";");
  useEffect(() => {
    if (byStore.size === 0) return;
    const controller = new AbortController();
    void Promise.all([...byStore.entries()].map(([store, items]) => resolveGroup(store, items.map((i) => i.inkProductId), controller.signal))).then((maps) => {
      if (controller.signal.aborted) return;
      const merged = new Map<string, Resolved>();
      for (const map of maps) for (const [key, value] of map) merged.set(key, value);
      setResolved(merged);
    });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  async function buyList(storeKey: CommerceStoreKey, items: FavoriteItem[]) {
    const eligible = items.filter((item) => resolved.get(groupKey(storeKey, item.inkProductId))?.available);
    if (eligible.length === 0) return;
    setBuying(storeKey);
    try {
      const response = await fetch("/api/buy-session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ storeKey, inkProductIds: eligible.map((item) => item.inkProductId) }),
      });
      if (response.ok) {
        const data = (await response.json()) as { sessionId: string; firstProductUrl: string };
        const destination = withListSession(data.firstProductUrl, data.sessionId);
        trackGoToInk({ productId: eligible[0].inkProductId, sourceSection: SOURCES.meusLugares, destinationUrl: data.firstProductUrl, value: eligible[0].price ?? undefined });
        window.location.assign(destination);
        return;
      }
    } catch {
      // falls through to the fallback below
    }
    // No session (feature not configured, all ineligible on the server, or a network error): open the first
    // product exactly like a normal purchase link, never announcing that the "next item" card is active.
    const first = resolved.get(groupKey(storeKey, eligible[0].inkProductId));
    if (first?.available) window.location.assign(first.url);
    setBuying(null);
  }

  if (favorites.length === 0) {
    return (
      <section aria-live="polite">
        <h1 className="t-h2">Meus Lugares</h1>
        <p className="t-body mt-3 max-w-xl text-ink-soft">Toque no coração de uma estampa para guardá-la aqui e montar sua seleção.</p>
        <p className="mt-6">
          <Link href={`/${region}`} className="link-line text-[0.9375rem] font-semibold">
            Explorar estampas
          </Link>
        </p>
      </section>
    );
  }

  return (
    <div>
      <h1 className="t-h2">Meus Lugares</h1>
      <p className="t-body mt-2 text-ink-soft">
        {favorites.length} {favorites.length === 1 ? "estampa salva" : "estampas salvas"}
      </p>

      {[...byStore.entries()].map(([storeKey, items]) => {
        const eligibleCount = items.filter((item) => resolved.get(groupKey(storeKey, item.inkProductId))?.available).length;
        return (
          <section key={storeKey} className="mt-10">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="t-h3">Use {storeLabel(storeKey)}</h2>
              {eligibleCount > 0 && (
                <button type="button" className="btn" disabled={buying === storeKey} onClick={() => void buyList(storeKey, items)}>
                  {buying === storeKey ? "Abrindo…" : "Comprar minha lista"}
                </button>
              )}
            </div>

            <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-9 md:grid-cols-3 lg:grid-cols-4">
              {items.map((item) => {
                const info = resolved.get(groupKey(storeKey, item.inkProductId));
                const title = info?.available ? info.title : item.title;
                const context = info?.available ? info.context : item.context;
                const imageUrl = info?.available ? info.imageUrl : item.imageUrl;
                const price = info?.available ? info.price : item.price;
                return (
                  <li key={item.inkProductId} className="relative">
                    <button
                      type="button"
                      aria-label={`Remover ${title} de Meus Lugares`}
                      onClick={() => removeFavorite(item.inkProductId, item.commerceStoreKey)}
                      className="absolute right-2 top-2 z-10 inline-flex min-h-11 min-w-11 items-center justify-center rounded-full bg-white/90 text-ink shadow-sm"
                    >
                      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                        <path d="M5 5l14 14M19 5L5 19" />
                      </svg>
                    </button>
                    <ProductPhoto src={imageUrl} alt={title} sizes="(min-width: 1024px) 22vw, (min-width: 768px) 30vw, 46vw" />
                    <div className="mt-3">
                      <p className="t-h3">{title}</p>
                      {context && <p className="t-place mt-1 text-[0.95rem] text-ink-mute">{context}</p>}
                      {formatPrice(price) && <p className="t-small mt-0.5 font-semibold">{formatPrice(price)}</p>}
                      <p className="mt-2">
                        {!info ? (
                          <span className="t-small text-ink-mute">Carregando…</span>
                        ) : info.available ? (
                          <TrackedInkLink
                            href={info.url}
                            params={{ productId: item.inkProductId, sourceSection: SOURCES.meusLugares, value: info.price ?? undefined, productName: info.title, destinationUrl: info.url }}
                            className="link-line text-[0.9375rem] font-semibold"
                          >
                            Ver estampa
                          </TrackedInkLink>
                        ) : (
                          <span className="t-small text-ink-mute">Indisponível no momento</span>
                        )}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
