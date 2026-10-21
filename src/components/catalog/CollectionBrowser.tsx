"use client";

import { useEffect, useId, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { SheetDialog, SheetHeader } from "@/components/layout/SheetDialog";
import { SOURCES } from "@/lib/analytics/sources";
import { numberPt } from "@/lib/format";
import {
  activeFilterCount,
  COLLECTION_SORT_LABEL,
  COLLECTION_SORTS,
  collectionQueryString,
  collectionQueryTerms,
  FACET_LABEL,
  isCollectionQueryActive,
  MAX_COLLECTION_QUERY,
  usefulFacets,
  type CollectionFacets,
  type CollectionFilters,
  type CollectionQuery,
  type CollectionSort,
  type FacetKey,
} from "@/lib/search/collection-filter";
import type { CarouselItem } from "./ProductCarousel";
import { ProductGrid } from "./ProductGrid";

type Answer = { key: string; total: number; items: CarouselItem[]; facets: CollectionFacets } | { key: string; failed: true };

const ANY: Record<FacetKey, string> = { garment: "Todas as peças", state: "Todos os estados", city: "Todas as cidades", family: "Todos os estilos" };
/** Up to this many options a facet is a row of chips in the phone sheet; more become a list to pick from. */
const CHIPS_UP_TO = 12;

const products = (n: number) => (n === 1 ? "1 produto" : `${numberPt.format(n)} produtos`);

/**
 * A collection page's own search, filters and sort ("Buscar nesta coleção", Peça / Estado / Cidade / Estilo, Ordem da coleção / preço): as the
 * visitor asks, the grid shows the cards of the WHOLE collection (every page, not only this one) that answer (`/api/colecoes/<region>/<slug>`,
 * rules in search/collection-filter.ts), with the same cards and buttons, over the snapshot only (never INK). Clearing everything brings back the
 * page as the server drew it (`items`, `aside`, `footer`: its count and its page links). Nothing changes in the address: the page stays one cached
 * page per number, with its canonical, and no combination of filters becomes a URL. The one way in is `?uf=` on arrival (a state page's "Ver todos"),
 * which starts the state filter.
 *
 * Desktop: one bar of compact selects over the grid. Phones: a "Filtrar" button (with the number of active filters) opens a sheet of chips, with
 * "Limpar filtros" and "Ver N produtos"; the sort stays next to it. A facet with one option offers no choice and is left out; the city facet
 * appears once a state is chosen (a region-wide collection has over a thousand cities; the search field finds one by name).
 */
export function CollectionBrowser({
  region,
  slug,
  grid,
  items,
  aside,
  footer,
  facets: initialFacets,
  bestSelling = false,
  defaultSort = "collection",
}: {
  region: string;
  /** The page's own address (`/colecoes/<slug>`), the one the API resolves exactly like the page. */
  slug: string;
  grid: Omit<ComponentProps<typeof ProductGrid>, "items" | "aside" | "toolbar" | "footer" | "leading">;
  items: CarouselItem[];
  aside: ReactNode;
  footer: ReactNode;
  /** The facets of the whole collection, as the server counted them (what the filters offer before anything is chosen). */
  facets: CollectionFacets;
  /** "Mais vendidas" is offered: the server has a fresh count of the last 30 days' sales (never shown, it only orders). */
  bestSelling?: boolean;
  /** The order the server already applied, before pagination. */
  defaultSort?: CollectionSort;
}) {
  const id = useId();
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<CollectionFilters>({});
  const [sort, setSort] = useState<CollectionSort>(defaultSort);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const filterButton = useRef<HTMLButtonElement>(null);
  const query: CollectionQuery = { q, filters, sort };
  const active = isCollectionQueryActive(query, defaultSort);
  const key = collectionQueryString(query, defaultSort);
  const searching = collectionQueryTerms(q.trim()).length > 0;

  // A link from a state page ("Ver todos" of "Da Nossa Terra · SC") opens the collection already filtered to that state (`?uf=SC`), when the collection
  // has products of it. Read once, on the client: the page stays one cached page per number, and the address is never written back.
  useEffect(() => {
    const uf = new URLSearchParams(window.location.search).get("uf")?.toUpperCase();
    if (uf && initialFacets.state.some((o) => o.value === uf)) setFilters((f) => ({ ...f, state: uf }));
  }, [initialFacets]);

  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    // A short pause between keystrokes or taps: one request per change, not per letter.
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/colecoes/${encodeURIComponent(region)}/${encodeURIComponent(slug)}?${key}`, { signal: controller.signal });
        if (!response.ok) throw new Error(String(response.status));
        const body = (await response.json()) as { total: number; items: CarouselItem[]; facets: CollectionFacets };
        setAnswer({ key, total: body.total, items: body.items, facets: body.facets });
      } catch {
        if (!controller.signal.aborted) setAnswer({ key, failed: true });
      }
    }, 220);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [region, slug, key, active]);

  // Only an answer to what is asked now counts; while the next one comes, the cards already on screen stay.
  const current = active && answer?.key === key ? answer : null;
  const results = current && !("failed" in current) ? current : null;
  const latest = answer && !("failed" in answer) ? answer : null;
  // The facets of the newest answer (they narrow as filters are chosen); the collection's own before any.
  const facets = active ? latest?.facets ?? initialFacets : initialFacets;
  const shownFacets = usefulFacets(facets).filter((facetKey) => facetKey !== "city" || facets.city.length > 0);
  const count = activeFilterCount(filters);
  const dark = grid.tone === "dark";
  const muted = dark ? "text-white/85" : "text-ink-soft";

  const status = !active
    ? null
    : !current
      ? "Buscando…"
      : "failed" in current
        ? "Não foi possível buscar agora. Tente de novo em instantes."
        : current.total === 0
          ? searching
            ? `Nenhuma estampa com “${q.trim()}”${count > 0 ? " e esses filtros" : ""} nesta coleção. Tente o nome da cidade, do estado ou do estilo.`
            : "Nenhum produto com esses filtros nesta coleção."
          : `${products(current.total)}${searching ? ` com “${q.trim()}”` : ""}${count > 0 ? ` com ${count === 1 ? "1 filtro" : `${count} filtros`}` : ""}${sort !== "collection" ? `, ${COLLECTION_SORT_LABEL[sort].toLowerCase()}` : ""}${current.total > current.items.length ? ` (mostrando os ${current.items.length} primeiros; refine para ver os outros)` : ""}.`;

  const setFilter = (facetKey: FacetKey, value: string) =>
    setFilters((f) => {
      const next: CollectionFilters = { ...f };
      if (facetKey === "garment") next.garment = value ? Number(value) : undefined;
      else next[facetKey] = value || undefined;
      // A city belongs to its state: changing the state drops the city.
      if (facetKey === "state") next.city = undefined;
      return next;
    });
  const valueOf = (facetKey: FacetKey): string => (facetKey === "garment" ? (filters.garment !== undefined ? String(filters.garment) : "") : filters[facetKey] ?? "");
  const clear = () => setFilters({});

  const select = (facetKey: FacetKey, compact: boolean) => (
    <label key={facetKey} className="flex min-w-0 flex-col gap-1">
      <span className={`t-caption ${dark ? "text-white/70" : ""}`}>{FACET_LABEL[facetKey]}</span>
      <select
        value={valueOf(facetKey)}
        onChange={(event) => setFilter(facetKey, event.target.value)}
        data-testid={`filter-${facetKey}`}
        className={`${compact ? "h-11" : "min-h-12"} max-w-full border-2 border-ink bg-white px-3 pr-8 text-[0.9375rem] font-semibold text-ink`}
      >
        <option value="">{ANY[facetKey]}</option>
        {facets[facetKey].map((option) => (
          <option key={option.value} value={option.value}>
            {option.label} ({numberPt.format(option.count)})
          </option>
        ))}
      </select>
    </label>
  );

  const sortSelect = (compact: boolean, labelled = true) => (
    <label className="flex min-w-0 flex-col gap-1">
      <span className={labelled ? `t-caption ${dark ? "text-white/70" : ""}` : "sr-only"}>Ordenar</span>
      <select value={sort} onChange={(event) => setSort(event.target.value as CollectionSort)} data-testid={labelled ? "collection-sort" : "collection-sort-mobile"} className={`${compact ? "h-11" : "min-h-12"} w-full border-2 border-ink bg-white px-3 pr-8 text-[0.9375rem] font-semibold text-ink`}>
        {COLLECTION_SORTS.filter((option) => bestSelling || option !== "best-selling").map((option) => (
          <option key={option} value={option}>
            {COLLECTION_SORT_LABEL[option]}
          </option>
        ))}
      </select>
    </label>
  );

  const toolbar = (
    <div className="mb-6 sm:mb-8" data-testid="collection-search">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between md:gap-6">
        <form role="search" aria-label={`Buscar em ${grid.title}`} className="relative w-full max-w-xl" onSubmit={(event) => event.preventDefault()}>
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
            value={q}
            onChange={(event) => setQ(event.target.value)}
            maxLength={MAX_COLLECTION_QUERY}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            enterKeyHint="search"
            placeholder="Buscar nesta coleção"
            className="block min-h-12 w-full border-2 border-ink bg-white pl-12 pr-12 text-base font-semibold text-ink transition-colors placeholder:font-medium placeholder:text-ink-mute hover:border-region-primary [&::-webkit-search-cancel-button]:hidden"
          />
          {q && (
            <button type="button" onClick={() => setQ("")} aria-label="Limpar busca" className="absolute right-1 top-1/2 inline-flex min-h-11 min-w-11 -translate-y-1/2 items-center justify-center text-ink">
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          )}
        </form>
        {/* Phones: "Filtrar" (how many are on) and the sort, side by side. */}
        <div className="flex items-end gap-3 md:hidden">
          {shownFacets.length > 0 && (
            <button
              ref={filterButton}
              type="button"
              onClick={() => setSheetOpen(true)}
              aria-haspopup="dialog"
              data-testid="collection-filter-button"
              className={`inline-flex h-11 items-center gap-2 border-2 px-4 text-[0.9375rem] font-semibold transition-colors ${count > 0 ? "border-region-primary bg-region-primary text-white" : dark ? "border-white text-white" : "border-ink text-ink"}`}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                <path d="M4 6h16M7 12h10M10 18h4" />
              </svg>
              Filtrar{count > 0 ? ` · ${count}` : ""}
            </button>
          )}
          <div className="min-w-0 flex-1">{sortSelect(true, false)}</div>
        </div>
      </div>
      {/* Desktop: one bar of compact selects, the sort at the end, "Limpar filtros" when any is on. */}
      <div className="mt-3 hidden flex-wrap items-end gap-x-3 gap-y-2 md:flex" data-testid="collection-filter-bar">
          {shownFacets.map((facetKey) => select(facetKey, true))}
          {sortSelect(true)}
          {count > 0 && (
            <button type="button" onClick={clear} className={`link-static h-11 px-1 text-[0.9375rem] font-semibold ${dark ? "text-white" : "text-ink"}`}>
              Limpar filtros
            </button>
          )}
        </div>
      <p aria-live="polite" data-testid="collection-status" className={`t-small mt-2 min-h-5 ${muted}`}>
        {status}
      </p>
      <SheetDialog open={sheetOpen} onClose={() => setSheetOpen(false)} labelledBy={`${id}-filters`} returnFocus={filterButton}>
        <SheetHeader id={`${id}-filters`} title="Filtrar" onClose={() => setSheetOpen(false)} />
        <div className="grid gap-5">
          {shownFacets.map((facetKey) =>
            facets[facetKey].length <= CHIPS_UP_TO ? (
              <fieldset key={facetKey}>
                <legend className="t-label mb-2">{FACET_LABEL[facetKey]}</legend>
                <div className="flex flex-wrap gap-2">
                  <button type="button" aria-pressed={valueOf(facetKey) === ""} onClick={() => setFilter(facetKey, "")} className="chip">
                    {ANY[facetKey]}
                  </button>
                  {facets[facetKey].map((option) => (
                    <button key={option.value} type="button" aria-pressed={valueOf(facetKey) === option.value} onClick={() => setFilter(facetKey, option.value)} className="chip">
                      {option.label} <span className="font-normal opacity-70">{numberPt.format(option.count)}</span>
                    </button>
                  ))}
                </div>
              </fieldset>
            ) : (
              select(facetKey, false)
            ),
          )}
        </div>
        <div className="mt-6 grid grid-cols-2 gap-3">
          <button type="button" onClick={clear} className="btn btn-ghost min-h-12 px-2 text-[0.75rem]" disabled={count === 0} aria-disabled={count === 0}>
            Limpar filtros
          </button>
          <button type="button" onClick={() => setSheetOpen(false)} className="btn min-h-12 px-2 text-[0.75rem]" data-testid="collection-filter-apply">
            {results ? `Ver ${products(results.total)}` : active && !current ? "Buscando…" : "Ver produtos"}
          </button>
        </div>
      </SheetDialog>
    </div>
  );

  // Results (possibly none: the status says so) replace the page; otherwise, while typing or after a failure, the page stays as it is.
  return results ? (
    <ProductGrid {...grid} items={results.items} sourceSection={searching ? SOURCES.collectionSearch : SOURCES.collectionFilter} toolbar={toolbar} />
  ) : (
    <ProductGrid {...grid} items={items} aside={aside} toolbar={toolbar} footer={footer} />
  );
}
