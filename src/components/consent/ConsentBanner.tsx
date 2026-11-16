"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useConsent } from "@/lib/consent/ConsentProvider";
import type { RegionSlug } from "@/lib/geo/regions";

/**
 * Compact bottom bar, shown only while there is no stored decision (`record === null`). Deliberately has no
 * "×"/dismiss control: the only ways it goes away are "Aceitar cookies" or "Rejeitar" — closing it, scrolling
 * past it, or navigating away must never count as consent. It never blocks the rest of the page — search and
 * every product page work identically either way.
 *
 * Off the home, it never sits on a way forward: when the bar would cover a button of the store (`.btn`, a control marked `data-consent-avoid`, or
 * any control of an open dialog — a session showed the "Sua cidade" purchase bar hidden under it), it folds into a narrow "Cookies" tab on the left
 * edge, halfway up the screen: away from the bottom, where the price and the buttons are. A tap on the tab brings the full bar back. Folded is still
 * undecided: nothing is accepted or refused. Once folded it stays so on that page (no bar coming and going as the page scrolls). Frosted glass, so
 * what is behind it still shows through.
 *
 * The copy is the INK stores' own sentence and vendor-neutral on purpose: the choice covers every optional measurement tool the
 * storefront uses (today Meta + Google Analytics, possibly others later), so the detail lives in the privacy policy, not here.
 * Both buttons share the same size and weight so neither choice is visually pushed.
 */
const AVOID = ".btn, [data-consent-avoid]";
const DIALOG_CONTROLS = "a[href], button, input, select, textarea";
/** The full bar's height before it is ever measured (two lines on a phone, the 120px ceiling of catalog-ux.spec.ts). */
const FULL_GUESS = 120;

/** Whether the full bar would cover a control now. */
function coversControl(banner: HTMLElement | null, fullHeight: number): boolean {
  const zoneTop = window.innerHeight - fullHeight;
  // A modal dialog has the screen: only its own controls count, the page under it is inert.
  const dialog = document.querySelector<HTMLDialogElement>("dialog[open]");
  const controls = dialog ? dialog.querySelectorAll<HTMLElement>(DIALOG_CONTROLS) : document.querySelectorAll<HTMLElement>(AVOID);
  for (const el of controls) {
    if (banner?.contains(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && r.bottom > zoneTop && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth) return true;
  }
  return false;
}

export function ConsentBanner({ region, privacyHref }: { region: RegionSlug; privacyHref?: never } | { region?: never; privacyHref: string }) {
  const { record, accept, reject } = useConsent();
  const pathname = usePathname();
  const home = pathname === "/" || (region !== undefined && pathname === `/${region}`);
  const bar = useRef<HTMLDivElement>(null);
  const fullHeight = useRef(FULL_GUESS);
  // The page the bar folded on (a control it would cover); `opened`: the tab brought the full bar back on this page.
  const [folded, setFolded] = useState<string | null>(null);
  const [opened, setOpened] = useState<string | null>(null);
  const isFolded = !home && folded === pathname && opened !== pathname;

  useEffect(() => {
    if (record !== null || home || folded === pathname) return;
    let frame = 0;
    const check = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const el = bar.current;
        if (el && !el.hasAttribute("data-folded")) fullHeight.current = el.getBoundingClientRect().height || FULL_GUESS;
        if (coversControl(el, fullHeight.current)) setFolded(pathname);
      });
    };
    check();
    // The page moves under the bar (scroll, size), and controls come and go (a dialog opening, a purchase bar mounting).
    window.addEventListener("resize", check);
    document.addEventListener("scroll", check, { passive: true, capture: true });
    const observer = new MutationObserver(check);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["open", "hidden"] });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", check);
      document.removeEventListener("scroll", check, { capture: true });
      observer.disconnect();
    };
  }, [record, home, pathname, folded]);

  if (record !== null) return null;

  if (isFolded) {
    return (
      // Not `data-consent-banner`: the coupon button and the assistant sit above the BAR they find by it; beside a tab they keep their own place.
      <div
        ref={bar}
        role="region"
        aria-label="Preferências de cookies"
        data-consent-tab
        data-folded
        className="consent-glass consent-tab fixed left-0 top-1/2 z-40 -translate-y-1/2"
      >
        <button type="button" onClick={() => setOpened(pathname)} aria-expanded="false" className="consent-tab-button" data-testid="consent-tab">
          Cookies
        </button>
      </div>
    );
  }

  return (
    <div
      ref={bar}
      role="region"
      aria-label="Preferências de cookies"
      data-consent-banner
      className="consent-glass fixed inset-x-0 bottom-0 z-40 border-t border-white/15 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 sm:pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:pt-3"
    >
      {/* One short line and two 44px buttons: as little of the screen as the choice needs (the products are right behind it), never less than a real tap target. */}
      <div className="wrap flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <p className="text-[0.75rem] leading-snug text-white/90 sm:max-w-2xl sm:text-[0.875rem]">
          Usamos cookies para melhorar sua experiência.{" "}
          <Link href={privacyHref ?? `/${region}/privacidade`} className="link-line font-semibold text-white">
            Política de Privacidade
          </Link>
          .
        </p>
        <div className="grid shrink-0 grid-cols-2 gap-2 sm:flex sm:gap-3">
          <button
            type="button"
            onClick={reject}
            className="btn-ghost min-h-11 whitespace-nowrap border-2 border-white/40 px-3 text-[0.75rem] font-bold uppercase tracking-[0.04em] text-white hover:border-white sm:px-5 sm:text-[0.875rem]"
          >
            Rejeitar
          </button>
          <button
            type="button"
            onClick={accept}
            className="btn-light min-h-11 whitespace-nowrap border-2 px-3 text-[0.75rem] font-bold uppercase tracking-[0.04em] sm:px-5 sm:text-[0.875rem]"
          >
            Aceitar cookies
          </button>
        </div>
      </div>
    </div>
  );
}
