"use client";

import { useEffect, useId, useState, type ComponentProps, type ReactNode } from "react";
import { SOURCES } from "@/lib/analytics/sources";
import { numberPt } from "@/lib/format";
import { collectionQueryTerms, MAX_COLLECTION_QUERY } from "@/lib/search/collection-filter";
import type { CarouselItem } from "./ProductCarousel";
import { ProductGrid } from "./ProductGrid";

type Found = { q: string; total: number; items: CarouselItem[] } | { q: string; failed: true };

/**
 * A collection page's mini search ("Buscar nesta coleção"): as the visitor types, the grid shows the cards of the WHOLE collection (every page, not only
 * this one) whose name, place or state match (`/api/colecoes/<region>/<slug>`, rules in search/collection-filter.ts), in the collection's order, with the
 * same cards and buttons. Clearing the field brings back the page as the server drew it (`items`, `aside`, `footer`: its count and its page links).
 * Nothing changes in the address: the page stays one cached page per number.
 */
export function CollectionSearch({
  region,
  slug,
  grid,
  items,
  aside,
  footer,
}: {
  region: string;
  /** The page's own address (`/colecoes/<slug>`), the one the API resolves exactly like the page. */
  slug: string;
  grid: Omit<ComponentProps<typeof ProductGrid>, "items" | "aside" | "toolbar" | "footer" | "leading">;
  items: CarouselItem[];
  aside: ReactNode;
  footer: ReactNode;
}) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<Found | null>(null);
  const typed = query.trim();
  const searching = collectionQueryTerms(typed).length > 0;

  useEffect(() => {
    if (!searching) return;
    const controller = new AbortController();
    // A short pause between keystrokes: one request per word typed, not per letter.
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/colecoes/${encodeURIComponent(region)}/${encodeURIComponent(slug)}?q=${encodeURIComponent(typed)}`, { signal: controller.signal });
        if (!response.ok) throw new Error(String(response.status));
        const body = (await response.json()) as { total: number; items: CarouselItem[] };
        setFound({ q: typed, total: body.total, items: body.items });
      } catch {
        if (!controller.signal.aborted) setFound({ q: typed, failed: true });
      }
    }, 220);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [region, slug, typed, searching]);

  // Only an answer to what is in the field now counts; while the next one comes, the cards already on screen stay.
  const current = searching && found?.q === typed ? found : null;
  const results = current && !("failed" in current) ? current : null;
  const dark = grid.tone === "dark";
  const status = !searching
    ? null
    : !current
      ? "Buscando…"
      : "failed" in current
        ? "Não foi possível buscar agora. Tente de novo em instantes."
        : current.total === 0
          ? `Nenhuma estampa com “${typed}” nesta coleção. Tente o nome da cidade, do estado ou do estilo.`
          : `${current.total === 1 ? "1 estampa" : `${numberPt.format(current.total)} estampas`} com “${typed}”${current.total > current.items.length ? `: mostrando as ${current.items.length} primeiras, refine a busca para ver as outras` : ""}.`;

  const toolbar = (
    <div className="mb-6 sm:mb-8" data-testid="collection-search">
      <form role="search" aria-label={`Buscar em ${grid.title}`} className="relative max-w-xl" onSubmit={(event) => event.preventDefault()}>
        <label htmlFor={`${id}-q`} className="sr-only">
          Buscar nesta coleção
        </label>
        <svg aria-hidden="true" viewBox="0 0 24 24" className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
          <circle cx="11" cy="11" r="6.5" />
          <path d="m20 20-4.2-4.2" />
        </svg>
        <input
          id={`${id}-q`}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          maxLength={MAX_COLLECTION_QUERY}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          enterKeyHint="search"
          placeholder="Buscar nesta coleção"
          className="block min-h-14 w-full border-2 border-ink bg-white pl-12 pr-12 text-base font-semibold text-ink transition-colors placeholder:font-medium placeholder:text-ink-mute hover:border-region-primary [&::-webkit-search-cancel-button]:hidden"
        />
        {query && (
          <button type="button" onClick={() => setQuery("")} aria-label="Limpar busca" className="absolute right-1 top-1/2 inline-flex min-h-11 min-w-11 -translate-y-1/2 items-center justify-center text-ink">
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        )}
      </form>
      <p aria-live="polite" className={`t-small mt-2 min-h-5 ${dark ? "text-white/85" : "text-ink-soft"}`}>
        {status}
      </p>
    </div>
  );

  // Results (possibly none: the status says so) replace the page; otherwise, while typing or after a failure, the page stays as it is.
  return results ? (
    <ProductGrid {...grid} items={results.items} sourceSection={SOURCES.collectionSearch} toolbar={toolbar} />
  ) : (
    <ProductGrid {...grid} items={items} aside={aside} toolbar={toolbar} footer={footer} />
  );
}
