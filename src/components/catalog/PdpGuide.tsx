"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { SheetDialog } from "@/components/layout/SheetDialog";
import { GlobalSearch } from "@/components/search/GlobalSearch";
import { SOURCES } from "@/lib/analytics/sources";
import { trackGoToInk, trackGuide, type GuideParams } from "@/lib/analytics/track";
import { formatPrice } from "@/lib/format";
import { REGIONS, STATE_NAMES, type RegionSlug } from "@/lib/geo/regions";
import { GUIDE_DISMISS_KEY, guideCityQuery, guideDismissed, guideDismissValue } from "@/lib/guide/dismiss";
import type { GuideCity, GuideCollection, GuideItem } from "@/lib/guide/pdp-guide";
import type { GlobalResult } from "@/lib/search/global";
import { PriceText } from "./PriceText";

/**
 * The guided help on a design page: "Procurando sua cidade ou outra estampa?" — a compact invite under the purchase block (never above the
 * price, the versions or the CTA), which opens a sheet (a bottom sheet on phones, a dialog from `sm`) only on a tap. Two paths, two steps
 * each: a city (the site's own search, places only, aliases included → up to three real designs of that place + its page) or a collection
 * (the region's published menu → a few real products + the collection page). "Mais estampas de <cidade>" goes to the designs this page
 * already lists. A product opens its INK page and ends the guide. Data comes from `/api/guia/<region>` (snapshots + published config; never INK
 * at request time); the invite can be dismissed, remembered 30 days in this browser (src/lib/guide/dismiss.ts), and reopened by one line.
 *
 * Nothing here is needed to buy: without storage, without the API or without JavaScript the page keeps its photo, price, versions and CTA.
 */
export type PdpGuideProps = {
  region: RegionSlug;
  /** The place this page is about. */
  city: { name: string; uf: string; slug: string };
  /** The INK product the page opens on (its slug is the `product_slug` of every event; its id is never offered as a result). */
  productId: string;
  productSlug: string | null;
  /** The collections the guide offers, computed on the server from the region's published menu (`guideCollections`). */
  collections: GuideCollection[];
  /** The page lists other designs of this city ("Outros estilos de …", `#other-title`): "Mais estampas de <cidade>" scrolls there. */
  othersAnchor: string | null;
};

type CityResults = { city: GuideCity; items: GuideItem[]; total: number };
type CollectionResults = { collection: GuideCollection; items: GuideItem[]; total: number };
type Fetched<T> = { status: "loading" } | { status: "error" } | { status: "ok"; data: T | null };
type Step = { kind: "menu" } | { kind: "city" } | { kind: "city-results"; label: string; query: string; data: Fetched<CityResults> } | { kind: "collections" } | { kind: "collection-results"; collection: GuideCollection; data: Fetched<CollectionResults> };

const INVITE_TITLE = "Procurando sua cidade ou outra estampa?";

// The dismissal as an external store (the browser's storage): read after hydration (the server renders neither invite nor reopen line, so
// nothing flashes), written on ✕. Blocked storage (a private window) reads as "not dismissed" and the ✕ then hides the invite for this view only.
const listeners = new Set<() => void>();
const subscribeDismissed = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
let sessionDismissed = false;
function readDismissed(): boolean {
  if (sessionDismissed) return true;
  try {
    return guideDismissed(window.localStorage.getItem(GUIDE_DISMISS_KEY), Date.now());
  } catch {
    return false;
  }
}
function writeDismissed(): void {
  sessionDismissed = true;
  try {
    window.localStorage.setItem(GUIDE_DISMISS_KEY, guideDismissValue(Date.now()));
  } catch {
    // Storage blocked: the invite hides for this page view only.
  }
  listeners.forEach((listener) => listener());
}

/** A clipped item picture that never shows a broken-image icon: a missing or failing picture leaves the grey tile. */
function ItemPhoto({ src, alt }: { src: string; alt: string }) {
  const [broken, setBroken] = useState(false);
  return (
    <span className="photo photo-contain block" aria-hidden={alt === ""}>
      {src && !broken && <Image src={src} alt={alt} fill sizes="(min-width: 640px) 200px, 45vw" quality={75} onError={() => setBroken(true)} />}
    </span>
  );
}

const Button = ({ children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
  <button type="button" {...rest} className={`inline-flex min-h-11 items-center justify-center border-2 border-ink bg-white px-4 text-[0.9375rem] font-semibold text-ink transition-colors hover:border-region-primary hover:bg-paper ${rest.className ?? ""}`}>
    {children}
  </button>
);

export function PdpGuide({ region, city, productId, productSlug, collections, othersAnchor }: PdpGuideProps) {
  const uid = useId();
  const titleId = `${uid}-title`;
  const dismissed = useSyncExternalStore(subscribeDismissed, readDismissed, () => null); // null on the server and until hydration
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>({ kind: "menu" });
  const [history, setHistory] = useState<Step[]>([]);
  const inviteRef = useRef<HTMLElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const track = (event: Parameters<typeof trackGuide>[0], params: GuideParams = {}) => trackGuide(event, { ...params, region, productSlug });

  // Seen: the invite at least half visible, once per page.
  useEffect(() => {
    const el = inviteRef.current;
    if (!el || dismissed !== false || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        track("origens_guide_view");
        observer.disconnect();
      },
      { threshold: 0.5 },
    );
    observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once the invite exists
  }, [dismissed]);

  useEffect(() => () => requestRef.current?.abort(), []);

  const go = (next: Step, push = true) => {
    setHistory((h) => (push ? [...h, step] : h));
    setStep(next);
  };
  const back = () => {
    requestRef.current?.abort();
    const previous = history[history.length - 1];
    if (!previous) return close();
    setHistory((h) => h.slice(0, -1));
    setStep(previous);
  };
  const openAt = (first: Step, path: NonNullable<GuideParams["guide_path"]>, opener: HTMLElement | null) => {
    openerRef.current = opener;
    setHistory(first.kind === "menu" ? [] : [{ kind: "menu" }]);
    setStep(first);
    setOpen(true);
    track("origens_guide_open", { guide_path: path });
  };
  const close = () => {
    requestRef.current?.abort();
    setOpen(false);
  };
  const dismiss = () => {
    writeDismissed();
    track("origens_guide_dismiss");
  };
  const moreOfCity = () => {
    track("origens_guide_open", { guide_path: "city_context" });
    const target = othersAnchor ? document.getElementById(othersAnchor) : null;
    if (!target) return;
    target.scrollIntoView({ behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    target.setAttribute("tabindex", "-1");
    target.focus({ preventScroll: true });
  };

  const load = <T,>(query: string, onStep: (data: Fetched<T>) => Step, stepName: string, path: "city" | "prints") => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    fetch(`/api/guia/${region}?${query}`, { signal: controller.signal })
      .then(async (res) => {
        if (res.status === 404) return null; // unknown place or collection: an empty result, with its exits
        if (!res.ok) throw new Error(`guide ${res.status}`);
        return (await res.json()) as T;
      })
      .then(
        (data) => {
          if (controller.signal.aborted) return;
          setStep(onStep({ status: "ok", data }));
          const count = data && typeof data === "object" && "items" in data && Array.isArray((data as { items?: unknown }).items) ? (data as { items: unknown[] }).items.length : 0;
          track("origens_guide_results", { guide_path: path, result_count: count, has_results: count > 0 });
        },
        () => {
          if (controller.signal.aborted) return;
          setStep(onStep({ status: "error" }));
          track("origens_guide_error", { guide_step: stepName });
        },
      );
  };

  const pickPlace = (result: GlobalResult): boolean => {
    const query = result.kind === "locality" && result.region === region ? guideCityQuery(result.href, region) : null;
    if (!query) {
      close(); // a state, a design or a place of another region: its own page, as the search always does
      return false;
    }
    const [uf, slug] = query.split("/");
    track("origens_guide_city_select", { city_slug: slug, uf: uf.toUpperCase() });
    const label = result.uf ? `${result.title} · ${result.uf}` : result.title;
    const q = `cidade=${query}&produto=${productId}`;
    go({ kind: "city-results", label, query: q, data: { status: "loading" } });
    load<CityResults>(q, (data) => ({ kind: "city-results", label, query: q, data }), "city_results", "city");
    return true;
  };
  const pickCollection = (collection: GuideCollection, push = true) => {
    const q = `colecao=${encodeURIComponent(collection.slug)}`;
    go({ kind: "collection-results", collection, data: { status: "loading" } }, push);
    load<CollectionResults>(q, (data) => ({ kind: "collection-results", collection, data }), "collection_results", "prints");
  };
  const retry = () => {
    if (step.kind === "city-results") {
      setStep({ ...step, data: { status: "loading" } });
      load<CityResults>(step.query, (data) => ({ ...step, data }), "city_results", "city");
    }
    if (step.kind === "collection-results") pickCollection(step.collection, false);
  };

  const productClick = (item: GuideItem, position: number, path: "city" | "prints") => {
    track("origens_guide_product_click", { guide_path: path, position, target_product_id: item.productId });
    trackGoToInk({ productId: item.productId, sourceSection: path === "city" ? SOURCES.pdpGuideCity : SOURCES.pdpGuideCollection, productName: item.title, value: item.price, destinationUrl: item.href, ...(item.context ? { city: item.context.split(" · ")[0], state: item.context.split(" · ")[1] } : {}) });
  };
  /** A storefront absolute URL (the API returns `SITE_URL`-based links) as a path of this site. */
  const pathOf = (url: string) => {
    try {
      return new URL(url).pathname;
    } catch {
      return url;
    }
  };

  const items = (list: GuideItem[], path: "city" | "prints") => (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4" data-pdp-guide="results">
      {list.map((item, i) => (
        <li key={item.productId}>
          <a
            href={item.href}
            onClick={() => productClick(item, i + 1, path)}
            className="group relative flex h-full flex-col overflow-hidden rounded-lg border border-black/15 bg-[var(--ground)] transition-colors hover:border-black/35"
            aria-label={`${item.title}${item.context ? `, ${item.context}` : ""}, ${formatPrice(item.price)}: escolher tamanho na loja`}
          >
            <ItemPhoto src={item.image} alt="" />
            <span className="flex grow flex-col p-3">
              <span className="line-clamp-2 text-[0.9375rem] font-medium leading-[1.3]">{item.title}</span>
              {item.context && <span className="t-caption mt-0.5">{item.context}</span>}
              <span className="mt-auto pt-1 text-base font-semibold leading-tight tabular-nums">
                <PriceText price={formatPrice(item.price) ?? ""} listPrice={item.listPrice ? formatPrice(item.listPrice) : undefined} />
              </span>
            </span>
          </a>
        </li>
      ))}
    </ul>
  );

  const header = (title: string, withBack: boolean) => (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-2">
        {withBack && (
          <button type="button" onClick={back} className="-ml-2 inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center" aria-label="Voltar">
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 5l-7 7 7 7" />
            </svg>
          </button>
        )}
        <h2 id={titleId} className="min-w-0 pt-2 text-[1.25rem] font-extrabold leading-tight tracking-tight sm:text-[1.5rem]">
          {title}
        </h2>
      </div>
      <button type="button" onClick={close} className="-mr-2 inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-2 px-2 font-semibold">
        <span className="sr-only sm:not-sr-only">Fechar</span>
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
          <path d="M5 5l14 14M19 5L5 19" />
        </svg>
      </button>
    </div>
  );

  const pending = <p className="t-caption py-6">Carregando…</p>;
  const failed = (
    <p className="py-4 text-[0.9375rem]">
      Não conseguimos carregar agora.{" "}
      <button type="button" onClick={retry} className="link-static min-h-11 font-semibold">
        Tentar de novo
      </button>
    </p>
  );

  const content = () => {
    switch (step.kind) {
      case "menu":
        return (
          <>
            {header(INVITE_TITLE, false)}
            <div className="flex flex-col gap-3">
              <Button onClick={() => go({ kind: "city" })}>Buscar uma cidade</Button>
              {collections.length > 0 && <Button onClick={() => go({ kind: "collections" })}>Ver outras estampas</Button>}
              {othersAnchor && (
                <Button
                  onClick={() => {
                    close();
                    moreOfCity();
                  }}
                >
                  Mais estampas de {city.name}
                </Button>
              )}
            </div>
          </>
        );
      case "city":
        return (
          <>
            {header("Buscar uma cidade", true)}
            <div className="px-1">
              <GlobalSearch region={region} autoFocus sticky placesOnly source={SOURCES.pdpGuideCity} onPick={pickPlace} onNavigate={close} />
            </div>
          </>
        );
      case "city-results": {
        const { data } = step;
        const found = data.status === "ok" ? data.data : null;
        const title = found ? `Estampas de ${found.city.name}` : step.label;
        return (
          <>
            {header(title, true)}
            {data.status === "loading" && pending}
            {data.status === "error" && failed}
            {data.status === "ok" && found && found.items.length > 0 && (
              <>
                {items(found.items, "city")}
                <p className="mt-5">
                  <Link href={pathOf(found.city.url)} onClick={close} className="link-static inline-flex min-h-11 items-center font-semibold">
                    Ver todas as estampas de {found.city.name}
                    {found.total > found.items.length ? ` (${found.total})` : ""} →
                  </Link>
                </p>
              </>
            )}
            {data.status === "ok" && (!found || found.items.length === 0) && (
              <div>
                <p className="font-semibold">Ainda não temos estampas de {found ? found.city.name : step.label.split(" · ")[0]}.</p>
                <p className="t-caption mt-1">Veja as cidades do estado ou busque outra cidade.</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {(found ? [found.city.uf] : REGIONS[region].ufs).map((uf) => (
                    <Link key={uf} href={`/${region}/${uf.toLowerCase()}`} onClick={close} className="inline-flex min-h-11 items-center border-2 border-ink px-4 text-[0.9375rem] font-semibold transition-colors hover:bg-ink hover:text-white">
                      {STATE_NAMES[uf]}
                    </Link>
                  ))}
                  <Button onClick={back}>Buscar outra cidade</Button>
                </div>
              </div>
            )}
          </>
        );
      }
      case "collections":
        return (
          <>
            {header("Ver outras estampas", true)}
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4" data-pdp-guide="collections">
              {collections.map((collection) => (
                <li key={collection.id}>
                  <button type="button" onClick={() => pickCollection(collection)} className="group flex h-full w-full flex-col overflow-hidden rounded-lg border border-black/15 bg-[var(--ground)] text-left transition-colors hover:border-black/35">
                    <ItemPhoto src={collection.image ?? ""} alt="" />
                    <span className="flex grow flex-col p-3">
                      <span className="line-clamp-2 text-[0.9375rem] font-semibold leading-[1.3]">{collection.name}</span>
                      <span className="t-caption mt-0.5">{collection.total === 1 ? "1 produto" : `${collection.total} produtos`}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        );
      case "collection-results": {
        const { data, collection } = step;
        const found = data.status === "ok" ? data.data : null;
        return (
          <>
            {header(collection.name, true)}
            {data.status === "loading" && pending}
            {data.status === "error" && failed}
            {data.status === "ok" && found && found.items.length > 0 && (
              <>
                {items(found.items, "prints")}
                <p className="mt-5">
                  <Link href={pathOf(found.collection.url)} onClick={close} className="link-static inline-flex min-h-11 items-center font-semibold">
                    Ver a coleção completa{found.total > found.items.length ? ` (${found.total})` : ""} →
                  </Link>
                </p>
              </>
            )}
            {data.status === "ok" && (!found || found.items.length === 0) && (
              <div>
                <p className="font-semibold">Esta coleção está sem produtos no momento.</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button onClick={back}>Ver outras coleções</Button>
                  <Link href={pathOf(collection.url)} onClick={close} className="link-static inline-flex min-h-11 items-center font-semibold">
                    Abrir a página da coleção →
                  </Link>
                </div>
              </div>
            )}
          </>
        );
      }
    }
  };

  return (
    <>
      {dismissed === false && (
        <section ref={inviteRef} aria-label={INVITE_TITLE} data-pdp-guide="invite" className="relative mt-1 border-t border-line pt-5 lg:mt-7">
          <p className="pr-10 text-[1.0625rem] font-bold leading-snug tracking-tight">{INVITE_TITLE}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={(e) => openAt({ kind: "city" }, "city", e.currentTarget)}>Buscar uma cidade</Button>
            {collections.length > 0 && <Button onClick={(e) => openAt({ kind: "collections" }, "prints", e.currentTarget)}>Ver outras estampas</Button>}
            {othersAnchor && <Button onClick={moreOfCity}>Mais estampas de {city.name}</Button>}
          </div>
          <button type="button" onClick={dismiss} className="absolute right-0 top-3 inline-flex min-h-11 min-w-11 items-center justify-center text-ink-mute hover:text-ink" aria-label="Dispensar esta ajuda">
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M5 5l14 14M19 5L5 19" />
            </svg>
          </button>
        </section>
      )}
      {dismissed === true && (
        <p data-pdp-guide="reopen" className="t-caption mt-5">
          <button type="button" onClick={(e) => openAt({ kind: "menu" }, "reopen", e.currentTarget)} className="link-static min-h-11 font-semibold text-ink">
            Procurando sua cidade ou outra estampa?
          </button>
        </p>
      )}
      <SheetDialog open={open} onClose={() => setOpen(false)} labelledBy={titleId} returnFocus={openerRef} wide>
        <div data-pdp-guide="panel">{content()}</div>
      </SheetDialog>
    </>
  );
}
