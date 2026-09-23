"use client";

import Script from "next/script";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { useConsent } from "@/lib/consent/ConsentProvider";
import { gaMeasurementId } from "@/lib/config/public-env";
import { trackPageView } from "@/lib/analytics/track";

declare global {
  interface Window {
    dataLayer?: unknown[];
  }
}

/**
 * GA4, gated on the same marketing consent as `MetaPixel.tsx` (CLAUDE_GA4_STOREFRONT_TRACKING.md §3): while
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
export function GoogleAnalytics() {
  const measurementId = gaMeasurementId();
  const { record } = useConsent();
  const accepted = record?.choice === "accepted";
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lastTracked = useRef<string | null>(null);
  const wasAccepted = useRef(false);

  const currentPath = pathname + (searchParams?.toString() ? `?${searchParams.toString()}` : "");
  // `window` doesn't exist during SSR — the component always renders null there anyway (consent is never
  // "accepted" on the server, see ConsentProvider's `getServerConsentSnapshot`), but this computation itself
  // runs on every render including that first server pass, so it needs its own guard.
  const currentUrl = typeof window !== "undefined" ? window.location.origin + currentPath : currentPath;

  useEffect(() => {
    if (!accepted || !measurementId) return;
    if (typeof window.gtag !== "function") return; // script hasn't finished loading yet — onLoad below handles the first page_view
    if (lastTracked.current === currentPath) return;
    lastTracked.current = currentPath;
    trackPageView({ pageLocation: currentUrl, pagePath: currentPath, pageTitle: document.title });
  }, [accepted, measurementId, currentPath, currentUrl]);

  // Revocation while already loaded this session: Google's own Consent Mode API (not an improvised send), and
  // forget the path we last tracked so nothing resumes silently if consent is granted again later without a
  // reload — same shape as MetaPixel.tsx's `fbq('consent', 'revoke')` handling.
  useEffect(() => {
    if (wasAccepted.current && !accepted && typeof window.gtag === "function") {
      window.gtag("consent", "update", { analytics_storage: "denied" });
      lastTracked.current = null;
    }
    wasAccepted.current = accepted;
  }, [accepted]);

  if (!measurementId || !accepted) return null;

  return (
    <Script
      id="ga4"
      strategy="afterInteractive"
      onLoad={() => {
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
!function(w,d,s,id){w.dataLayer=w.dataLayer||[];if(!w.gtag){w.gtag=function(){w.dataLayer.push(arguments)};var f=d.getElementsByTagName(s)[0],j=d.createElement(s);j.async=!0;j.src='https://www.googletagmanager.com/gtag/js?id='+id;f.parentNode.insertBefore(j,f)}w.gtag('js',new Date());w.gtag('config',id,{send_page_view:false})}(window,document,'script','${measurementId}');
`,
      }}
    />
  );
}
