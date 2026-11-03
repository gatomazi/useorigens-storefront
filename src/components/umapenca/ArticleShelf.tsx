"use client";

import { useId, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import type { CardBuy } from "@/lib/site-config/cards-schema";
import { numberPt } from "@/lib/format";
import { filterByCity, MAX_CITY_QUERY, stateCounts } from "@/lib/umapenca/city-filter";
import type { UmaPencaArticle } from "@/lib/umapenca/types";
import { ArticleCard } from "./ArticleCard";

export type ShelfArticle = { article: UmaPencaArticle; city: string | null; uf: string | null; hover?: string };

/** Cards shown at first, and added by each "Ver mais". */
const PAGE = 24;
/** A kind with up to this many articles is shown whole, without the city filter. */
const FILTER_FROM = PAGE;

const noSubscription = () => () => {};

function fromAddress(search: string, ufs: readonly string[]): { q: string; uf: string | null } {
  const params = new URLSearchParams(search);
  const state = params.get("uf")?.toUpperCase() ?? "";
  return { q: params.get("cidade")?.slice(0, MAX_CITY_QUERY) ?? "", uf: ufs.includes(state) ? state : null };
}

/**
 * One kind's shelf on "Outros artigos": the cards, and — when the kind has more than a page of them — the city filter (rules in
 * umapenca/city-filter.ts): a field ("Busque a sua cidade"), one chip per state, the count, and a page at a time ("Ver mais"). The page drew
 * a thousand canecas at once (4.7 MB); now the server sends only what a card needs and the browser draws a page. `?cidade=` and `?uf=` on
 * arrival start the filter, and the address follows it (replaceState), so a filtered shelf can be shared; the page itself stays one cached page.
 * `leading` (the "Crie a sua" cards) shows only while nothing is filtered.
 */
export function ArticleShelf({
  items,
  labels,
  ufs,
  region,
  sizes,
  buy,
  leading,
  priority = false,
}: {
  items: ShelfArticle[];
  labels: { singular: string; plural: string };
  /** The region's states, in its order: the chips. */
  ufs: readonly string[];
  region: string;
  sizes: string;
  buy?: CardBuy;
  leading?: ReactNode;
  priority?: boolean;
}) {
  const id = useId();
  const filterable = items.length > FILTER_FROM;
  // `?cidade=` / `?uf=` on arrival start the filter (read on the client only: the page stays one cached page); the first change replaces them.
  const arrival = useSyncExternalStore(noSubscription, () => window.location.search, () => "");
  const [chosen, setChosen] = useState<{ q: string; uf: string | null } | null>(null);
  const { q, uf } = chosen ?? (filterable ? fromAddress(arrival, ufs) : { q: "", uf: null });
  const [shown, setShown] = useState(PAGE);
  const states = useMemo(() => stateCounts(items, ufs), [items, ufs]);

  const matches = useMemo(() => (filterable ? filterByCity(items, q, uf) : items), [filterable, items, q, uf]);
  const filtering = q.trim() !== "" || uf !== null;
  const visible = filterable ? matches.slice(0, shown) : matches;
  const plural = labels.plural.toLowerCase();
  const count = (n: number) => (n === 1 ? `1 ${labels.singular.toLowerCase()}` : `${numberPt.format(n)} ${plural}`);

  // The address follows the filter (replaceState, no history entry per letter), so a filtered shelf can be shared.
  const change = (next: { q?: string; uf?: string | null }) => {
    const value = { q: next.q ?? q, uf: next.uf !== undefined ? next.uf : uf };
    setChosen(value);
    setShown(PAGE);
    const url = new URL(window.location.href);
    if (value.q.trim()) url.searchParams.set("cidade", value.q.trim());
    else url.searchParams.delete("cidade");
    if (value.uf) url.searchParams.set("uf", value.uf.toLowerCase());
    else url.searchParams.delete("uf");
    window.history.replaceState(window.history.state, "", url);
  };

  return (
    <>
      {filterable && (
        <div className="mb-8 lg:mb-10" data-testid="article-city-filter">
          <form role="search" aria-label={`Buscar ${plural} por cidade`} className="relative w-full max-w-xl" onSubmit={(event) => event.preventDefault()}>
            <label htmlFor={`${id}-q`} className="t-caption mb-1.5 block">
              Encontre a {labels.singular.toLowerCase()} da sua cidade
            </label>
            <span className="relative block">
              <svg aria-hidden="true" viewBox="0 0 24 24" className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                <circle cx="11" cy="11" r="6.5" />
                <path d="m20 20-4.2-4.2" />
              </svg>
              <input
                id={`${id}-q`}
                type="search"
                value={q}
                onChange={(event) => change({ q: event.target.value })}
                maxLength={MAX_CITY_QUERY}
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="search"
                placeholder="Digite o nome da cidade"
                className="block min-h-12 w-full border-2 border-ink bg-white pl-12 pr-12 text-base font-semibold text-ink transition-colors placeholder:font-medium placeholder:text-ink-mute hover:border-region-primary [&::-webkit-search-cancel-button]:hidden"
              />
              {q && (
                <button type="button" onClick={() => change({ q: "" })} aria-label="Limpar cidade" className="absolute right-1 top-1/2 inline-flex min-h-11 min-w-11 -translate-y-1/2 items-center justify-center text-ink">
                  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                    <path d="M6 6l12 12M18 6 6 18" />
                  </svg>
                </button>
              )}
            </span>
          </form>
          {states.length > 1 && (
            <div role="group" aria-label="Estado" className="mt-4 flex flex-wrap gap-2">
              <button type="button" className="chip" aria-pressed={uf === null} onClick={() => change({ uf: null })}>
                Todos
              </button>
              {states.map((s) => (
                <button key={s.uf} type="button" className="chip" aria-pressed={uf === s.uf} onClick={() => change({ uf: uf === s.uf ? null : s.uf })}>
                  {s.uf} <span className="font-normal opacity-75">({numberPt.format(s.count)})</span>
                </button>
              ))}
            </div>
          )}
          <p className="t-small mt-4 text-ink-soft" aria-live="polite">
            {filtering
              ? `${count(matches.length)}${q.trim() ? ` para “${q.trim()}”` : ""}${uf ? ` em ${uf}` : ""}`
              : count(items.length)}
          </p>
        </div>
      )}

      {matches.length === 0 ? (
        <div className="max-w-2xl" data-testid="article-city-empty">
          <p className="t-h3">Ainda não temos {labels.singular.toLowerCase()} de “{q.trim()}”{uf ? ` em ${uf}` : ""}.</p>
          <p className="t-body mt-2 text-ink-soft">Confira a grafia ou tente só o começo do nome.</p>
          {q.trim() && (
            <p className="mt-4">
              <a href={`/${region}/busca?${new URLSearchParams({ q: q.trim() })}`} className="link-line text-[0.9375rem] font-semibold">
                Ver as camisetas de “{q.trim()}”
              </a>
            </p>
          )}
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-x-4 gap-y-10 sm:gap-x-6 lg:grid-cols-4">
          {!filtering && leading}
          {visible.map(({ article, hover }, i) => (
            <li key={article.id}>
              <ArticleCard article={article} region={region} sizes={sizes} hoverImageUrl={hover} priority={priority && !filtering && i < 2} buy={buy} />
            </li>
          ))}
        </ul>
      )}

      {filterable && matches.length > visible.length && (
        <div className="mt-10 flex flex-col items-center gap-2">
          <p className="t-small text-ink-soft">
            Mostrando {numberPt.format(visible.length)} de {numberPt.format(matches.length)}
          </p>
          <button type="button" className="btn" onClick={() => setShown((n) => n + PAGE)}>
            Ver mais {plural}
          </button>
        </div>
      )}
    </>
  );
}
