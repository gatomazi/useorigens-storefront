"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { REGIONS, STATE_NAMES, type RegionSlug } from "@/lib/geo/regions";
import { placeSearchCopy } from "@/lib/search/copy";
import type { GlobalGroup, GlobalResult, GlobalSearchResponse } from "@/lib/search/global";
import { trackSearch, trackSelectCity } from "@/lib/analytics/track";

type Props = {
  region: RegionSlug;
  autoFocus?: boolean;
  /** Called after a result is chosen (lets the dialog close itself). */
  onNavigate?: () => void;
  /** GA4 `source` for select_city (src/lib/analytics/sources.ts) — which entry point opened this search. */
  source?: string;
  /** The dialog keeps the field visible above the results while the phone keyboard is open. */
  sticky?: boolean;
};

const DEBOUNCE_MS = 140;
const responses = new Map<string, Promise<GlobalSearchResponse>>();

function fetchResults(region: RegionSlug, q: string, signal: AbortSignal): Promise<GlobalSearchResponse> {
  const key = `${region}|${q}`;
  let promise = responses.get(key);
  if (!promise) {
    promise = fetch(`/api/busca?${new URLSearchParams({ region, q })}`, { signal }).then((res) => {
      if (!res.ok) throw new Error(`search ${res.status}`);
      return res.json() as Promise<GlobalSearchResponse>;
    });
    promise.catch(() => responses.delete(key)); // a failed or aborted query can be asked again
    responses.set(key, promise);
    if (responses.size > 60) responses.delete(responses.keys().next().value!);
  }
  return promise;
}

const INK_IMAGES = "https://gcp-images.majestic.ink.rsvcloud.com/images/product_v2/";
const GROUP_LABEL: Record<Exclude<GlobalGroup, "places">, string> = { designs: "Estampas", editorial: "Coleções e temas" };

type Row = { result: GlobalResult; other: boolean };

/** The label of the Meta Search event: what was chosen (a place with its UF, a design, a page) — never the raw keystrokes. */
function searchLabel(r: GlobalResult): string {
  return r.kind === "locality" && r.uf ? `${r.title} - ${r.uf}` : r.title;
}

function Thumb({ result }: { result: GlobalResult }) {
  // A missing or failing image becomes a quiet empty tile of the same size — never a broken-image icon, never a layout jump.
  const [broken, setBroken] = useState(false);
  if (!result.image) return null;
  return (
    <span className="relative block h-14 w-14 shrink-0 overflow-hidden bg-paper sm:h-16 sm:w-16" aria-hidden="true">
      {broken ? null : result.image.startsWith(INK_IMAGES) ? (
        <Image src={result.image} alt="" fill sizes="64px" quality={70} className="object-cover" onError={() => setBroken(true)} />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- CMS uploads are served pre-sized from the media origin
        <img src={result.image} alt="" loading="lazy" decoding="async" onError={() => setBroken(true)} className="absolute inset-0 h-full w-full object-cover" />
      )}
    </span>
  );
}

/**
 * The storefront's global search: one field for places, designs and editorial pages. Results come from `/api/busca` (an in-process index of the
 * published snapshots — never INK), grouped by kind; the current region first, then "Em outras regiões". Results live in the page flow (no
 * floating dropdown), so it behaves the same on a phone, in a sheet, and with a screen reader. A design is ONE row per place × family, its
 * pieces counted from the product cluster, never one row per piece.
 */
export function GlobalSearch({ region, autoFocus = false, onNavigate, source, sticky = false }: Props) {
  const copy = placeSearchCopy(region);
  const router = useRouter();
  const uid = useId();
  const listId = `${uid}-list`;
  const inputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState("");
  const [data, setData] = useState<GlobalSearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [active, setActive] = useState(0);
  const trimmed = query.trim();

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  useEffect(() => {
    if (trimmed.length === 0) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      setFailed(false);
      fetchResults(region, trimmed, controller.signal).then(
        (res) => {
          if (controller.signal.aborted) return;
          setData(res);
          setActive(0);
          setLoading(false);
        },
        () => {
          if (controller.signal.aborted) return;
          setFailed(true);
          setLoading(false);
        },
      );
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [region, trimmed, retry]);

  // Only the answer to what is in the box now is shown; a stale answer stays visible while the next one loads (no flicker), never after clearing.
  const current = trimmed.length > 0 ? data : null;
  // Sections in display order, each with the position of its first row in the flat list the keyboard walks.
  const { rows, sections } = useMemo(() => {
    const sections: { id: string; label: string | null; rows: Row[]; start: number }[] = [];
    let start = 0;
    for (const g of current?.groups ?? []) {
      sections.push({ id: g.group, label: null, rows: g.items.map((result) => ({ result, other: false })), start });
      start += g.items.length;
    }
    if (current && current.others.length > 0) sections.push({ id: "others", label: "Em outras regiões", rows: current.others.map((result) => ({ result, other: true })), start });
    return { rows: sections.flatMap((x) => x.rows), sections };
  }, [current]);
  const activeIndex = Math.min(active, Math.max(rows.length - 1, 0));
  const showEmpty = current !== null && !loading && trimmed.length >= 2 && rows.length === 0;
  const hasList = rows.length > 0;

  // The single conclusive-search gesture (Enter or a click on a row): Search fires here, once. A place also fires SelectCity, as before.
  const choose = (row: Row | undefined) => {
    if (!row) return;
    const r = row.result;
    trackSearch(searchLabel(r), { region, resultsCount: current?.total ?? 0, selectedResultType: r.kind });
    if (r.kind === "locality" && r.city && r.uf) {
      trackSelectCity({ city: r.city, state: r.uf, region: r.region, source, ...(r.administrativeRegion ? { localityType: "administrative_region" as const } : {}) });
    }
    onNavigate?.();
    if (r.external) window.location.assign(r.href);
    else router.push(r.href);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive(rows.length ? (activeIndex + 1) % rows.length : 0);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive(rows.length ? (activeIndex - 1 + rows.length) % rows.length : 0);
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (rows.length > 0) choose(rows[activeIndex]);
      else if (trimmed.length >= 2) {
        onNavigate?.();
        router.push(`/${region}/busca?${new URLSearchParams({ q: trimmed })}`);
      }
    }
    // Esc is left to the native <dialog>, which closes on it (inline, outside a dialog, it does nothing).
  };

  const muted = "text-ink-mute";
  const renderRow = (row: Row, i: number) => {
    const r = row.result;
    const isActive = i === activeIndex;
    const place = r.kind === "locality" || r.kind === "state";
    const regionNote = row.other ? ` · ${REGIONS[r.region].name}` : "";
    return (
      <div
        key={`${r.region}:${r.kind}:${r.href}`}
        id={`${uid}-opt-${i}`}
        role="option"
        aria-selected={isActive}
        data-result-kind={r.kind}
        onMouseDown={(event) => {
          event.preventDefault();
          choose(row);
        }}
        // mousemove, not mouseenter: results appearing under a pointer that has not moved (the trigger was clicked right there) must not steal
        // the keyboard's active row — Enter would then open whatever happened to land under the cursor.
        onMouseMove={() => i !== activeIndex && setActive(i)}
        className={`search-row flex min-h-14 cursor-pointer items-center gap-3 border-b border-line px-3 py-2.5 ${isActive ? "bg-region-primary text-white" : ""}`}
      >
        <Thumb result={r} />
        {place ? (
          <span className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
            <span className="min-w-0 break-words text-[clamp(1.375rem,3.4vw,2.25rem)] font-extrabold leading-tight tracking-tight">{r.title}</span>
            <span className={`t-place min-w-0 text-[0.95rem] sm:text-right ${isActive ? "text-white/80" : muted}`}>
              {r.subtitle}
              {regionNote}
            </span>
          </span>
        ) : (
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="min-w-0 break-words text-[1.125rem] font-extrabold leading-tight tracking-tight sm:text-[1.3125rem]">{r.title}</span>
            <span className={`min-w-0 text-[0.875rem] leading-snug ${isActive ? "text-white/85" : muted}`}>
              {/* The group heading already says "Estampas"; the type is spelled out where it is not (editorial kinds, other regions). */}
              {(row.other || r.kind === "page") && <span className="font-semibold">{r.tag} · </span>}
              {r.subtitle}
              {regionNote}
              {r.external && <span className="sr-only"> (abre a loja)</span>}
            </span>
          </span>
        )}
      </div>
    );
  };

  const heading = (text: string, id: string) => (
    <p id={id} role="presentation" className={`t-label mt-6 mb-1 px-3 ${muted}`}>
      {text}
    </p>
  );

  return (
    <div className="w-full">
      <div className={sticky ? "sticky top-0 z-10 -mx-5 bg-ground px-5 pb-1 pt-1 sm:-mx-10 sm:px-10" : ""}>
        <label htmlFor={`${uid}-input`} className="sr-only">
          {copy.label}
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
          enterKeyHint="search"
          inputMode="search"
          maxLength={80}
          placeholder={copy.placeholder}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          className="search-input block w-full border-0 border-b-[3px] border-ink bg-transparent px-0 pb-3 pt-2 text-[clamp(1.5rem,5.5vw,3.25rem)] font-extrabold leading-none tracking-tight text-ink outline-none transition-colors placeholder:text-[clamp(1.125rem,4.4vw,2.25rem)] placeholder:font-semibold placeholder:text-ink-mute focus:border-region-ink focus:outline-none"
        />
      </div>

      <div id={listId} role="listbox" aria-label="Resultados da busca" className={hasList ? "mt-2" : "hidden"}>
        {sections.map((section) => (
          <div key={section.id} role="group" aria-labelledby={`${uid}-g-${section.id}`}>
            {heading(section.label ?? (section.id === "places" ? copy.placesGroup : GROUP_LABEL[section.id as Exclude<GlobalGroup, "places">]), `${uid}-g-${section.id}`)}
            {section.rows.map((row, k) => renderRow(row, section.start + k))}
          </div>
        ))}
      </div>

      {trimmed.length >= 2 && !failed && (current || !loading) && (
        <p className="mt-5 px-3">
          <Link href={`/${region}/busca?${new URLSearchParams({ q: trimmed })}`} onClick={() => onNavigate?.()} className="link-static inline-flex min-h-11 items-center font-semibold">
            Ver todos os produtos para “{trimmed}” →
          </Link>
        </p>
      )}

      {loading && !current && <p className={`mt-4 text-[0.9375rem] ${muted}`}>{copy.loading}</p>}
      {failed && (
        <p className="mt-4 text-[0.9375rem]">
          {copy.failed}{" "}
          <button type="button" onClick={() => setRetry((n) => n + 1)} className="link-static min-h-11 font-semibold">
            Tentar de novo
          </button>
        </p>
      )}

      {showEmpty && (
        <div className="mt-5">
          <p className="font-semibold">{copy.empty}</p>
          <p className={`mt-1 text-[0.9375rem] ${muted}`}>{copy.emptyHint}</p>
          <ul className="mt-4 flex flex-wrap gap-2">
            {REGIONS[region].ufs.map((uf) => (
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
        {trimmed.length === 0 ? "" : hasList ? `${rows.length} resultados. Use as setas para navegar.` : showEmpty ? "Nenhum resultado." : ""}
      </p>
    </div>
  );
}
