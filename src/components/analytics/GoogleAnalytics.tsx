"use client";

import Script from "next/script";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { withoutCartRef } from "@/lib/cart-mirror/url";
import { useConsent } from "@/lib/consent/ConsentProvider";
import { measurementAllowed } from "@/lib/consent/policy";
import { setActiveGa4 } from "@/lib/analytics/active-ids";

/** Measurement IDs already configured in this page session (gtag keeps them all; `config` is never repeated, and events are addressed with `send_to`, see active-ids.ts). */
const configured = new Set<string>();
function ensureConfig(id: string): void {
  if (typeof window.gtag !== "function" || configured.has(id)) return;
  window.gtag("config", id, { send_page_view: false });
  configured.add(id);
}
import { gaMeasurementId } from "@/lib/config/public-env";
import { trackPageView } from "@/lib/analytics/track";

declare global {
  interface Window {
    dataLayer?: unknown[];
  }
}

/**
 * GA4, gated on the same analytics/marketing consent as `MetaPixel.tsx` (CLAUDE_GA4_STOREFRONT_TRACKING.md §3): while
 * `record` isn't `"accepted"`, this component renders nothing at all — no <Script>, no gtag.js request, no
 * dataLayer. Not "loaded but silent": genuinely absent from the DOM, mirroring `MetaPixel.tsx`'s own
 * architecture exactly, so the same consent guarantee applies to both providers identically.
 *
 * `page_view` fires once on mount (first accepted render) and once per real App Router navigation
 * (pathname/search change) — never on remount-without-navigation, Strict Mode's double-invoke, or an
 * unrelated re-render, via `lastTracked` staying pinned to the current path (same `lastTracked`-guard pattern
 * as `MetaPixel.tsx`, so whichever of the route-change effect or the Script's `onLoad` runs first "wins" and
 * the other is a guaranteed no-op).
 *
 * `send_page_view: false` in the bootstrap below (§4: "Preferência: send_page_view: false") is what stops
 * GA4's own automatic page_view from firing on `gtag('config', ...)` — `trackPageView()` (src/lib/analytics/
 * track.ts) is the single controlled place that ever sends one, so there is no double-counting between GA4's
 * automatic config-time page_view and this component's own manual one.
 */
/** `measurementId`: see `MetaPixel` — `undefined` keeps the build-time env fallback. */
export function GoogleAnalytics({ measurementId: resolved }: { measurementId?: string | null } = {}) {
  const measurementId = resolved === undefined ? gaMeasurementId() : resolved;
  const { record } = useConsent();
  const accepted = measurementAllowed(record); // true from the start unless the strict consent gate is on (src/lib/consent/policy.ts)
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lastTracked = useRef<string | null>(null);
  const wasAccepted = useRef(false);
  const revokedThisSession = useRef(false);

  const query = withoutCartRef(searchParams?.toString() ?? ""); // the cart token never reaches analytics
  const currentPath = pathname + (query ? `?${query}` : "");
  // `window` doesn't exist during SSR — the component always renders null there anyway (consent is never
  // "accepted" on the server, see ConsentProvider's `getServerConsentSnapshot`), but this computation itself
  // runs on every render including that first server pass, so it needs its own guard.
  const currentUrl = typeof window !== "undefined" ? window.location.origin + currentPath : currentPath;

  // Revocation while already loaded this session: Google's own Consent Mode API (not an improvised send), and
  // forget the path we last tracked so nothing resumes silently if consent is granted again later without a
  // reload — same shape as MetaPixel.tsx's `fbq('consent','revoke')` handling. Accepting again in the same
  // session flips Consent Mode back to granted (the bootstrap won't re-run for the same script id); nothing
  // earlier is replayed.
  useEffect(() => {
    if (wasAccepted.current && !accepted && typeof window.gtag === "function") {
      window.gtag("consent", "update", { analytics_storage: "denied" });
      lastTracked.current = null;
      revokedThisSession.current = true;
    } else if (!wasAccepted.current && accepted && revokedThisSession.current && typeof window.gtag === "function") {
      window.gtag("consent", "update", { analytics_storage: "granted" });
      revokedThisSession.current = false;
    }
    wasAccepted.current = accepted;
  }, [accepted]);

  // Which measurement ID this page sends to (server-resolved per region). Cleared on unmount so a move to a region without one sends nothing.
  useEffect(() => {
    setActiveGa4(accepted && measurementId ? measurementId : null);
    return () => setActiveGa4(null);
  }, [accepted, measurementId]);

  useEffect(() => {
    if (!accepted || !measurementId) return;
    if (typeof window.gtag !== "function") return; // script hasn't finished loading yet — onLoad below handles the first page_view
    ensureConfig(measurementId); // a client-side move to another region may bring an ID that was never configured here
    if (lastTracked.current === currentPath) return;
    lastTracked.current = currentPath;
    trackPageView({ pageLocation: currentUrl, pagePath: currentPath, pageTitle: document.title });
  }, [accepted, measurementId, currentPath, currentUrl]);

  if (!measurementId || !accepted) return null;

  return (
    <Script
      id="ga4"
      strategy="afterInteractive"
      onLoad={() => {
        ensureConfig(measurementId);
        if (lastTracked.current === currentPath) return;
        lastTracked.current = currentPath;
        trackPageView({ pageLocation: currentUrl, pagePath: currentPath, pageTitle: document.title });
      }}
      dangerouslySetInnerHTML={{
        // `if(!w.gtag)` guards the install exactly like Meta's own shim's `if(f.fbq)return;` — lets a test (or
        // any other script) pre-define `window.gtag` before this runs and have it survive untouched, and
        // means the real gtag.js request is only ever inserted once, even across route changes that remount
        // this component. No `gtag('event','page_view', ...)` here on purpose: the route-change effect above
        // and the `onLoad` callback below are the only two places that ever send one, sharing `lastTracked`.
        __html: `
!function(w,d,s,id){w.dataLayer=w.dataLayer||[];if(!w.gtag){w.gtag=function(){w.dataLayer.push(arguments)};var f=d.getElementsByTagName(s)[0],j=d.createElement(s);j.async=!0;j.src='https://www.googletagmanager.com/gtag/js?id='+id;f.parentNode.insertBefore(j,f)}w.gtag('js',new Date())}(window,document,'script','${measurementId}');
`,
      }}
    />
  );
}
