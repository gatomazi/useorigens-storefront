"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { REGIONS, STATE_NAMES, type RegionSlug } from "@/lib/geo/regions";
import { prepareCities, searchCities, type PreparedCity, type SearchCity, type SearchResult } from "@/lib/search/rank";
import { trackSearch, trackSelectCity } from "@/lib/analytics/track";

type Props = {
  region: RegionSlug;
  autoFocus?: boolean;
  /** Called after a result is chosen (lets the header dialog close itself). */
  onNavigate?: () => void;
  label?: string;
  placeholder?: string;
  /** GA4 `source` for select_city (src/lib/analytics/sources.ts) — which trigger opened this search. */
  source?: string;
};

const indexCache = new Map<RegionSlug, Promise<PreparedCity[]>>();

function loadIndex(region: RegionSlug): Promise<PreparedCity[]> {
  let promise = indexCache.get(region);
  if (!promise) {
    promise = fetch(`/api/cidades/${region}`)
      .then((res) => {
        if (!res.ok) throw new Error(`search index ${res.status}`);
        return res.json() as Promise<SearchCity[]>;
      })
      .then(prepareCities);
    // A failed load must be retryable on the next focus.
    promise.catch(() => indexCache.delete(region));
    indexCache.set(region, promise);
  }
  return promise;
}

function hrefFor(region: RegionSlug, result: SearchResult): string {
  return result.type === "state"
    ? `/${region}/${result.uf.toLowerCase()}`
    : `/${region}/${result.city.u.toLowerCase()}/${result.city.s}`;
}

/** The public label for the Meta Search event — never the raw keystrokes, always what was actually chosen
 * (city + UF to disambiguate same-named cities across states; a state result just needs its own name). No
 * user-identifying data, only the place name the person searched for. */
function searchLabelFor(result: SearchResult): string {
  return result.type === "state" ? result.name : `${result.city.n} - ${result.city.u}`;
}

/**
 * The store's signature feature. The input reads like type printed on the shirt and the results are a
 * departure board: city large, state and region small. Results live in the page flow (no floating
 * dropdown), so it behaves the same on a phone, in a sheet, and with a screen reader.
 */
export function CitySearch({
  region,
  autoFocus = false,
  onNavigate,
  label = "Busque sua cidade",
  placeholder = "Busque sua cidade…",
  source,
}: Props) {
  const router = useRouter();
  const uid = useId();
  const listId = `${uid}-list`;
  const inputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [index, setIndex] = useState<PreparedCity[] | null>(null);
  const [failed, setFailed] = useState(false);

  const ufs = REGIONS[region].ufs;

  const ensureIndex = () => {
    if (index) return;
    setFailed(false);
    loadIndex(region).then(setIndex, () => setFailed(true));
  };

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  const results = useMemo(() => (index ? searchCities(index, query, { ufs, limit: 6 }) : []), [index, query, ufs]);
  const trimmed = query.trim();
  const showEmpty = index !== null && trimmed.length >= 2 && results.length === 0;
  const hasList = results.length > 0;
  const activeIndex = Math.min(active, Math.max(results.length - 1, 0));

  // The single conclusive-search gesture, reached by both Enter and clicking/tapping a suggestion — so Search
  // fires from exactly one place, once, regardless of which path got here. A city result also fires
  // SelectCity here — the same gesture legitimately means both "a search happened" and "a city was chosen"
  // (CLAUDE_ADENDO_4_EVENTOS_META_STOREFRONT.md §2); a state result is never a city selection.
  const choose = (result: SearchResult | undefined) => {
    if (!result) return;
    trackSearch(searchLabelFor(result), { region, resultsCount: results.length });
    if (result.type === "city") {
      trackSelectCity({ city: result.city.n, state: result.city.u, region, source });
    }
    router.push(hrefFor(region, result));
    onNavigate?.();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive(results.length ? (activeIndex + 1) % results.length : 0);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive(results.length ? (activeIndex - 1 + results.length) % results.length : 0);
    } else if (event.key === "Enter") {
      event.preventDefault();
      choose(results[activeIndex]);
    } else if (event.key === "Escape" && query) {
      event.stopPropagation();
      setQuery("");
    }
  };

  const muted = "text-ink-mute";

  return (
    <div className="w-full">
      <label htmlFor={`${uid}-input`} className="sr-only">
        {label}
      </label>
      <input
        id={`${uid}-input`}
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={hasList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={hasList ? `${uid}-opt-${activeIndex}` : undefined}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="none"
        spellCheck={false}
        enterKeyHint="go"
        inputMode="search"
        placeholder={placeholder}
        value={query}
        onFocus={ensureIndex}
        onChange={(event) => {
          ensureIndex();
          setQuery(event.target.value);
          setActive(0);
        }}
        onKeyDown={onKeyDown}
        className={`search-input block w-full border-0 border-b-[3px] border-ink bg-transparent px-0 pb-3 pt-2 text-[clamp(1.75rem,5.5vw,3.25rem)] font-extrabold leading-none tracking-tight text-ink outline-none transition-colors placeholder:font-semibold placeholder:text-ink-mute focus:border-region-ink focus:outline-none`}
      />

      <div id={listId} role="listbox" aria-label="Resultados da busca" className={hasList ? "mt-2" : "hidden"}>
        {results.map((result, i) => {
          const isState = result.type === "state";
          const title = isState ? result.name : result.city.n;
          const subtitle = isState ? "Ver as cidades do estado" : `${STATE_NAMES[result.city.u]} · ${result.city.m ?? REGIONS[region].name}`;
          const isActive = i === activeIndex;
          return (
            <div
              key={isState ? `uf-${result.uf}` : `${result.city.u}-${result.city.s}`}
              id={`${uid}-opt-${i}`}
              role="option"
              aria-selected={isActive}
              onMouseDown={(event) => {
                event.preventDefault();
                choose(result);
              }}
              onMouseEnter={() => setActive(i)}
              className={`search-row flex min-h-14 cursor-pointer flex-col justify-center gap-0.5 border-b border-line px-3 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6 ${
                isActive ? "bg-region-primary text-white" : ""
              }`}
            >
              <span className="text-[clamp(1.375rem,3.4vw,2.25rem)] font-extrabold leading-tight tracking-tight">{title}</span>
              <span className={`t-place text-[0.95rem] ${isActive ? "text-white/80" : muted}`}>{subtitle}</span>
            </div>
          );
        })}
      </div>

      {index === null && trimmed.length > 0 && !failed && <p className={`mt-4 text-[0.9375rem] ${muted}`}>Carregando cidades…</p>}
      {failed && <p className="mt-4 text-[0.9375rem]">Não conseguimos carregar as cidades agora. Tente de novo em instantes.</p>}

      {showEmpty && (
        <div className="mt-5">
          <p className="font-semibold">Ainda não encontramos essa cidade.</p>
          <p className={`mt-1 text-[0.9375rem] ${muted}`}>Tente buscar pelo nome completo ou escolha o estado.</p>
          <ul className="mt-4 flex flex-wrap gap-2">
            {ufs.map((uf) => (
              <li key={uf}>
                <Link
                  href={`/${region}/${uf.toLowerCase()}`}
                  onClick={() => onNavigate?.()}
                  className="inline-flex min-h-11 items-center border-2 border-ink px-4 text-[0.9375rem] font-semibold transition-colors hover:bg-ink hover:text-white"
                >
                  {STATE_NAMES[uf]}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="sr-only" role="status" aria-live="polite">
        {trimmed.length === 0 ? "" : hasList ? `${results.length} resultados. Use as setas para navegar.` : showEmpty ? "Nenhum resultado." : ""}
      </p>
    </div>
  );
}
