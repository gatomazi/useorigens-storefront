"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { FamilyGridView } from "@/components/catalog/FamilyGridView";
import { fetchPlaces } from "@/components/city-journey/CityJourney";
import { SOURCES } from "@/lib/analytics/sources";
import { trackCityFinder, trackSearch, trackSelectCity } from "@/lib/analytics/track";
import { minhaCidadeHref, type FinderCity, type FinderState } from "@/lib/catalog/city-finder-shared";
import { REGIONS, UF_TO_REGION, type RegionSlug } from "@/lib/geo/regions";
import { normalizeText } from "@/lib/geo/text";
import { prepareCities, searchCities, type SearchCity } from "@/lib/search/rank";
import type { CardBuy } from "@/lib/site-config/cards-schema";

/**
 * "Quero minha cidade": one page that goes down as it is answered — the state, then the place, then the place's designs right under it, as the
 * same cards its own page shows (a card opens the product in the store), with the way to that page and all it has. A second way into the store's
 * places beside the "Sua cidade" journey (src/components/city-journey/CityJourney.tsx), measured apart (source `minha_cidade`).
 *
 * An answered step folds into one line with "Trocar", so the next question is always the next thing on the screen. The answers live in the
 * address (`?estado=sc&cidade=lages`) through the browser's history: the phone's back button takes back one answer, a step can be shared, nothing
 * reloads. Data: the states come with the page; a state's places are the city search's own index (`/api/cidades/<região>`); a place's designs
 * come from `/api/minha-cidade/<região>/<uf>/<cidade>`. A place of another region is shown, and sold, in its own region.
 */
type Load<T> = { status: "loading" } | { status: "error" } | { status: "ok"; data: T };

const num = new Intl.NumberFormat("pt-BR");
const REGION_ORDER: readonly RegionSlug[] = ["sul", "centro-oeste", "norte"];
const byName = (a: SearchCity, b: SearchCity) => normalizeText(a.n).localeCompare(normalizeText(b.n), "pt-BR");

// A place's designs, asked for once per visit; a failure is never remembered, so "Tentar de novo" asks again.
const cities = new Map<string, Promise<FinderCity | null>>();
function fetchCity(region: RegionSlug, uf: string, slug: string): Promise<FinderCity | null> {
  const key = `${region}/${uf.toLowerCase()}/${slug}`;
  const known = cities.get(key);
  if (known) return known;
  const request = fetch(`/api/minha-cidade/${key}`).then(async (res) => {
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`minha-cidade ${res.status}`);
    return (await res.json()) as FinderCity;
  });
  cities.set(key, request);
  request.catch(() => cities.delete(key));
  return request;
}

function useAsync<T>(key: string | null, load: () => Promise<T>): [Load<T> | null, () => void] {
  const [result, setResult] = useState<{ key: string; value: Load<T> } | null>(null);
  const [attempt, setAttempt] = useState(0);
  // An answer counts only for the request it answers (the key and the attempt): anything else reads as still loading.
  const asked = key ? `${key}#${attempt}` : null;
  useEffect(() => {
    if (!asked) return;
    let live = true;
    load().then(
      (data) => live && setResult({ key: asked, value: { status: "ok", data } }),
      () => live && setResult({ key: asked, value: { status: "error" } }),
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `asked` names what `load` asks for
  }, [asked]);
  return [asked ? (result?.key === asked ? result.value : { status: "loading" }) : null, () => setAttempt((n) => n + 1)];
}

function SearchIcon({ className }: { className: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </svg>
  );
}

function ArrowIcon({ className, back = false }: { className: string; back?: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={className}
      data-dir={back ? "back" : "forward"}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={back ? "M19 12H5M11 6l-6 6 6 6" : "M5 12h14M13 6l6 6-6 6"} />
    </svg>
  );
}

/** An answered step, folded: what was chosen, large, and the way to change it. */
function Answer({ label, value, change, onChange, testId }: { label: string; value: string; change: string; onChange: () => void; testId: string }) {
  return (
    <div className="finder-answer" data-testid={testId}>
      <p className="t-label text-ink-mute">{label}</p>
      <p className="finder-answer-value">{value}</p>
      <button type="button" onClick={onChange} className="action-link" aria-label={change}>
        <ArrowIcon className="h-4 w-4" back />
        Trocar
      </button>
    </div>
  );
}

export type FinderAnswer = Record<"estado" | "cidade", string | null>;
type Entry = "page" | "home_states";

/** The page: the answers live in the address (see the module's comment), and a state of another region opens the page of that region. */
export function CityFinder({ region, states, total, buy }: { region: RegionSlug; states: readonly FinderState[]; total: number; buy?: CardBuy }) {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  /**
   * One answer forward (a new history entry); keys set to null leave the address. A state of another region opens this page in that region (a
   * client navigation): its colours, and the store view its products are sold in, follow the place, as the site's other ways to a place do.
   */
  const go = (next: FinderAnswer) => {
    const query = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) query.set(key, value);
      else query.delete(key);
    }
    const target = next.estado ? UF_TO_REGION[next.estado.toUpperCase()] : undefined;
    if (target && target !== region) return router.push(`${minhaCidadeHref(target)}?${query}`);
    window.history.pushState(null, "", `${pathname}${query.size ? `?${query}` : ""}`);
  };
  return (
    <div className="city-finder wrap" data-testid="city-finder">
      <header className="finder-intro">
        <h1 className="t-h1">Quero minha cidade</h1>
        <p className="t-place mt-3 max-w-[40ch] text-ink-soft">
          {num.format(total)} cidades com estampa. Escolha o estado e a cidade: os modelos aparecem logo abaixo.
        </p>
      </header>
      <FinderFlow
        region={region}
        states={states}
        buy={buy}
        uf={params.get("estado")?.toUpperCase() ?? null}
        citySlug={params.get("cidade")}
        go={go}
        entry="page"
      />
    </div>
  );
}

/**
 * The questions themselves, driven by whoever holds the answers: the page (the address) or the home's dialog (its own state, src/components/
 * city-finder/CityFinderDialog.tsx). `quick` adds "Já sabe? Digite a cidade" to the state question.
 */
export function FinderFlow({
  region,
  states,
  buy,
  uf,
  citySlug,
  go,
  entry,
  quick = true,
}: {
  region: RegionSlug;
  states: readonly FinderState[];
  buy?: CardBuy;
  uf: string | null;
  citySlug: string | null;
  go: (next: FinderAnswer) => void;
  entry: Entry;
  quick?: boolean;
}) {
  const state = uf ? (states.find((s) => s.uf === uf) ?? null) : null;

  // The state's places: the region's index of the city search, kept to that state, in name order.
  const [placesLoad, retryPlaces] = useAsync(state ? state.region : null, () => fetchPlaces(state!.region));
  const places = useMemo(
    () => (placesLoad?.status === "ok" && state ? placesLoad.data.filter((p) => p.u === state.uf).sort(byName) : null),
    [placesLoad, state],
  );
  const [cityLoad, retryCity] = useAsync(state && citySlug ? `${state.uf}/${citySlug}` : null, () => fetchCity(state!.region, state!.uf, citySlug!));
  const city = cityLoad?.status === "ok" ? cityLoad.data : null;

  useEffect(() => {
    if (placesLoad?.status === "error" || cityLoad?.status === "error")
      trackCityFinder("origens_minha_cidade_error", {
        region,
        entry_point: entry,
        ...(uf ? { uf } : {}),
        ...(citySlug ? { city_slug: citySlug } : {}),
      });
  }, [placesLoad?.status, cityLoad?.status, region, uf, citySlug, entry]);

  const chooseState = (next: FinderState) => {
    trackCityFinder("origens_minha_cidade_state", {
      region,
      entry_point: entry,
      uf: next.uf,
      place_count: next.places,
    });
    go({ estado: next.uf.toLowerCase(), cidade: null });
  };
  const choosePlace = (place: Pick<SearchCity, "n" | "u" | "s">) => {
    trackSelectCity({
      city: place.n,
      state: place.u,
      region: UF_TO_REGION[place.u] ?? region,
      source: SOURCES.minhaCidade,
    });
    go({ estado: place.u.toLowerCase(), cidade: place.s });
  };
  const allModels = (data: FinderCity) =>
    trackCityFinder("origens_minha_cidade_all_models", {
      region,
      entry_point: entry,
      uf: data.place.uf,
      city_slug: data.place.slug,
      model_count: data.cards.length,
    });

  // The text typed belongs to its state: another state starts with an empty field.
  const [typed, setTyped] = useState({ uf: "", text: "" });
  const query = typed.uf === uf ? typed.text : "";
  const prepared = useMemo(() => (places ? prepareCities(places) : []), [places]);
  const matches = useMemo(() => {
    if (!places || !state) return null;
    if (!query.trim()) return places;
    return searchCities(prepared, query, {
      ufs: [state.uf],
      limit: 400,
    }).flatMap((r) => (r.type === "city" ? [r.city] : []));
  }, [places, prepared, query, state]);
  const searched = useRef("");
  useEffect(() => {
    // One Search per pause in typing, like the store's other fields: never one per key.
    const term = query.trim();
    if (term.length < 2 || !matches || term === searched.current) return;
    const timer = window.setTimeout(() => {
      searched.current = term;
      trackSearch(term, {
        region,
        resultsCount: matches.length,
        selectedResultType: "minha_cidade",
      });
    }, 900);
    return () => window.clearTimeout(timer);
  }, [query, matches, region]);

  // The step an answer opens comes up under the header (the page's scroll padding), its question taking the focus for the keyboard and screen
  // readers. Not on arrival: a shared link opens where it points, scrolled as the browser leaves it.
  const cityStep = useRef<HTMLElement>(null);
  const modelsStep = useRef<HTMLElement>(null);
  const open = citySlug ? "models" : state ? "city" : "state";
  const shown = useRef(open);
  useEffect(() => {
    if (shown.current === open) return;
    shown.current = open;
    const target = open === "models" ? modelsStep.current : open === "city" ? cityStep.current : null;
    if (!target) return;
    target.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "start",
    });
    target.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
  }, [open]);

  const byRegion = REGION_ORDER.map((r) => ({
    region: r,
    states: states.filter((s) => s.region === r),
  })).filter((g) => g.states.length > 0);

  return (
    <>
      <section className="finder-step" aria-labelledby={state ? undefined : "finder-state-title"} aria-label={state ? "Estado" : undefined}>
        {state ? (
          <Answer label="Estado" value={state.name} change="Trocar o estado" onChange={() => go({ estado: null, cidade: null })} testId="finder-state-answer" />
        ) : (
          <>
            <h2 id="finder-state-title" tabIndex={-1} className="finder-question">
              Qual é o seu estado?
            </h2>
            {quick && <QuickPlace region={region} states={states} onPick={choosePlace} />}
            <div className="mt-8 space-y-7">
              {byRegion.map((group) => (
                <div key={group.region}>
                  <h3 className="t-label text-ink-mute">{REGIONS[group.region].name}</h3>
                  <ul className="finder-states mt-3">
                    {group.states.map((s) => (
                      <li key={s.uf}>
                        <button type="button" onClick={() => chooseState(s)} className="finder-state" data-testid={`finder-state-${s.uf.toLowerCase()}`}>
                          <span className="finder-state-uf">{s.uf}</span>
                          <span className="finder-state-name">{s.name}</span>
                          <span className="finder-state-count">
                            {num.format(s.places)} {s.places === 1 ? "cidade" : "cidades"}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      {state && !citySlug && (
        <section ref={cityStep} className="finder-step" aria-labelledby="finder-city-title">
          <h2 id="finder-city-title" tabIndex={-1} className="finder-question">
            E a sua cidade?
          </h2>
          <label className="finder-field mt-5">
            <SearchIcon className="h-6 w-6 shrink-0" />
            <span className="sr-only">Nome da cidade em {state.name}</span>
            <input
              type="search"
              value={query}
              onChange={(e) => setTyped({ uf: state.uf, text: e.target.value })}
              placeholder={`Digite uma cidade de ${state.name}`}
              autoComplete="off"
              enterKeyHint="search"
              onKeyDown={(e) => {
                if (e.key === "Enter" && matches?.[0]) choosePlace(matches[0]);
              }}
              data-testid="finder-input"
            />
          </label>
          {placesLoad?.status === "error" ? (
            <p className="mt-5 t-body" role="alert">
              Não deu para carregar as cidades de {state.name}.{" "}
              <button type="button" onClick={retryPlaces} className="link-static font-semibold">
                Tentar de novo
              </button>
            </p>
          ) : !matches ? (
            <p className="mt-5 t-small text-ink-mute">Carregando as cidades…</p>
          ) : matches.length === 0 ? (
            <p className="mt-5 t-body">
              Nenhuma cidade de {state.name} com “{query.trim()}”. Confira a grafia ou{" "}
              <Link href={`/${state.region}/${state.uf.toLowerCase()}`} className="link-static font-semibold">
                veja a página do estado
              </Link>
              .
            </p>
          ) : (
            <>
              <p className="mt-4 t-small text-ink-mute" aria-live="polite">
                {query.trim()
                  ? `${num.format(matches.length)} ${matches.length === 1 ? "cidade" : "cidades"} com “${query.trim()}”`
                  : `${num.format(matches.length)} cidades, de A a Z`}
              </p>
              <ul className="finder-places mt-2" data-testid="finder-places">
                {matches.map((p) => (
                  <li key={p.s}>
                    <button type="button" onClick={() => choosePlace(p)} className="finder-place">
                      {p.n}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {state && citySlug && (
        <section ref={modelsStep} className="finder-step finder-models" aria-labelledby="finder-models-title">
          {cityLoad?.status === "error" ? (
            <p className="t-body" role="alert">
              Não deu para carregar os modelos.{" "}
              <button type="button" onClick={retryCity} className="link-static font-semibold">
                Tentar de novo
              </button>
            </p>
          ) : !city ? (
            cityLoad?.status === "ok" ? (
              <p className="t-body">
                Essa cidade não está no catálogo de {state.name}.{" "}
                <button type="button" onClick={() => go({ estado: state.uf.toLowerCase(), cidade: null })} className="action-link mt-3">
                  Escolher outra
                </button>
              </p>
            ) : (
              <p className="t-small text-ink-mute">Carregando os modelos…</p>
            )
          ) : (
            <>
              <div className="finder-models-head">
                <div>
                  <h2 id="finder-models-title" tabIndex={-1} className="t-city finder-models-title">
                    {city.place.name}
                  </h2>
                  <p className="t-place mt-2 text-ink-soft">{city.place.subtitle}</p>
                  <button
                    type="button"
                    onClick={() => go({ estado: state.uf.toLowerCase(), cidade: null })}
                    className="action-link mt-3"
                    data-testid="finder-change-city"
                  >
                    <ArrowIcon className="h-4 w-4" back />
                    Trocar cidade
                  </button>
                </div>
                {/* A wrapper carries the breakpoint: `.btn` is a rule of the unlayered stylesheet and would win over `hidden` on the link itself. */}
                <span className="hidden shrink-0 md:block">
                  <Link href={city.place.page} onClick={() => allModels(city)} className="btn btn-ghost">
                    Ver todos os modelos
                    <ArrowIcon className="h-5 w-5" />
                  </Link>
                </span>
              </div>
              {city.cards.length === 0 ? (
                <p className="mt-6 t-body">Ainda não há modelos à venda para {city.place.name}.</p>
              ) : (
                <div className="mt-6" data-testid="finder-cards">
                  <FamilyGridView cards={city.cards} buy={buy} />
                </div>
              )}
              <div className="finder-all mt-8">
                <Link href={city.place.page} onClick={() => allModels(city)} className="btn w-full md:w-auto" data-testid="finder-all-models">
                  Ver todos os modelos de {city.place.name}
                  <ArrowIcon className="h-5 w-5" />
                </Link>
                <p className="t-small text-ink-mute">Na página da cidade: as outras peças (oversized, cropped, moletom…), as versões e os outros artigos.</p>
              </div>
            </>
          )}
        </section>
      )}
    </>
  );
}

/**
 * "Já sabe a cidade?": a place typed straight away, searched in the launched regions' indexes (the city search's own), so someone who knows the
 * name never has to pick the state first. Asks for the indexes the first time the field is focused.
 */
function QuickPlace({ region, states, onPick }: { region: RegionSlug; states: readonly FinderState[]; onPick: (place: SearchCity) => void }) {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState<SearchCity[] | null>(null);
  const asked = useRef(false);
  const regions = useMemo(() => [region, ...REGION_ORDER.filter((r) => r !== region)].filter((r) => states.some((s) => s.region === r)), [region, states]);
  const load = () => {
    if (asked.current) return;
    asked.current = true;
    Promise.allSettled(regions.map(fetchPlaces)).then((all) => setIndex(all.flatMap((r) => (r.status === "fulfilled" ? r.value : []))));
  };
  const prepared = useMemo(() => (index ? prepareCities(index) : []), [index]);
  const ufs = useMemo(() => states.map((s) => s.uf), [states]);
  const results = query.trim() && index ? searchCities(prepared, query, { ufs, limit: 6 }).flatMap((r) => (r.type === "city" ? [r.city] : [])) : [];
  return (
    <div className="mt-5">
      <label className="finder-field">
        <SearchIcon className="h-6 w-6 shrink-0" />
        <span className="sr-only">Já sabe a cidade? Digite o nome</span>
        <input
          type="search"
          value={query}
          onFocus={load}
          onChange={(e) => {
            load();
            setQuery(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && results[0]) onPick(results[0]);
          }}
          placeholder="Já sabe? Digite a cidade"
          autoComplete="off"
          enterKeyHint="search"
          data-testid="finder-quick"
        />
      </label>
      {query.trim() && (
        <ul className="finder-results mt-2" data-testid="finder-quick-results">
          {!index ? (
            <li className="t-small px-1 py-2 text-ink-mute">Carregando…</li>
          ) : results.length === 0 ? (
            <li className="t-small px-1 py-2">Nenhuma cidade com “{query.trim()}”. Escolha o estado abaixo.</li>
          ) : (
            results.map((p) => (
              <li key={`${p.u}/${p.s}`}>
                <button type="button" onClick={() => onPick(p)} className="finder-result">
                  <span className="font-semibold">{p.n}</span>
                  <span className="t-caption">{p.t === "ra" ? "Região Administrativa · DF" : `${p.m ? `${p.m} · ` : ""}${p.u}`}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
