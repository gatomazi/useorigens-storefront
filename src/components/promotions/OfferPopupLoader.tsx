"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { offerAllowedPath, offerDue, offerSeenKey, offerSeenValue, parseOfferPopupPayload, OFFER_RETRY_MS, type OfferTheme, type PublicOffer } from "@/lib/site-config/offer-popup";
import { isTypingTarget } from "./attention";

/**
 * Loads the region's "Popup da oferta" AFTER the page is ready (idle) and opens it once it is due: the panel's N seconds into the visit (counted from the
 * first page load, so moving between pages does not restart it). Then the browser keeps that it was shown and it stays quiet for 7 days (a different promotion counts as new).
 *
 * It never opens over something else: a menu, the search, the coupon panel or any dialog, nor while the visitor types; it waits and tries again. Nor on the
 * pages where the visitor is creating or managing something (offer-popup.ts `offerAllowedPath`). Fail-open by construction: an error, a timeout, an invalid
 * answer, `offer: null` or a browser that cannot remember (storage blocked) render nothing at all, so nothing of the page depends on it.
 */
const OfferPopup = dynamic(() => import("./OfferPopup"), { ssr: false });

const FETCH_TIMEOUT_MS = 4000;
const IDLE_FALLBACK_MS = 1500;

function readSeen(region: string): string | null | "blocked" {
  try {
    return window.localStorage.getItem(offerSeenKey(region));
  } catch {
    return "blocked";
  }
}
function writeSeen(region: string, promotionId: number): boolean {
  try {
    window.localStorage.setItem(offerSeenKey(region), offerSeenValue(promotionId, Date.now()));
    return true;
  } catch {
    return false;
  }
}

/** Something of the page is open (the mobile menu locks the root scroll; the search, the coupon panel and other dialogs are modal) or the visitor types. */
function pageBusy(): boolean {
  if (document.visibilityState !== "visible") return true;
  if (document.documentElement.style.overflow === "hidden") return true;
  for (const el of document.querySelectorAll('[aria-modal="true"], dialog[open]')) if (el.getClientRects().length > 0) return true;
  if (document.querySelector('header [aria-expanded="true"], header details[open]')) return true;
  return isTypingTarget(document.activeElement);
}

export function OfferPopupLoader({ region }: { region: string }) {
  const pathname = usePathname();
  const [data, setData] = useState<{ offer: PublicOffer; theme?: OfferTheme } | null>(null);
  const [open, setOpen] = useState(false);
  const pathRef = useRef(pathname);
  const done = useRef(false);

  useEffect(() => { pathRef.current = pathname; }, [pathname]);

  // 1. The offer, once the page is idle (and only if this browser may still see it: nothing is fetched otherwise beyond the one request).
  useEffect(() => {
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const load = async () => {
      if (readSeen(region) === "blocked") return;
      timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      try {
        const response = await fetch(`/api/offer-popup/${region}`, { headers: { accept: "application/json" }, credentials: "omit", signal: controller.signal });
        if (!response.ok) return;
        const parsed = parseOfferPopupPayload(await response.json(), region, Date.now());
        const seen = readSeen(region);
        if (parsed && seen !== "blocked" && offerDue(seen, parsed.offer.id, Date.now())) setData(parsed);
      } catch {
        // The popup is complementary: any failure simply opens nothing.
      } finally {
        if (timeout) clearTimeout(timeout);
      }
    };
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
    const idle = w.requestIdleCallback ? w.requestIdleCallback(() => void load(), { timeout: 3000 }) : null;
    const fallback = idle === null ? setTimeout(() => void load(), IDLE_FALLBACK_MS) : null;
    return () => {
      controller.abort();
      if (idle !== null) w.cancelIdleCallback?.(idle);
      if (fallback) clearTimeout(fallback);
      if (timeout) clearTimeout(timeout);
    };
  }, [region]);

  // 2. When it is due: N seconds into the visit. A busy page postpones it; a quiet page opens it.
  useEffect(() => {
    if (!data || done.current) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    const attempt = () => {
      if (stopped || done.current) return;
      if (!offerAllowedPath(pathRef.current, region) || pageBusy()) { schedule(OFFER_RETRY_MS); return; }
      // Remembered BEFORE it shows: a browser that cannot remember would see it on every visit, so it sees nothing instead.
      if (!writeSeen(region, data.offer.id)) { stopped = true; return; }
      done.current = true;
      cleanup();
      setOpen(true);
    };
    const schedule = (ms: number) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(attempt, ms);
    };
    const cleanup = () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
    // performance.now() counts from the page load: the idle wait and the request are part of the N seconds, not added to them.
    schedule(Math.max(0, data.offer.delaySeconds * 1000 - performance.now()));
    return cleanup;
  }, [data, region]);

  const onClose = useCallback(() => setOpen(false), []);

  if (!data || !open) return null;
  return <OfferPopup region={region} offer={data.offer} theme={data.theme} onClose={onClose} />;
}
