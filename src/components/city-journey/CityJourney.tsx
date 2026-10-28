"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { PriceText } from "@/components/catalog/PriceText";
import { CARD_FOOT, CARD_INFO, CARD_NAME, CARD_PRICE, cardFrame } from "@/components/catalog/ProductCard";
import { GlobalSearch, SearchIcon } from "@/components/search/GlobalSearch";
import { SOURCES } from "@/lib/analytics/sources";
import { trackCityJourney, trackGoToInk, trackSelectCity, type CityJourneyParams } from "@/lib/analytics/track";
import type { CityJourneyData, JourneyModel, JourneyPick, JourneyPiece } from "@/lib/catalog/city-journey";
import { CLASSIC_GARMENT_TYPE_ID } from "@/lib/catalog/garments";
import { formatPrice } from "@/lib/format";
import { allAdministrativeRegions } from "@/lib/geo/administrative-regions";
import { STATE_NAMES, type RegionSlug } from "@/lib/geo/regions";
import { guideCityQuery } from "@/lib/guide/dismiss";
import type { GlobalResult } from "@/lib/search/global";
import { prepareCities, searchCities, type SearchCity } from "@/lib/search/rank";

/**
 * "Sua cidade": a journey on ONE screen, never a page change — the place (the store's own search, places only, a shortcut, or a state's list of
 * places), then its designs side by side like products, then the piece (the classic tee or another garment type of the same design), with the
 * purchase bar that opens that exact product in the store. A full-screen native <dialog> (focus trap, Escape and the inert page come from the
 * platform), drawn in the header's colours on top and the page's ground below, at every width.
 *
 * ONE journey per page, mounted in the header (`CityJourney`); every way into it is a `CityJourneyTrigger` (the header menu's word, the phone
 * menu's box, the home's "Encontre aqui a sua cidade") that opens that same dialog, so a place chosen from any of them is the place every other
 * one reopens on, and the dialog never sits inside the phone menu's own.
 *
 * Data: one request per place (`/api/cidades/<region>/<uf>/<slug>`, src/lib/catalog/city-journey.ts) and, for a state, the region's index of
 * places (`/api/cidades/<region>`), each kept for the visit. A place of another region found by the search opens its own page, as the search
 * always does: the store view of a purchase follows the region being browsed (CampaignCarry), so a design of another region is never sold here.
 *
 * Measured with the store's usual events (Search / SelectCity / GoToInk, source `sua_cidade`) and, in between, `origens_sua_cidade_*` (GA4).
 * The button to the store is a plain link: the campaign and the region go along on the click (CampaignCarry), the same tab, like every card.
 *
 * This stylesheet is not layered, so the store's own classes (`.wrap`, `.btn`, `.chip`, `.t-*`) win over utilities on the same element: widths
 * live on an inner box and the journey's variants of those classes are rules in globals.css (`.city-journey`), never utilities piled on top.
 */
type Step = "city" | "model" | "piece";
type Entry = NonNullable<CityJourneyParams["entry_point"]>;
type Loaded = { status: "loading" } | { status: "error" } | { status: "ok"; data: CityJourneyData | null };
type Places = { status: "loading" } | { status: "error" } | { status: "ok"; list: SearchCity[] };
type OpenDetail = { entry: Entry; opener: HTMLElement | null };

const OPEN_EVENT = "origens:sua-cidade";
const STEPS: readonly { id: Step; label: string }[] = [
  { id: "city", label: "Cidade" },
  { id: "model", label: "Modelo" },
  { id: "piece", label: "Peça" },
];
const stepIndex = (step: Step) => STEPS.findIndex((s) => s.id === step);
// The photos of step 2's cards: the stage reuses this exact request as its first picture, already in the browser's cache.
const CARD_SIZES = "(min-width: 1280px) 17vw, (min-width: 1024px) 22vw, (min-width: 640px) 30vw, 46vw";

// The places already asked for in this visit. A failure is never remembered: "Tentar de novo" asks again.
const journeys = new Map<string, Promise<CityJourneyData | null>>();
function fetchJourney(region: RegionSlug, place: JourneyPick): Promise<CityJourneyData | null> {
  const key = `${region}/${place.uf.toLowerCase()}/${place.slug}`;
  const known = journeys.get(key);
  if (known) return known;
  const request = fetch(`/api/cidades/${key}`).then(async (res) => {
    if (res.status === 404) return null; // no such place here: an empty answer, with its exits
    if (!res.ok) throw new Error(`sua-cidade ${res.status}`);
    return (await res.json()) as CityJourneyData;
  });
  journeys.set(key, request);
  request.catch(() => journeys.delete(key));
  return request;
}

// The region's places with designs (the compact index the city search has always used), asked for the first time a state is opened.
const regionPlaces = new Map<RegionSlug, Promise<SearchCity[]>>();
function fetchPlaces(region: RegionSlug): Promise<SearchCity[]> {
  const known = regionPlaces.get(region);
  if (known) return known;
  const request = fetch(`/api/cidades/${region}`).then(async (res) => {
    if (!res.ok) throw new Error(`cidades ${res.status}`);
    return (await res.json()) as SearchCity[];
  });
  regionPlaces.set(region, request);
  request.catch(() => regionPlaces.delete(region));
  return request;
}

const price = (piece: JourneyPiece) => <PriceText price={formatPrice(piece.price) ?? ""} listPrice={piece.listPrice ? formatPrice(piece.listPrice) : undefined} />;
const ACCENT = "text-[var(--region-accent-ink,var(--region-primary))]";

function ArrowIcon({ className, back = false }: { className: string; back?: boolean }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d={back ? "M19 12H5M11 6l-6 6 6 6" : "M5 12h14M13 6l6 6-6 6"} />
    </svg>
  );
}

function PinIcon({ className }: { className: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round">
      <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" />
      <circle cx="12" cy="10" r="2.4" />
    </svg>
  );
}

function CheckIcon({ className }: { className: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  );
}

/**
 * A way into the page's journey: the word in the desktop header's menu (`nav`), the box under "Sua cidade" in the phone menu (`field`), or a quiet
 * link next to styles shown on an example city (`link`, the home's "Encontre aqui a sua cidade"). Each one only opens the journey of the header.
 */
export function CityJourneyTrigger({ variant, label = "Encontre aqui a sua cidade" }: { variant: "nav" | "field" | "link"; label?: string }) {
  const entry: Entry = variant === "nav" ? "header" : variant === "field" ? "menu" : "home";
  const open = (event: React.MouseEvent<HTMLButtonElement>) =>
    window.dispatchEvent(new CustomEvent<OpenDetail>(OPEN_EVENT, { detail: { entry, opener: event.currentTarget } }));
  if (variant === "nav") {
    return (
      // A word in the header's menu: it opens the journey, so it is a button, drawn like the menu's links.
      <button type="button" onClick={open} aria-haspopup="dialog" className="inline-flex min-h-11 items-center whitespace-nowrap py-1 text-[0.9375rem] font-semibold" data-testid="header-sua-cidade">
        <span className="link-line">Sua cidade</span>
      </button>
    );
  }
  if (variant === "field") {
    return (
      <button
        type="button"
        onClick={open}
        aria-haspopup="dialog"
        className="group flex min-h-16 w-full items-center gap-3 border-2 border-ink bg-white px-4 text-left text-ink transition-colors hover:border-region-primary hover:bg-paper"
        data-testid="menu-sua-cidade"
      >
        <PinIcon className="h-6 w-6 shrink-0" />
        <span className="flex-1 text-[1.0625rem] font-medium text-ink-mute">Qual é a sua cidade?</span>
        <span aria-hidden="true" className="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center bg-ink text-white transition-colors group-hover:bg-region-primary">
          <ArrowIcon className="h-5 w-5" />
        </span>
      </button>
    );
  }
  return (
    <button type="button" onClick={open} aria-haspopup="dialog" className="link-static inline-flex min-h-11 items-center gap-1.5 font-semibold" data-testid="home-sua-cidade">
      <PinIcon className="h-4 w-4 shrink-0" />
      {label}
    </button>
  );
}

/**
 * The big photo of the chosen design in the chosen piece, as large as the screen allows with the pieces and the purchase bar in view
 * (`.journey-stage`). Under it, always, the small picture of that same piece already in the browser (the card of step 2 for the first piece, the
 * piece's thumbnail for the others): the frame is never empty and never shows the piece chosen before; the large picture fades in over it.
 * Every piece seen keeps its large picture mounted, so switching back to one is instant.
 */
function Stage({ pieces, visited, selected, alt, className = "" }: { pieces: JourneyPiece[]; visited: string[]; selected: string; alt: string; className?: string }) {
  const [ready, setReady] = useState<string[]>([]);
  const first = visited[0];
  const standIn = pieces.find((p) => p.slug === selected);
  return (
    <div className={`journey-stage relative mx-auto aspect-[800/820] w-full overflow-hidden rounded-lg bg-ground ${className}`} data-testid="journey-stage">
      {standIn && (
        // The thumbnail is small: drawn slightly out of focus it reads as "on its way", not as a poor photo.
        <Image
          key={`stand-in-${standIn.slug}`}
          src={standIn.image}
          alt=""
          fill
          sizes={standIn.slug === first ? CARD_SIZES : "96px"}
          quality={standIn.slug === first ? 80 : 70}
          className={`object-contain ${standIn.slug === first ? "" : "scale-[1.02] blur-[3px]"}`}
        />
      )}
      {pieces
        .filter((p) => visited.includes(p.slug))
        .map((p) => (
          <Image
            key={p.slug}
            src={p.image}
            alt={p.slug === selected ? alt : ""}
            aria-hidden={p.slug === selected ? undefined : true}
            fill
            sizes="(min-width: 1024px) 46vw, 100vw"
            quality={80}
            loading="eager"
            onLoad={() => setReady((list) => (list.includes(p.slug) ? list : [...list, p.slug]))}
            className="object-contain"
            // The piece chosen fades in; the one left goes at once, so two pieces never show through each other.
            style={{ opacity: p.slug === selected && ready.includes(p.slug) ? 1 : 0, transition: p.slug === selected ? "opacity 320ms var(--ease-out)" : "none" }}
          />
        ))}
    </div>
  );
}

/** A state's places with designs, by mesoregion, with a filter: the visitor who types a state chooses the city here, without leaving. */
function StatePlaces({ region, uf, heading, onPick }: { region: RegionSlug; uf: string; heading: RefObject<HTMLHeadingElement | null>; onPick: (place: JourneyPick) => void }) {
  const [places, setPlaces] = useState<Places>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [filter, setFilter] = useState("");
  const name = STATE_NAMES[uf] ?? uf;

  useEffect(() => {
    let live = true;
    fetchPlaces(region).then(
      (list) => {
        if (live) setPlaces({ status: "ok", list });
      },
      () => {
        if (live) setPlaces({ status: "error" });
      },
    );
    return () => {
      live = false;
    };
  }, [region, attempt]);

  const inState = useMemo(() => (places.status === "ok" ? places.list.filter((p) => p.u === uf) : []), [places, uf]);
  const prepared = useMemo(() => prepareCities(inState), [inState]);
  const groups = useMemo(() => {
    const byMeso = new Map<string, SearchCity[]>();
    for (const place of inState) {
      const key = place.m ?? name;
      const list = byMeso.get(key) ?? [];
      list.push(place);
      byMeso.set(key, list);
    }
    return [...byMeso.entries()]
      .map(([meso, list]) => ({ meso, list: list.sort((a, b) => a.n.localeCompare(b.n, "pt-BR")) }))
      .sort((a, b) => a.meso.localeCompare(b.meso, "pt-BR"));
  }, [inState, name]);
  const query = filter.trim();
  const found = query ? searchCities(prepared, query, { ufs: [uf], limit: 60 }).flatMap((r) => (r.type === "city" ? [r.city] : [])) : null;
  const regions = inState.some((p) => p.t === "ra");
  const noun = regions ? (inState.length === 1 ? "localidade" : "localidades") : inState.length === 1 ? "cidade" : "cidades";

  const item = (place: SearchCity) => (
    <li key={`${place.u}/${place.s}`} className="break-inside-avoid">
      <button type="button" onClick={() => onPick({ name: place.n, uf: place.u, slug: place.s })} className="flex min-h-11 w-full items-center py-1 text-left text-[0.9375rem] font-semibold leading-snug hover:text-region-ink">
        <span className="link-line">{place.n}</span>
      </button>
    </li>
  );

  return (
    <section className="journey-in wrap pb-14 pt-6 sm:pt-10" data-step="state">
      <h2 ref={heading} tabIndex={-1} className="font-display text-[clamp(2.5rem,8vw,4.75rem)] font-extrabold uppercase leading-[0.98] tracking-[0.004em]">
        {name}
      </h2>
      <p className="t-place mt-2 text-ink-soft">{places.status === "ok" ? `${inState.length} ${noun} com estampa` : "Escolha a sua cidade"}</p>

      {places.status === "loading" && (
        <p role="status" className="t-small mt-8 text-ink-soft">
          Carregando as cidades de {name}…
        </p>
      )}
      {places.status === "error" && (
        <div role="alert" className="mt-8">
          <p className="font-semibold">Não conseguimos carregar as cidades agora.</p>
          <button
            type="button"
            onClick={() => {
              setPlaces({ status: "loading" });
              setAttempt((n) => n + 1);
            }}
            className="btn btn-ghost mt-4"
          >
            Tentar de novo
          </button>
        </div>
      )}
      {places.status === "ok" && (
        <>
          <div className="relative mt-6 max-w-xl text-ink">
            <label htmlFor={`filtro-${uf}`} className="sr-only">
              Filtrar as cidades de {name}
            </label>
            <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2" />
            <input
              id={`filtro-${uf}`}
              type="text"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Filtre pelo nome…"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="search"
              maxLength={80}
              className="block min-h-14 w-full border-2 border-ink bg-white pl-12 pr-4 text-[1.0625rem] font-semibold text-ink placeholder:font-medium placeholder:text-ink-mute"
            />
          </div>
          {found ? (
            found.length > 0 ? (
              <ul className="mt-6 columns-2 gap-x-6 sm:columns-3 lg:columns-4" data-testid="journey-state-places">
                {found.map(item)}
              </ul>
            ) : (
              <p className="t-small mt-6 text-ink-soft">Nenhuma cidade de {name} com esse nome. Confira a grafia.</p>
            )
          ) : (
            <div className="mt-8 space-y-8" data-testid="journey-state-places">
              {groups.map((group) => (
                <section key={group.meso} aria-label={group.meso}>
                  <h3 className="t-label text-ink-mute">
                    {group.meso} <span className="font-normal">· {group.list.length}</span>
                  </h3>
                  <ul className="mt-2 columns-2 gap-x-6 sm:columns-3 lg:columns-4 xl:columns-5">{group.list.map(item)}</ul>
                </section>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}

/** The page's one journey (the header mounts it): it opens when any `CityJourneyTrigger` asks for it. */
export function CityJourney({ region, picks = [], finishIn }: {
  region: RegionSlug;
  /** Shortcuts under the field (src/lib/catalog/city-journey.ts `journeyPicks`). */
  picks?: JourneyPick[];
  /** Where the purchase ends ("na nossa loja online"): said in the purchase bar. */
  finishIn: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const entry = useRef<Entry>("header");
  const scroller = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const ticket = useRef(0);
  const pageOverflow = useRef("");
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("city");
  const [stateUf, setStateUf] = useState<string | null>(null);
  const [place, setPlace] = useState<JourneyPick | null>(null);
  const [loaded, setLoaded] = useState<Loaded>({ status: "loading" });
  const [modelId, setModelId] = useState<string | null>(null);
  const [pieceSlug, setPieceSlug] = useState<string | null>(null);
  const [visited, setVisited] = useState<string[]>([]);
  const [typing, setTyping] = useState(false);

  const data = loaded.status === "ok" ? loaded.data : null;
  const models = data?.models ?? [];
  const model = models.find((m) => m.familyId === modelId) ?? null;
  const piece = model?.pieces.find((p) => p.slug === pieceSlug) ?? model?.pieces[0] ?? null;
  const withRegions = allAdministrativeRegions().some((r) => r.regionSlug === region);
  const track = (event: Parameters<typeof trackCityJourney>[0], extra: CityJourneyParams = {}) =>
    trackCityJourney(event, { region, entry_point: entry.current, ...(place ? { city_slug: place.slug, uf: place.uf } : {}), ...extra });

  // The city step always comes back with an empty field, so its words and shortcuts come back with it.
  const goTo = (next: Step) => {
    if (next === "city") {
      setTyping(false);
      setStateUf(null);
    }
    setStep(next);
  };
  const openJourney = ({ entry: from, opener: by }: OpenDetail) => {
    entry.current = from;
    opener.current = by;
    // A place already chosen in this visit opens on its designs (still loading or loaded): closing was not giving up on it. "Trocar cidade" is
    // right there. A place that failed or has no designs starts over at the field.
    const resume = place !== null && loaded.status !== "error" && !(loaded.status === "ok" && models.length === 0);
    goTo(resume ? "model" : "city");
    setOpen(true);
    pageOverflow.current = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    dialog.current?.showModal();
    track("origens_sua_cidade_open");
  };
  const close = () => dialog.current?.close();

  // Any trigger of the page opens this one dialog (the listener always reaches the latest render's state).
  const latestOpen = useRef(openJourney);
  useEffect(() => {
    latestOpen.current = openJourney;
  });
  useEffect(() => {
    const onOpen = (event: Event) => {
      if (!dialog.current?.open) latestOpen.current((event as CustomEvent<OpenDetail>).detail);
    };
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, []);

  // A native listener, not JSX `onClose`: a close done by the platform (Escape) must always reach the state, or the next tap would not reopen it.
  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    const onClose = () => {
      setOpen(false);
      document.documentElement.style.overflow = pageOverflow.current;
      opener.current?.focus({ preventScroll: true });
    };
    node.addEventListener("close", onClose);
    return () => node.removeEventListener("close", onClose);
  }, []);

  // Each step starts at its top, read from its title (the city step's field takes the focus itself, to type at once).
  useEffect(() => {
    if (!open) return;
    scroller.current?.scrollTo({ top: 0 });
    if (step !== "city" || stateUf) heading.current?.focus({ preventScroll: true });
  }, [open, step, stateUf]);

  const choosePlace = (next: JourneyPick) => {
    const mine = ++ticket.current;
    setPlace(next);
    setModelId(null);
    setPieceSlug(null);
    setVisited([]);
    setLoaded({ status: "loading" });
    setStep("model");
    fetchJourney(region, next).then(
      (found) => {
        if (mine === ticket.current) setLoaded({ status: "ok", data: found });
      },
      () => {
        if (mine !== ticket.current) return;
        setLoaded({ status: "error" });
        trackCityJourney("origens_sua_cidade_error", { region, entry_point: entry.current, city_slug: next.slug, uf: next.uf });
      },
    );
  };
  const openState = (uf: string) => {
    setStateUf(uf);
    setTyping(false);
    trackCityJourney("origens_sua_cidade_state", { region, entry_point: entry.current, uf });
  };
  // A place or a state of this region chosen in the search stays here; a place of another region opens its own page (`onNavigate` closes this).
  const pickResult = (result: GlobalResult): boolean => {
    if (result.region !== region) return false;
    if (result.kind === "state" && result.uf) {
      openState(result.uf);
      return true;
    }
    const query = result.kind === "locality" ? guideCityQuery(result.href, region) : null;
    if (!query) return false;
    const [uf, slug] = query.split("/");
    choosePlace({ name: result.title, uf: uf.toUpperCase(), slug });
    return true;
  };
  // A shortcut or a place of a state's list: a city choice without a search (SelectCity only).
  const pickPlace = (pick: JourneyPick) => {
    trackSelectCity({ city: pick.name, state: pick.uf, region, source: SOURCES.suaCidade });
    choosePlace(pick);
  };
  const chooseModel = (next: JourneyModel, position: number) => {
    setModelId(next.familyId);
    setPieceSlug(next.pieces[0].slug);
    setVisited([next.pieces[0].slug]);
    setStep("piece");
    track("origens_sua_cidade_model", { family: next.familyId, position, model_count: models.length, piece_count: next.pieces.length });
  };
  const choosePiece = (next: JourneyPiece) => {
    if (next.slug === piece?.slug) return;
    setPieceSlug(next.slug);
    setVisited((list) => (list.includes(next.slug) ? list : [...list, next.slug]));
    track("origens_sua_cidade_piece", { family: model?.familyId, garment_type: next.slug });
  };
  const goToStore = () => {
    if (!data || !model || !piece) return;
    const classic = piece.garmentTypeId === CLASSIC_GARMENT_TYPE_ID;
    trackGoToInk({
      productId: piece.productId,
      sourceSection: SOURCES.suaCidade,
      city: data.place.name,
      state: data.place.uf,
      family: model.familyId,
      value: piece.price,
      productName: classic ? model.name : `${model.name} ${piece.label}`,
      destinationUrl: piece.href,
      ...(classic ? {} : { garmentType: piece.label }),
    });
  };
  const back = () => {
    if (step === "piece") goTo("model");
    else if (step === "model") goTo("city");
    else if (stateUf) setStateUf(null);
    else close();
  };
  const retry = () => place && choosePlace(place);
  const placePage = place ? `/${region}/${place.uf.toLowerCase()}/${place.slug}` : `/${region}`;
  // The place's own page (its versions, "Fala de…", neighbours): a way out of the journey, never the main path.
  const placeLink = (className: string) =>
    data && (
      <p className={className}>
        <Link href={data.place.page} onClick={close} className="link-static inline-flex min-h-11 items-center font-semibold">
          Ver a página de {data.place.name}
        </Link>
      </p>
    );

  const current = stepIndex(step);
  const reachedValue = (id: Step) => (id === "city" ? place?.name : id === "model" ? model?.name : undefined);

  const bar = (
    <div className="shrink-0 pt-[env(safe-area-inset-top)]" style={{ background: "var(--nav-header-bg, var(--region-primary))", color: "var(--nav-header-text, #fff)" }}>
      <div className="flex h-14 items-center gap-2 px-[var(--gutter)] md:h-16">
        <div className="flex min-w-0 flex-1 items-center">
          {step === "city" && !stateUf ? (
            <p className="hidden items-center gap-2.5 whitespace-nowrap text-[0.8125rem] font-semibold uppercase leading-none tracking-[0.14em] sm:flex">
              <span aria-hidden="true" className="inline-block h-[3px] w-5" style={{ background: "var(--region-accent, currentColor)" }} />
              Sua cidade
            </p>
          ) : (
            <button type="button" onClick={back} className="-ml-2 inline-flex min-h-11 min-w-11 items-center gap-2 px-2 font-semibold" data-testid="journey-back">
              <ArrowIcon className="h-5 w-5" back />
              <span className="hidden sm:inline">Voltar</span>
              <span className="sr-only sm:hidden">Voltar</span>
            </button>
          )}
        </div>
        {/* The three steps; the ones already done are a way back to them, named by what was chosen. */}
        <ol aria-label="Etapas" className="flex shrink-0 items-center gap-1 sm:gap-2">
          {STEPS.map((s, i) => {
            const done = i < current && Boolean(reachedValue(s.id));
            const here = i === current;
            const mark = (
              <>
                <span aria-hidden="true" className={`flex h-6 w-6 shrink-0 items-center justify-center border-2 text-[0.75rem] font-bold leading-none ${here ? "border-current bg-[var(--nav-header-text,#fff)] text-[var(--nav-header-bg,var(--region-primary))]" : done ? "border-current" : "border-current/50 opacity-80"}`}>
                  {done ? <CheckIcon className="h-3.5 w-3.5" /> : i + 1}
                </span>
                <span className={`max-w-[9rem] truncate text-[0.8125rem] font-semibold ${here ? "" : "hidden lg:inline"} ${!here && !done ? "opacity-80" : ""}`}>{done ? reachedValue(s.id) : s.label}</span>
              </>
            );
            return (
              <li key={s.id} aria-current={here ? "step" : undefined} className="flex items-center gap-1 sm:gap-2">
                {i > 0 && <span aria-hidden="true" className="h-px w-3 bg-current opacity-40 sm:w-6" />}
                {done ? (
                  <button type="button" onClick={() => goTo(s.id)} className="flex min-h-11 items-center gap-1.5 px-1" aria-label={`${s.label}: ${reachedValue(s.id)}. Trocar`}>
                    {mark}
                  </button>
                ) : (
                  <span className="flex min-h-11 items-center gap-1.5 px-1">
                    {mark}
                    <span className="sr-only">{here ? " (etapa atual)" : ""}</span>
                  </span>
                )}
              </li>
            );
          })}
        </ol>
        <div className="flex min-w-0 flex-1 justify-end">
          <button type="button" onClick={close} className="-mr-2 inline-flex min-h-11 min-w-11 items-center justify-center gap-2 px-2 font-semibold" aria-label="Fechar">
            <span aria-hidden="true" className="hidden sm:inline">Fechar</span>
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M5 5l14 14M19 5L5 19" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );

  // The question and its field keep a reading width (an inner box: `.wrap` sets its own max-width and would win over a utility next to it).
  const cityStep = (
    <section className="journey-in wrap pb-14 pt-8 sm:pt-14 lg:pt-20" data-step="city">
      <div className="max-w-3xl">
        <h2 ref={heading} tabIndex={-1} className="font-display text-[clamp(2.75rem,10vw,5.5rem)] font-extrabold uppercase leading-[0.98] tracking-[0.004em]">
          Qual é a sua <span className={ACCENT}>cidade?</span>
        </h2>
        {/* Out of the way while typing: on a phone the keyboard takes half the screen, and the results need the rest. */}
        {!typing && <p className="t-body mt-4 max-w-xl text-ink-soft">Escolha a cidade e veja os modelos dela lado a lado. Depois, é só escolher a peça.</p>}
        <div className="mt-7 sm:mt-9">
          <GlobalSearch
            region={region}
            autoFocus
            boxed
            compact
            placesOnly
            fieldLabel={withRegions ? "Digite sua cidade ou região" : "Digite o nome da sua cidade"}
            source={SOURCES.suaCidade}
            onPick={pickResult}
            onState={openState}
            onNavigate={close}
            onQueryChange={(q) => setTyping(q.trim().length > 0)}
          />
        </div>
        {picks.length > 0 && !typing && (
          <div className="mt-8" data-testid="journey-picks">
            <p className="t-label text-ink-mute">Em destaque</p>
            <ul className="mt-3 flex flex-wrap gap-2">
              {picks.map((pick) => (
                <li key={`${pick.uf}/${pick.slug}`}>
                  <button type="button" onClick={() => pickPlace(pick)} className="chip">
                    {pick.name}
                    <span className="text-[0.8125rem] font-normal opacity-70">{pick.uf}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );

  const skeleton = (
    <>
      <ul aria-hidden="true" className="mt-6 grid grid-cols-2 gap-3 sm:mt-8 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:mt-0">
        {Array.from({ length: 8 }, (_, i) => (
          <li key={i} className="overflow-hidden rounded-lg border border-black/10">
            <span className="block aspect-[800/820] animate-pulse bg-black/[0.06]" />
            <span className="block p-3 md:p-4">
              <span className="block h-4 w-2/3 animate-pulse bg-black/[0.06]" />
              <span className="mt-3 block h-4 w-1/3 animate-pulse bg-black/[0.06]" />
            </span>
          </li>
        ))}
      </ul>
      <p role="status" className="sr-only">
        Carregando os modelos de {place?.name}…
      </p>
    </>
  );

  // From the widest layout the place stands on the left and its designs fill the right, two rows of four: all of them on one screen.
  const modelStep = place && (
    <section className="journey-in wrap pb-14 pt-6 sm:pt-10 xl:grid xl:grid-cols-[22rem_minmax(0,1fr)] xl:items-start xl:gap-12" data-step="model">
      <div className="xl:sticky xl:top-10">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 xl:block">
          <div className="min-w-0">
            <h2 ref={heading} tabIndex={-1} className="font-display text-[clamp(2.5rem,8vw,4.75rem)] font-extrabold uppercase leading-[0.98] tracking-[0.004em] [hyphens:auto] xl:text-[3.25rem]">
              {place.name}
            </h2>
            <p className="t-place mt-2 text-ink-soft">{data?.place.subtitle ?? STATE_NAMES[place.uf] ?? place.uf}</p>
          </div>
          <button type="button" onClick={() => goTo("city")} className="link-static inline-flex min-h-11 items-center font-semibold xl:mt-2">
            Trocar cidade
          </button>
        </div>
        {loaded.status === "ok" && models.length > 0 && (
          <p className="mt-6 text-[1.125rem] font-bold sm:mt-8" data-testid="journey-models-title">
            Escolha o modelo <span className="font-normal text-ink-mute">· {models.length === 1 ? "1 modelo" : `${models.length} modelos`}</span>
          </p>
        )}
        {models.length > 0 && placeLink("mt-4 hidden xl:block")}
      </div>

      <div className="min-w-0">
        {loaded.status === "loading" && skeleton}
        {loaded.status === "error" && (
          <div role="alert" className="mt-8 xl:mt-0">
            <p className="font-semibold">Não conseguimos carregar os modelos agora.</p>
            <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3">
              <button type="button" onClick={retry} className="btn btn-ghost">
                Tentar de novo
              </button>
              <Link href={placePage} onClick={close} className="link-static inline-flex min-h-11 items-center font-semibold">
                Abrir a página de {place.name}
              </Link>
            </div>
          </div>
        )}
        {loaded.status === "ok" && models.length === 0 && (
          <div className="mt-8 xl:mt-0">
            <p className="font-semibold">Ainda não temos camisetas de {place.name}.</p>
            <p className="t-small mt-1 text-ink-soft">Volte em breve ou escolha outra cidade.</p>
            <button type="button" onClick={() => goTo("city")} className="btn btn-ghost mt-5">
              Escolher outra cidade
            </button>
          </div>
        )}
        {loaded.status === "ok" && data && models.length > 0 && (
          <>
            <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:mt-0" data-testid="journey-models">
              {models.map((m, i) => (
                <li key={m.familyId} className="journey-in" style={{ animationDelay: `${Math.min(i, 7) * 45}ms` }}>
                  <button type="button" onClick={() => chooseModel(m, i + 1)} className={`${cardFrame(false)} photo-hover w-full text-left`} data-model={m.familyId}>
                    <span className="photo photo-contain">
                      <Image src={m.pieces[0].image} alt="" fill sizes={CARD_SIZES} quality={80} loading={i < 4 ? "eager" : undefined} />
                    </span>
                    <span className={CARD_INFO}>
                      <span className={`${CARD_NAME} font-semibold`}>{m.name}</span>
                      <span className="t-caption mt-1 hidden max-w-[30ch] sm:block">{m.description}</span>
                      <span className={CARD_FOOT}>
                        <span className={`${CARD_PRICE} block`}>{price(m.pieces[0])}</span>
                        {m.pieces.length > 1 && <span className="t-caption mt-0.5 block">em {m.pieces.length} peças</span>}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {placeLink("mt-8 xl:hidden")}
          </>
        )}
      </div>
    </section>
  );

  // Phones: the design's name, its photo and the row of pieces right under it, all above the purchase bar. Desktop: the photo on the left (as tall
  // as the space between the bars), the name and the grid of pieces on the right; the purchase bar stays at the bottom at every width.
  const pieceStep = data && model && piece && (
    <section className="journey-in wrap pb-8 pt-3 sm:pt-6 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:grid-rows-[auto_1fr] lg:items-start lg:gap-x-12 lg:pt-8" data-step="piece">
      <div className="lg:col-start-2 lg:row-start-1 lg:pt-4">
        <h2 ref={heading} tabIndex={-1} className="text-[clamp(1.5rem,4vw,2.75rem)] font-extrabold leading-[1.05] tracking-tight">
          {model.name}
        </h2>
        <p className="t-place mt-1 text-ink-soft">
          {data.place.name} · {data.place.uf}
        </p>
        <p className="t-small mt-2 hidden text-ink-soft lg:block">{model.description}</p>
      </div>
      <Stage key={model.familyId} pieces={model.pieces} visited={visited} selected={piece.slug} alt={`${piece.label}, estampa ${model.name}, ${data.place.name}`} className="mt-2 sm:mt-3 lg:col-start-1 lg:row-span-2 lg:row-start-1 lg:mt-0" />
      <div className="mt-3 min-w-0 sm:mt-4 lg:col-start-2 lg:row-start-2 lg:mt-6">
        {model.pieces.length > 1 ? (
          // `min-w-0`: a fieldset is as wide as its content by default, and the row of pieces would then push the whole screen sideways.
          <fieldset className="min-w-0">
            {/* On phones the purchase bar already names the piece chosen: the question keeps to one line. */}
            <legend className="text-[1.0625rem] font-bold">
              Quer em outra peça? <span className="hidden font-normal text-ink-mute sm:inline">· {piece.label}</span>
            </legend>
            {/* One row that scrolls sideways on phones; a grid from the desktop layout up. */}
            <ul className="no-scrollbar -mx-[var(--gutter)] mt-2 flex gap-2 overflow-x-auto px-[var(--gutter)] pb-1 lg:mx-0 lg:mt-3 lg:grid lg:grid-cols-4 lg:overflow-visible lg:px-0 xl:grid-cols-5" data-testid="journey-pieces">
              {model.pieces.map((p) => (
                <li key={p.slug} className="w-[5.25rem] shrink-0 lg:w-auto">
                  <button
                    type="button"
                    aria-pressed={p.slug === piece.slug}
                    onClick={() => choosePiece(p)}
                    className="group relative flex h-full w-full flex-col overflow-hidden rounded-md border-2 border-black/15 bg-[var(--card-fill)] text-left transition-colors hover:border-black/40 aria-pressed:border-region-primary"
                    data-piece={p.slug}
                  >
                    <span className="photo photo-contain">
                      <Image src={p.image} alt="" fill sizes="96px" quality={70} />
                    </span>
                    {p.slug === piece.slug && (
                      <span aria-hidden="true" className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center bg-region-primary text-white">
                        <CheckIcon className="h-3.5 w-3.5" />
                      </span>
                    )}
                    <span className="flex grow flex-col px-1.5 pb-1.5 pt-1">
                      <span className="line-clamp-2 text-[0.8125rem] font-semibold leading-tight">{p.label}</span>
                      <span className="mt-auto pt-0.5 text-[0.75rem] tabular-nums text-ink-mute">{formatPrice(p.price)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </fieldset>
        ) : (
          <p className="t-small text-ink-soft">Este modelo está disponível em {piece.label.toLowerCase()}.</p>
        )}
        <p className="t-small mt-4 text-ink-soft lg:hidden">{model.description}</p>
        <div className="mt-4 flex flex-col items-start gap-1 lg:mt-6">
          {model.versions > 0 && (
            <Link href={model.page} onClick={close} className="link-static inline-flex min-h-11 items-center font-semibold">
              {model.versions === 1 ? "Ver mais 1 versão deste modelo" : `Ver mais ${model.versions} versões deste modelo`}
            </Link>
          )}
          <button type="button" onClick={() => goTo("model")} className="link-static inline-flex min-h-11 items-center font-semibold">
            Ver os outros modelos de {data.place.name}
          </button>
        </div>
      </div>
    </section>
  );

  // The end of the journey, at every width: what was chosen, its price, what is left to choose in the store, and the one button that goes there.
  const buyBar = data && model && piece && (
    <div className="journey-buy shrink-0 border-t border-line bg-ground px-[var(--gutter)] pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3" data-testid="journey-buy-bar">
      <div className="mx-auto flex max-w-[90rem] items-center gap-3 sm:gap-6">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[0.8125rem] font-semibold leading-tight text-ink-soft">
            <span className="hidden sm:inline">
              {data.place.name} · {model.name} ·{" "}
            </span>
            {piece.label}
          </p>
          <p className="text-[1.125rem] font-extrabold tabular-nums leading-tight sm:text-[1.25rem]" aria-live="polite" data-testid="journey-price">
            {price(piece)}
          </p>
        </div>
        <p className="t-caption hidden max-w-[17rem] lg:block">Cor, tamanho e frete você escolhe {finishIn}.</p>
        <a href={piece.href} onClick={goToStore} className="btn shrink-0" data-testid="journey-cta">
          {/* The narrowest phones keep the price in full: the short word there, the whole sentence from the tablet up. */}
          <span className="min-[360px]:hidden">Comprar</span>
          <span className="hidden min-[360px]:inline sm:hidden">Escolher tamanho</span>
          <span className="hidden sm:inline">Escolher tamanho na loja</span>
          <ArrowIcon className="h-4 w-4 shrink-0" />
        </a>
      </div>
      {/* Under the row up to the tablet (one line on the narrowest phone); beside the button, with the store's own name, on the desktop layout. */}
      <p className="t-caption mt-1.5 lg:hidden">Cor, tamanho e frete você escolhe na loja.</p>
    </div>
  );

  return (
    <dialog ref={dialog} aria-label="Sua cidade" className="city-journey m-0 h-dvh max-h-none w-full max-w-none bg-ground p-0 text-ink backdrop:bg-black/60" data-testid="sua-cidade">
      {open && (
        <div className="flex h-full flex-col">
          {bar}
          <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {step === "city" && (stateUf ? <StatePlaces region={region} uf={stateUf} heading={heading} onPick={pickPlace} /> : cityStep)}
            {step === "model" && modelStep}
            {step === "piece" && pieceStep}
          </div>
          {step === "piece" && buyBar}
        </div>
      )}
    </dialog>
  );
}
