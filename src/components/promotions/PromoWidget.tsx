"use client";

import { useCallback, useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { trackPromo, type PromoEvent } from "@/lib/analytics/track";
import { useOptionalConsent } from "@/lib/consent/ConsentProvider";
import { couponBadgeText, type PromoTheme, type PublicPromotion } from "@/lib/site-config/promotions";
import { isTypingTarget, mayNudge, nudgeDelay, NUDGE_DURATION_MS, QUIET_KEY } from "./attention";
import { copyText, selectText } from "./copy";
import { PromoList, TicketIcon, type CopyState } from "./PromoCards";

/**
 * The coupon button of a region and its panel ("Cupons e ofertas"). Bottom LEFT on purpose: WhatsApp and Ajuda live on the right on the INK pages, and
 * the cart lives in the header here. Phones get a bottom sheet (modal, focus kept inside, page scroll locked); larger screens a compact popover next to
 * the button. "Copiar" only copies: the INK cart validates and applies the coupon, the storefront never computes or applies a discount.
 *
 * `live`: fixed on the page, moves up above the cookie bar, hides while a menu/drawer/dialog is open or the visitor types, nudges now and then (attention.ts).
 * `preview`: the CMS preview; same markup, laid out inside its frame, no analytics, no storage, no nudge unless asked for (`nudgeKey`).
 */
export type PromoWidgetProps = {
  region: string;
  items: readonly PublicPromotion[];
  theme?: PromoTheme;
  mode?: "live" | "preview";
  /** Preview only: start with the panel open. */
  defaultOpen?: boolean;
  /** Preview only: change it to play one wiggle. */
  nudgeKey?: number;
};

const FALLBACK_THEME: PromoTheme = { primary: "#000000", onPrimary: "#ffffff" };
const COPIED_MS = 2000;
const FAILED_MS = 6000;

function readQuiet(): boolean {
  try {
    return window.sessionStorage.getItem(QUIET_KEY) === "1";
  } catch {
    return false;
  }
}
function writeQuiet(): void {
  try {
    window.sessionStorage.setItem(QUIET_KEY, "1");
  } catch {
    // Storage blocked (private mode, in-app browser): the button just stays still for this page view.
  }
}

/** Something of the PAGE (not ours) is open: the mobile menu locks the root scroll, the search and other dialogs are modal. */
function pageOverlayOpen(own: Element | null): boolean {
  if (document.documentElement.style.overflow === "hidden" && !document.documentElement.hasAttribute("data-promo-lock")) return true;
  for (const el of document.querySelectorAll('[aria-modal="true"], dialog[open]')) if (!own?.contains(el) && el.getClientRects().length > 0) return true;
  return false;
}
/** The button's own slot (bottom-left, 56px) would sit over a purchase control: a version of the style or the CTA ("Escolher tamanho na loja"). */
function coversPurchase(bottomOffset: number): boolean {
  const vh = window.innerHeight;
  const slot = { left: 16, right: 16 + 56, top: vh - 16 - bottomOffset - 56, bottom: vh - 16 - bottomOffset };
  for (const el of document.querySelectorAll("[data-purchase-controls] button, [data-purchase-controls] a[href], [data-purchase-controls] .btn")) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.left < slot.right && slot.left < r.right && r.top < slot.bottom && slot.top < r.bottom) return true;
  }
  return false;
}
const headerPopoverOpen = (): boolean => !!document.querySelector('header [aria-expanded="true"]');
const coarsePointer = (): boolean => window.matchMedia?.("(pointer: coarse)").matches ?? false;
const reducedMotion = (): boolean => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
const isSheet = (): boolean => !(window.matchMedia?.("(min-width: 640px)").matches ?? true);

export function PromoWidget({ region, items, theme = FALLBACK_THEME, mode = "live", defaultOpen = false, nudgeKey }: PromoWidgetProps) {
  const live = mode === "live";
  const [open, setOpen] = useState(defaultOpen);
  const [copy, setCopy] = useState<CopyState>(null);
  const [announce, setAnnounce] = useState("");
  const [hidden, setHidden] = useState(false);
  const [bottom, setBottom] = useState(0);
  const fabRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openRef = useRef(open);
  const hiddenRef = useRef(false);
  const bottomRef = useRef(0);
  const record = useOptionalConsent()?.record;
  const headingId = useId();
  const panelId = useId();
  const badge = couponBadgeText(items);
  const coupons = items.filter((i) => i.type === "coupon").length;

  const track = useCallback((event: PromoEvent, promoId?: string) => {
    if (live) trackPromo(event, { region, promoId });
  }, [live, region]);

  const close = useCallback((reason: "button" | "escape" | "outside") => {
    if (!openRef.current) return;
    openRef.current = false;
    setOpen(false);
    track("promo_panel_close");
    if (reason !== "outside") fabRef.current?.focus({ preventScroll: true });
  }, [track]);

  const toggle = () => {
    if (open) return close("button");
    openRef.current = true;
    setOpen(true);
    if (live) writeQuiet();
    track("promo_fab_open");
  };

  const onCopy = async (item: PublicPromotion, codeEl: HTMLElement | null) => {
    if (!item.code) return;
    if (copyTimer.current) clearTimeout(copyTimer.current);
    const ok = mode === "preview" ? true : await copyText(item.code);
    if (ok) {
      setCopy({ id: item.id, status: "copied" });
      setAnnounce(`Código ${item.code} copiado.`);
      track("promo_coupon_copy", item.id);
    } else {
      selectText(codeEl);
      setCopy({ id: item.id, status: "failed" });
      setAnnounce(`Não foi possível copiar. O código ${item.code} está selecionado.`);
    }
    copyTimer.current = setTimeout(() => setCopy(null), ok ? COPIED_MS : FAILED_MS);
  };
  useEffect(() => () => { if (copyTimer.current) clearTimeout(copyTimer.current); }, []);

  // Opening: focus moves into the panel; Escape closes; a click outside closes; on phones the page behind the sheet does not scroll.
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    panel?.querySelector<HTMLElement>("[data-promo-close]")?.focus({ preventScroll: true });
    if (mode === "preview") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); close("escape"); return; }
      // Focus stays inside the sheet (phones); the desktop popover is not modal, Tab may leave it.
      if (e.key === "Tab" && panel && isSheet()) {
        const focusable = Array.from(panel.querySelectorAll<HTMLElement>("button, [href], [tabindex]:not([tabindex='-1'])")).filter((el) => el.getClientRects().length > 0);
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (target && !panel?.contains(target) && !fabRef.current?.contains(target)) close("outside");
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer, true);
    const root = document.documentElement;
    const lock = isSheet();
    const before = root.style.overflow;
    if (lock) { root.style.overflow = "hidden"; root.setAttribute("data-promo-lock", ""); }
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer, true);
      if (lock) { root.style.overflow = before; root.removeAttribute("data-promo-lock"); }
    };
  }, [open, mode, close]);

  // Above the cookie bar while it is shown (measured: one or two lines depending on the width).
  useEffect(() => {
    if (!live) return;
    let observer: ResizeObserver | null = null;
    const measure = () => {
      const banner = document.querySelector<HTMLElement>("[data-consent-banner]");
      setBottom(banner && banner.getClientRects().length > 0 ? Math.ceil(banner.getBoundingClientRect().height) : 0);
      return banner;
    };
    const frame = requestAnimationFrame(() => {
      const banner = measure();
      if (banner && typeof ResizeObserver !== "undefined") { observer = new ResizeObserver(measure); observer.observe(banner); }
    });
    return () => { cancelAnimationFrame(frame); observer?.disconnect(); };
  }, [live, record]);

  // Out of the way while the page needs the space or the attention: a menu, the search or a dialog is open, or the visitor types (virtual keyboard).
  useEffect(() => {
    if (!live) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const check = () => {
      const typing = isTypingTarget(document.activeElement) && coarsePointer() && !panelRef.current?.contains(document.activeElement);
      setHidden(!openRef.current && (pageOverlayOpen(rootRef.current) || typing || coversPurchase(bottomRef.current)));
    };
    const later = () => { if (timer) clearTimeout(timer); timer = setTimeout(check, 60); };
    const opts = { capture: true } as const;
    document.addEventListener("click", later, opts);
    document.addEventListener("keydown", later, opts);
    document.addEventListener("focusin", later, opts);
    document.addEventListener("focusout", later, opts);
    window.addEventListener("resize", later);
    window.addEventListener("scroll", later, { passive: true });
    window.visualViewport?.addEventListener("resize", later);
    check();
    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener("click", later, opts);
      document.removeEventListener("keydown", later, opts);
      document.removeEventListener("focusin", later, opts);
      document.removeEventListener("focusout", later, opts);
      window.removeEventListener("resize", later);
      window.removeEventListener("scroll", later);
      window.visualViewport?.removeEventListener("resize", later);
    };
  }, [live]);

  // The timers below read the latest state through these refs (they must not restart on every change).
  useEffect(() => {
    openRef.current = open;
    hiddenRef.current = hidden;
    bottomRef.current = bottom;
  }, [open, hidden, bottom]);
  const wiggle = useCallback(() => {
    const el = fabRef.current;
    if (!el) return;
    el.classList.remove("promo-wiggle");
    void el.offsetWidth; // restart the animation
    el.classList.add("promo-wiggle");
    setTimeout(() => el.classList.remove("promo-wiggle"), NUDGE_DURATION_MS + 40);
  }, []);

  // The nudge (attention.ts): every ~6–8 s, skipped when unwelcome, over for the session once the panel was opened.
  useEffect(() => {
    if (!live || readQuiet() || reducedMotion()) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    const schedule = (delay: number | null) => {
      if (timer) clearTimeout(timer);
      timer = delay === null || stopped ? null : setTimeout(fire, delay);
    };
    const fire = () => {
      const calm = mayNudge({
        panelOpen: openRef.current,
        overlayOpen: pageOverlayOpen(rootRef.current) || headerPopoverOpen(),
        typing: isTypingTarget(document.activeElement),
        hidden: document.visibilityState !== "visible",
        buttonHidden: hiddenRef.current || !fabRef.current || fabRef.current.getClientRects().length === 0,
        reducedMotion: reducedMotion(),
        quiet: readQuiet(),
      });
      if (readQuiet()) { stopped = true; return; }
      if (calm) wiggle();
      schedule(nudgeDelay(Math.random()));
    };
    schedule(nudgeDelay(Math.random()));
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [live, wiggle]);

  // Preview: one wiggle on demand ("Ver a animação"), still never with reduced motion.
  useEffect(() => {
    if (mode === "preview" && nudgeKey && !reducedMotion()) wiggle();
  }, [mode, nudgeKey, wiggle]);

  if (items.length === 0) return null;

  const vars = { "--promo-bg": theme.primary, "--promo-fg": theme.onPrimary, "--promo-bottom": `${bottom}px` } as CSSProperties;
  const label = coupons > 0 ? `Cupons e ofertas: ${coupons} ${coupons === 1 ? "cupom disponível" : "cupons disponíveis"}` : "Cupons e ofertas";
  const position = live ? "fixed" : "absolute";

  return (
    <div ref={rootRef} style={vars} data-promo-root={mode} className="contents">
      {open && live && <div aria-hidden="true" className="fixed inset-0 z-50 bg-black/45 sm:hidden" data-promo-backdrop onClick={() => close("outside")} />}
      {open && (
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-modal={live ? "true" : undefined}
          aria-labelledby={headingId}
          data-testid="promo-panel"
          className={[
            "z-50 flex flex-col bg-paper text-ink shadow-[0_18px_40px_rgb(0_0_0/0.28)]",
            live
              ? "fixed inset-x-0 bottom-0 max-h-[min(82dvh,40rem)] border-t-2 border-ink pb-[env(safe-area-inset-bottom)] sm:inset-x-auto sm:bottom-[calc(max(1rem,env(safe-area-inset-bottom))+var(--promo-bottom)+4.25rem)] sm:left-[max(1rem,env(safe-area-inset-left))] sm:w-[22.5rem] sm:max-h-[min(70vh,34rem)] sm:border-2 sm:pb-0"
              : "absolute bottom-[4.75rem] left-4 right-4 max-h-[calc(100%-6rem)] border-2 border-ink sm:right-auto sm:w-[22.5rem]",
          ].join(" ")}
        >
          <div className="flex items-center justify-between gap-3 border-b-2 border-ink py-1 pl-4 pr-1">
            <h2 id={headingId} className="font-display text-[1.375rem] font-extrabold uppercase leading-none tracking-[0.01em]">Cupons e ofertas</h2>
            <button type="button" data-promo-close onClick={() => close("button")} aria-label="Fechar cupons e ofertas" className="flex h-11 w-11 shrink-0 items-center justify-center text-ink hover:bg-black/5" data-testid="promo-close">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 sm:p-3.5">
            <PromoList items={items} copy={copy} onCopy={onCopy} />
          </div>
        </div>
      )}
      <button
        ref={fabRef}
        type="button"
        onClick={toggle}
        hidden={hidden}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-haspopup="dialog"
        aria-label={label}
        title="Cupons e ofertas"
        data-testid="promo-fab"
        className={[
          position,
          "z-30 flex h-14 w-14 items-center justify-center rounded-xl bg-[var(--promo-bg)] text-[var(--promo-fg)] shadow-[0_6px_18px_rgb(0_0_0/0.24)] outline-offset-4 transition-transform duration-150 hover:-translate-y-0.5 active:translate-y-0",
          live ? "bottom-[calc(max(1rem,env(safe-area-inset-bottom))+var(--promo-bottom))] left-[max(1rem,env(safe-area-inset-left))]" : "bottom-4 left-4",
        ].join(" ")}
      >
        <TicketIcon />
        {badge && (
          <span aria-hidden="true" data-testid="promo-badge" className="absolute -right-1.5 -top-1.5 flex h-[1.375rem] min-w-[1.375rem] items-center justify-center rounded-full border-2 border-[var(--promo-bg)] bg-white px-1 text-[0.75rem] font-extrabold leading-none text-black">
            {badge}
          </span>
        )}
      </button>
      <p className="sr-only" aria-live="polite">{announce}</p>
    </div>
  );
}

export default PromoWidget;
