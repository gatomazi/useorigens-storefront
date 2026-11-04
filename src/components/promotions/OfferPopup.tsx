"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { trackOfferPopup, type OfferPopupEvent } from "@/lib/analytics/track";
import { offerAmount, offerCards, offerFinePrint, type OfferTheme, type PublicOffer } from "@/lib/site-config/offer-popup";
import { copyText, selectText } from "./copy";

/**
 * "Popup da oferta": one progressive promotion of the INK store, its tiers as cards, the code to copy and one button. Our look (square, ink borders, the
 * display face), in the region's header colours. The layout follows the width of its own box (container queries), so the CMS preview can show the phone and
 * the desktop versions inside the panel: side by side from 42rem, a bottom sheet below it.
 *
 * `live`: fixed over the page, modal (focus kept inside, Escape and the backdrop close it, the page does not scroll behind it), analytics on.
 * `preview`: the CMS preview; the same markup laid out inside its frame, nothing global (no focus, no scroll lock, no storage, no analytics).
 * When it opens and how often is the loader's job (OfferPopupLoader); closing is reported through `onClose`.
 */
export type OfferPopupProps = {
  region: string;
  offer: PublicOffer;
  theme?: OfferTheme;
  mode?: "live" | "preview";
  onClose?: () => void;
};

const FALLBACK_THEME: OfferTheme = { primary: "#000000", onPrimary: "#ffffff" };
const COPIED_MS = 2000;
const FAILED_MS = 6000;

export function OfferPopup({ region, offer, theme = FALLBACK_THEME, mode = "live", onClose }: OfferPopupProps) {
  const live = mode === "live";
  const [copy, setCopy] = useState<"copied" | "failed" | null>(null);
  const [announce, setAnnounce] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);
  const codeRef = useRef<HTMLSpanElement>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const headingId = useId();
  const cards = offerCards(offer.tiers);
  const best = offer.tiers[offer.tiers.length - 1];

  const track = useCallback((event: OfferPopupEvent) => {
    if (live) trackOfferPopup(event, { region, promoCode: offer.code });
  }, [live, region, offer.code]);

  const close = useCallback((reason: "button" | "later" | "escape" | "backdrop" | "cta") => {
    if (reason !== "cta") track("offer_popup_close");
    onClose?.();
  }, [onClose, track]);

  const onCopy = async () => {
    if (copyTimer.current) clearTimeout(copyTimer.current);
    const ok = live ? await copyText(offer.code) : true;
    if (ok) {
      setCopy("copied");
      setAnnounce(`Código ${offer.code} copiado.`);
      track("offer_popup_copy");
    } else {
      selectText(codeRef.current);
      setCopy("failed");
      setAnnounce(`Não foi possível copiar. O código ${offer.code} está selecionado.`);
    }
    copyTimer.current = setTimeout(() => setCopy(null), ok ? COPIED_MS : FAILED_MS);
  };
  useEffect(() => () => { if (copyTimer.current) clearTimeout(copyTimer.current); }, []);

  useEffect(() => { track("offer_popup_view"); }, [track]);

  // Modal while live: focus moves in (and back where it was on close), Tab stays inside, Escape closes, the page behind does not scroll.
  useEffect(() => {
    if (!live) return;
    const dialog = dialogRef.current;
    const before = document.activeElement as HTMLElement | null;
    dialog?.querySelector<HTMLElement>("[data-offer-close]")?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); close("escape"); return; }
      if (e.key !== "Tab" || !dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>("button, [href], [tabindex]:not([tabindex='-1'])")).filter((el) => el.getClientRects().length > 0);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    const root = document.documentElement;
    const overflow = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      root.style.overflow = overflow;
      before?.focus?.({ preventScroll: true });
    };
  }, [live, close]);

  const vars = { "--offer-bg": theme.primary, "--offer-fg": theme.onPrimary } as CSSProperties;
  const ctaClass = "flex min-h-12 w-full items-center justify-center bg-[var(--offer-bg)] px-4 text-center text-[0.9375rem] font-bold uppercase tracking-[0.06em] text-[var(--offer-fg)] outline-offset-4 transition-opacity duration-200 hover:opacity-90";

  return (
    <div style={vars} className={`@container z-[60] ${live ? "fixed inset-0" : "absolute inset-0 overflow-hidden"}`} data-offer-root={mode}>
      <div aria-hidden="true" className="absolute inset-0 bg-black/50" data-offer-backdrop onClick={() => close("backdrop")} />
      <div className="pointer-events-none relative flex h-full items-end justify-center @2xl:items-center @2xl:p-6">
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal={live ? "true" : undefined}
          aria-labelledby={headingId}
          data-testid="offer-popup"
          className="offer-in pointer-events-auto relative flex max-h-[min(90%,44rem)] w-full flex-col border-t-2 border-ink bg-paper pb-[env(safe-area-inset-bottom)] text-ink shadow-[0_-12px_40px_rgb(0_0_0/0.3)] @2xl:max-w-[50rem] @2xl:flex-row @2xl:border-2 @2xl:pb-0 @2xl:shadow-[0_24px_60px_rgb(0_0_0/0.35)]"
        >
          <button
            type="button"
            data-offer-close
            onClick={() => close("button")}
            aria-label="Fechar oferta"
            className="absolute right-2 top-2 z-10 flex h-10 w-10 items-center justify-center border-2 border-ink bg-paper text-ink hover:bg-white"
            data-testid="offer-close"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>

          <div className="shrink-0 bg-[var(--offer-bg)] px-5 pb-5 pt-5 pr-14 text-[var(--offer-fg)] [@media(max-height:700px)]:pb-3.5 [@media(max-height:700px)]:pt-3.5 @2xl:flex @2xl:w-[44%] @2xl:flex-col @2xl:justify-center @2xl:px-9 @2xl:py-12">
            <p className="text-[0.75rem] font-bold uppercase tracking-[0.14em]">{offer.eyebrow}</p>
            <h2 id={headingId} className="mt-2 font-display text-[2rem] [@media(max-height:700px)]:text-[1.625rem] font-extrabold uppercase leading-[0.92] tracking-[0.005em] [overflow-wrap:anywhere] @2xl:mt-4 @2xl:text-[3.25rem]">{offer.title}</h2>
            {/* Short phones (iPhone SE): the sheet keeps the essentials; the tiers already say "quanto mais peças, maior o desconto". */}
            <p className="mt-2 text-[0.9375rem] leading-snug [@media(max-height:700px)]:hidden @2xl:mt-5 @2xl:block @2xl:text-[1.0625rem]">{offer.lead}</p>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 pt-5 [@media(max-height:700px)]:pb-2 [@media(max-height:700px)]:pt-4 @2xl:px-8 @2xl:pb-7 @2xl:pt-16">
            <ol className="grid gap-2" style={{ gridTemplateColumns: `repeat(${cards.length}, minmax(0, 1fr))` }} aria-label="Descontos por quantidade" data-testid="offer-tiers">
              {cards.map((t) => {
                const top = t === best && offer.tiers.length > 1;
                return (
                  <li key={t.items} className={`relative flex flex-col items-center border-2 bg-white px-1 pb-2.5 pt-3 text-center ${top ? "border-[var(--offer-bg)]" : "border-ink/15"}`}>
                    {/* Wider than a phone's card: anchored to the card's right edge (the popup's edge), it grows to the left, into the gap; under 24rem it is just "Maior". */}
                    {top && (
                      <span className="absolute -right-[2px] -top-2.5 whitespace-nowrap bg-[var(--offer-bg)] px-1 py-0.5 text-[0.5625rem] font-bold uppercase leading-tight tracking-[0.02em] text-[var(--offer-fg)] @md:right-auto @md:left-1/2 @md:-translate-x-1/2 @md:px-1.5 @md:text-[0.625rem] @md:tracking-[0.06em]">
                        <span className="@sm:hidden">Maior</span>
                        <span className="hidden @sm:inline">Maior desconto</span>
                      </span>
                    )}
                    <span className="text-[0.8125rem] leading-tight">{t.items} peças</span>
                    <span className="mt-0.5 font-display text-[1.375rem] font-extrabold leading-none whitespace-nowrap @md:text-[1.625rem]">{offerAmount(offer.kind, t.discount)}</span>
                    <span className="mt-1 text-[0.6875rem] font-bold uppercase tracking-[0.1em]">OFF</span>
                  </li>
                );
              })}
            </ol>

            {offer.auto ? (
              <p className="mt-4 border-l-4 border-[var(--offer-bg)] bg-[rgb(0_0_0/0.045)] px-3 py-2.5 text-[0.9375rem] font-semibold">Desconto automático: aparece sozinho no carrinho.</p>
            ) : (
              <div className="mt-4">
                <p className="text-[0.875rem]" id={`${headingId}-code`}>Use o cupom no carrinho</p>
                <div className="mt-1.5 flex items-stretch">
                  <span ref={codeRef} className="flex min-h-11 min-w-0 flex-1 select-all items-center border-2 border-r-0 border-dashed border-ink px-3 font-mono text-[1rem] font-bold tracking-[0.08em] [overflow-wrap:anywhere]" data-testid="offer-code">
                    {offer.code}
                  </span>
                  <button type="button" onClick={() => void onCopy()} aria-describedby={`${headingId}-code`} className="min-h-11 shrink-0 border-2 border-ink bg-ink px-4 text-[0.8125rem] font-bold uppercase tracking-[0.06em] text-white transition-colors duration-200 hover:bg-white hover:text-ink" data-testid="offer-copy">
                    {copy === "copied" ? "Copiado" : "Copiar"}
                  </button>
                </div>
                {copy === "failed" && <p className="mt-2 text-[0.8125rem] font-semibold" role="status">Não deu para copiar automaticamente: o código está selecionado, copie com o menu do aparelho.</p>}
              </div>
            )}

            <div className="mt-4">
              {offer.ctaHref && live ? (
                <Link href={offer.ctaHref} className={ctaClass} onClick={() => { track("offer_popup_cta"); close("cta"); }} data-testid="offer-cta">{offer.cta}</Link>
              ) : (
                <button type="button" className={ctaClass} onClick={() => { track("offer_popup_cta"); close("cta"); }} data-testid="offer-cta">{offer.cta}</button>
              )}
            </div>
            <button type="button" onClick={() => close("later")} className="mx-auto mt-2 flex min-h-10 items-center px-3 text-[0.875rem] underline underline-offset-4 hover:no-underline" data-testid="offer-later">Agora não</button>
            <p className="mt-2 text-[0.75rem] leading-snug text-ink-mute">{offerFinePrint(offer.auto, offer.tiers)}</p>
          </div>
        </div>
      </div>
      <p className="sr-only" aria-live="polite">{announce}</p>
    </div>
  );
}

export default OfferPopup;
