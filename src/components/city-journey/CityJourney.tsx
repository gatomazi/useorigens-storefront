"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { PriceText } from "@/components/catalog/PriceText";
import { CARD_FOOT, CARD_INFO, CARD_NAME, CARD_PRICE, cardFrame } from "@/components/catalog/ProductCard";
import { GlobalSearch } from "@/components/search/GlobalSearch";
import { SOURCES } from "@/lib/analytics/sources";
import { trackCityJourney, trackGoToInk, trackSelectCity, type CityJourneyParams } from "@/lib/analytics/track";
import type { CityJourneyData, JourneyModel, JourneyPick, JourneyPiece } from "@/lib/catalog/city-journey";
import { CLASSIC_GARMENT_TYPE_ID } from "@/lib/catalog/garments";
import { formatPrice } from "@/lib/format";
import { allAdministrativeRegions } from "@/lib/geo/administrative-regions";
import type { RegionSlug } from "@/lib/geo/regions";
import { guideCityQuery } from "@/lib/guide/dismiss";
import type { GlobalResult } from "@/lib/search/global";

/**
 * "Sua cidade", the first word of the header's menu: a journey on ONE screen, never a page change — the place (the store's own search, places
 * only, or a shortcut), then its designs side by side like products, then the piece (the classic tee or another garment type of the same
 * design), and the button that opens that exact product in the store. A full-screen native <dialog> (focus trap, Escape and the inert page come
 * from the platform), drawn in the header's colours on top and the page's ground below, at every width.
 *
 * Data: one request per place (`/api/cidades/<region>/<uf>/<slug>`, src/lib/catalog/city-journey.ts), kept for the visit, so going back and
 * forth costs nothing. A place of another region or a state found by the search opens its own page, as the search always does: the store view
 * of a purchase follows the region being browsed (CampaignCarry), so a design of another region is never sold from here.
 *
 * Measured with the store's usual events (Search / SelectCity / GoToInk, source `sua_cidade`) and, in between, `origens_sua_cidade_*` (GA4).
 * The button to the store is a plain link: the campaign and the region go along on the click (CampaignCarry), the same tab, like every card.
 */
type Step = "city" | "model" | "piece";
type Loaded = { status: "loading" } | { status: "error" } | { status: "ok"; data: CityJourneyData | null };

const STEPS: readonly { id: Step; label: string }[] = [
  { id: "city", label: "Cidade" },
  { id: "model", label: "Modelo" },
  { id: "piece", label: "Peça" },
];
const stepIndex = (step: Step) => STEPS.findIndex((s) => s.id === step);

// The places already asked for in this visit (both triggers share them). A failure is never remembered: "Tentar de novo" asks again.
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

/**
 * The big photo of the chosen design in the chosen piece. Every piece seen keeps its picture mounted, so going back to one is instant; a piece
 * whose picture is still on its way keeps the last one on screen until it arrives (a cross-fade, never an empty frame).
 */
function Stage({ pieces, visited, selected, alt }: { pieces: JourneyPiece[]; visited: string[]; selected: string; alt: string }) {
  const [ready, setReady] = useState<string[]>([]);
  const shown = ready.includes(selected) ? selected : (ready.at(-1) ?? selected);
  return (
    <div className="relative aspect-[800/820] overflow-hidden rounded-lg bg-ground" data-testid="journey-stage">
      {pieces
        .filter((p) => visited.includes(p.slug))
        .map((p) => (
          <Image
            key={p.slug}
            src={p.image}
            alt={p.slug === shown ? alt : ""}
            aria-hidden={p.slug === shown ? undefined : true}
            fill
            sizes="(min-width: 1024px) 46vw, 100vw"
            quality={80}
            loading="eager"
            onLoad={() => setReady((list) => (list.includes(p.slug) ? list : [...list, p.slug]))}
            className="object-contain"
            style={{ opacity: p.slug === shown ? 1 : 0, transition: "opacity 320ms var(--ease-out)" }}
          />
        ))}
      {!ready.includes(selected) && (
        <span aria-hidden="true" className="absolute bottom-3 left-1/2 h-1 w-16 -translate-x-1/2 overflow-hidden rounded-full bg-black/10">
          <span className="block h-full w-1/2 animate-pulse bg-black/30" />
        </span>
      )}
    </div>
  );
}

export function CityJourney({ region, variant, picks = [], finishIn }: {
  region: RegionSlug;
  /** `nav`: the word in the desktop header's menu. `field`: the box under "Sua cidade" in the phone menu. */
  variant: "nav" | "field";
  /** Shortcuts under the field (src/lib/catalog/city-journey.ts `journeyPicks`). */
  picks?: JourneyPick[];
  /** Where the purchase ends ("na nossa loja online"): said under the button. */
  finishIn: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const ticket = useRef(0);
  const pageOverflow = useRef("");
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("city");
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
  const entryPoint = variant === "nav" ? "header" : "menu";
  const withRegions = allAdministrativeRegions().some((r) => r.regionSlug === region);
  const track = (event: Parameters<typeof trackCityJourney>[0], extra: CityJourneyParams = {}) =>
    trackCityJourney(event, { region, entry_point: entryPoint, ...(place ? { city_slug: place.slug, uf: place.uf } : {}), ...extra });

  // A native listener, not JSX `onClose`: a close done by the platform (Escape) must always reach the state, or the next tap would not reopen it.
  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    const onClose = () => {
      setOpen(false);
      document.documentElement.style.overflow = pageOverflow.current;
      trigger.current?.focus({ preventScroll: true });
    };
    node.addEventListener("close", onClose);
    return () => node.removeEventListener("close", onClose);
  }, []);

  // Each step starts at its top, read from its title (the city step's field takes the focus itself, to type at once).
  useEffect(() => {
    if (!open) return;
    scroller.current?.scrollTo({ top: 0 });
    if (step !== "city") heading.current?.focus({ preventScroll: true });
  }, [open, step]);

  // The city step always comes back with an empty field, so its words and shortcuts come back with it.
  const goTo = (next: Step) => {
    if (next === "city") setTyping(false);
    setStep(next);
  };
  const openJourney = () => {
    // A place already chosen in this visit opens on its designs: closing was not giving up on it. "Trocar cidade" is right there.
    goTo(place && loaded.status === "ok" && models.length > 0 ? "model" : "city");
    setOpen(true);
    pageOverflow.current = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    dialog.current?.showModal();
    track("origens_sua_cidade_open");
  };
  const close = () => dialog.current?.close();

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
        trackCityJourney("origens_sua_cidade_error", { region, entry_point: entryPoint, city_slug: next.slug, uf: next.uf });
      },
    );
  };
  // A place of this region chosen in the search stays here; a state or a place of another region opens its own page (`onNavigate` closes this).
  const pickResult = (result: GlobalResult): boolean => {
    const query = result.kind === "locality" && result.region === region ? guideCityQuery(result.href, region) : null;
    if (!query) return false;
    const [uf, slug] = query.split("/");
    choosePlace({ name: result.title, uf: uf.toUpperCase(), slug });
    return true;
  };
  const pickShortcut = (pick: JourneyPick) => {
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
          {step === "city" ? (
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
                <span aria-hidden="true" className={`flex h-6 w-6 shrink-0 items-center justify-center border-2 text-[0.75rem] font-bold leading-none ${here ? "border-current bg-[var(--nav-header-text,#fff)] text-[var(--nav-header-bg,var(--region-primary))]" : done ? "border-current" : "border-current/40 opacity-60"}`}>
                  {done ? "✓" : i + 1}
                </span>
                <span className={`max-w-[9rem] truncate text-[0.8125rem] font-semibold ${here ? "" : "hidden lg:inline"} ${!here && !done ? "opacity-60" : ""}`}>{done ? reachedValue(s.id) : s.label}</span>
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

  const cityStep = (
    <section className="journey-in wrap max-w-3xl pb-14 pt-8 sm:pt-14 lg:pt-20" data-step="city">
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
                <button type="button" onClick={() => pickShortcut(pick)} className="chip bg-white/60 hover:border-region-primary hover:bg-region-primary hover:text-white">
                  {pick.name}
                  <span className="text-[0.8125rem] font-normal opacity-70">{pick.uf}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
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
            <p className="t-place text-[1.0625rem] text-ink-soft sm:text-[1.25rem]">{data?.place.subtitle ?? place.uf}</p>
            <h2 ref={heading} tabIndex={-1} className="mt-1 font-display text-[clamp(2.5rem,8vw,4.75rem)] font-extrabold uppercase leading-[0.98] tracking-[0.004em] [hyphens:auto] xl:text-[3.25rem]">
              {place.name}
            </h2>
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
          <div className="mt-8 xl:mt-0">
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
                      <Image src={m.pieces[0].image} alt="" fill sizes="(min-width: 1280px) 17vw, (min-width: 1024px) 22vw, (min-width: 640px) 30vw, 46vw" quality={80} loading={i < 4 ? "eager" : undefined} />
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

  const pieceStep = data && model && piece && (
    <section className="journey-in wrap pb-10 pt-5 sm:pt-8 lg:pb-16" data-step="piece">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:items-start lg:gap-12">
        <Stage key={model.familyId} pieces={model.pieces} visited={visited} selected={piece.slug} alt={`${piece.label}, estampa ${model.name}, ${data.place.name}`} />
        <div className="min-w-0 lg:pt-4">
          <p className="t-place text-[1.0625rem] text-ink-soft sm:text-[1.25rem]">
            {data.place.name} · {data.place.uf}
          </p>
          <h2 ref={heading} tabIndex={-1} className="mt-1 text-[clamp(1.875rem,4vw,2.75rem)] font-extrabold leading-[1.05] tracking-tight">
            {model.name}
          </h2>
          <p className="t-small mt-2 text-ink-soft">{model.description}</p>
          {/* Phones and tablets read the price in the purchase bar at the bottom, never twice: the pieces get its room here. */}
          <p className="mt-3 hidden text-[1.75rem] font-extrabold tabular-nums leading-tight lg:block" aria-live="polite" data-testid="journey-price">
            <PriceText price={formatPrice(piece.price) ?? ""} listPrice={piece.listPrice ? formatPrice(piece.listPrice) : undefined} listClassName="mr-2 align-middle text-[0.6em] font-medium opacity-70" />
          </p>

          {model.pieces.length > 1 ? (
            // `min-w-0`: a fieldset is as wide as its content by default, and the row of pieces would then push the whole screen sideways.
            <fieldset className="mt-6 min-w-0">
              <legend className="text-[1.0625rem] font-bold">
                Quer em outra peça? <span className="font-normal text-ink-mute">· {piece.label}</span>
              </legend>
              {/* One row that scrolls sideways on phones (the button stays in view below); a grid from the desktop layout up. */}
              <ul className="no-scrollbar -mx-[var(--gutter)] mt-3 flex gap-2 overflow-x-auto px-[var(--gutter)] pb-1 lg:mx-0 lg:grid lg:grid-cols-4 lg:overflow-visible lg:px-0 xl:grid-cols-5" data-testid="journey-pieces">
                {model.pieces.map((p) => (
                  <li key={p.slug} className="w-[5.75rem] shrink-0 lg:w-auto">
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
                        <span aria-hidden="true" className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center bg-region-primary text-[0.6875rem] font-bold text-white">
                          ✓
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
            <p className="t-small mt-6 text-ink-soft">Este modelo está disponível em {piece.label.toLowerCase()}.</p>
          )}

          <div className="mt-7 hidden lg:block">
            <a href={piece.href} onClick={goToStore} className="btn w-full sm:w-auto sm:min-w-80" data-testid="journey-cta">
              Escolher tamanho na loja
              <ArrowIcon className="h-5 w-5" />
            </a>
            <p className="t-caption mt-3 max-w-sm">Tamanho, cor, frete e pagamento você define {finishIn}.</p>
          </div>
          <div className="mt-5 flex flex-col items-start gap-1 lg:mt-6">
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
      </div>
    </section>
  );

  return (
    <>
      {variant === "nav" ? (
        // A word in the header's menu: it opens the journey, so it is a button, drawn like the menu's links.
        <button ref={trigger} type="button" onClick={openJourney} aria-haspopup="dialog" className="inline-flex min-h-11 items-center whitespace-nowrap py-1 text-[0.9375rem] font-semibold" data-testid="header-sua-cidade">
          <span className="link-line">Sua cidade</span>
        </button>
      ) : (
        <button
          ref={trigger}
          type="button"
          onClick={openJourney}
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
      )}

      <dialog ref={dialog} aria-label="Sua cidade" className="city-journey m-0 h-dvh max-h-none w-full max-w-none bg-ground p-0 text-ink backdrop:bg-black/60" data-testid="sua-cidade">
        {open && (
          <div className="flex h-full flex-col">
            {bar}
            <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              {step === "city" && cityStep}
              {step === "model" && modelStep}
              {step === "piece" && pieceStep}
            </div>
            {/* Phones and tablets: the button to the store stays at the bottom of the screen while the pieces are chosen. */}
            {step === "piece" && model && piece && (
              <div className="shrink-0 border-t border-line bg-ground px-[var(--gutter)] pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 lg:hidden" data-testid="journey-buy-bar">
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[0.8125rem] font-semibold leading-tight text-ink-soft">{piece.label}</p>
                    <p className="text-[1.125rem] font-extrabold tabular-nums leading-tight" aria-live="polite">
                      {price(piece)}
                    </p>
                  </div>
                  <a href={piece.href} onClick={goToStore} className="btn shrink-0 gap-2 px-4 text-[0.8125rem] min-[400px]:px-5 min-[400px]:text-[0.875rem]" data-testid="journey-cta-bar">
                    {/* The narrowest phones keep the price in full: the short word there, the whole one from 360px. */}
                    <span className="min-[360px]:hidden">Comprar</span>
                    <span className="hidden min-[360px]:inline">Escolher tamanho</span>
                    <ArrowIcon className="h-4 w-4" />
                  </a>
                </div>
              </div>
            )}
          </div>
        )}
      </dialog>
    </>
  );
}
