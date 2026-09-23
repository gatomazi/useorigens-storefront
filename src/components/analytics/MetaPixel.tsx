"use client";

import Script from "next/script";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { useConsent } from "@/lib/consent/ConsentProvider";
import { metaPixelId } from "@/lib/config/public-env";

declare global {
  interface Window {
    fbq?: ((...args: unknown[]) => void) & { queue?: unknown[] };
  }
}

/**
 * Meta Pixel, gated on the shared analytics/marketing consent (CLAUDE_CONSENTIMENTO_META_PIXEL.md): while `record` isn't
 * `"accepted"`, this component renders nothing at all — no <Script>, no fbevents.js request, no noscript
 * pixel. Not "loaded but silent": genuinely absent from the DOM, so nothing beacons to Meta before
 * acceptance. No `<noscript>` fallback is included on purpose — a noscript tag would fire unconditionally for
 * visitors with JS disabled, which cannot be gated by this (or any) client-side consent check; omitting it
 * means those visitors are simply never tracked, which is the consent-respecting trade-off.
 *
 * PageView fires once on mount (first accepted render) and once per real App Router navigation
 * (pathname/search change) — never on remount-without-navigation, Strict Mode's double-invoke, or an
 * unrelated re-render, via `lastTracked` staying pinned to the current URL.
 */
export function MetaPixel() {
  const pixelId = metaPixelId();
  const { record } = useConsent();
  const accepted = record?.choice === "accepted";
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lastTracked = useRef<string | null>(null);
  const wasAccepted = useRef(false);
  const revokedThisSession = useRef(false);

  const currentUrl = pathname + (searchParams?.toString() ? `?${searchParams.toString()}` : "");

  // Revocation while already loaded this session: tell the SDK to stop (Meta's own consent API), and forget
  // the URL we last tracked so nothing resumes silently if consent is granted again later without a reload.
  // Accepting again in the same session: fbevents.js is still loaded and the bootstrap below will not run a
  // second time (same script id), so `consent grant` has to be re-sent here. Nothing earlier is replayed —
  // the PageView effect below only sends a fresh PageView for the page the person is on right now.
  useEffect(() => {
    if (wasAccepted.current && !accepted && typeof window.fbq === "function") {
      window.fbq("consent", "revoke");
      lastTracked.current = null;
      revokedThisSession.current = true;
    } else if (!wasAccepted.current && accepted && revokedThisSession.current && typeof window.fbq === "function") {
      window.fbq("consent", "grant");
      revokedThisSession.current = false;
    }
    wasAccepted.current = accepted;
  }, [accepted]);

  useEffect(() => {
    if (!accepted || !pixelId) return;
    if (typeof window.fbq !== "function") return; // script hasn't finished loading yet — onLoad below handles the first PageView
    if (lastTracked.current === currentUrl) return;
    lastTracked.current = currentUrl;
    window.fbq("track", "PageView");
  }, [accepted, pixelId, currentUrl]);

  if (!pixelId || !accepted) return null;

  return (
    <Script
      id="meta-pixel"
      strategy="afterInteractive"
      onLoad={() => {
        if (lastTracked.current === currentUrl) return;
        lastTracked.current = currentUrl;
        window.fbq?.("track", "PageView");
      }}
      dangerouslySetInnerHTML={{
        // No `fbq('track', 'PageView')` in this bootstrap on purpose (CLAUDE_ADENDO_4_EVENTOS_META_STOREFRONT.md
        // §2: "garantir que o snippet-base não envie um PageView adicional ao evento emitido pelo helper") —
        // the `onLoad` callback below and the route-change effect above are the only two places that ever call
        // `fbq('track', 'PageView')`, and they share the same `lastTracked` guard so at most one of them fires
        // for the very first page.
        __html: `
!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('consent', 'grant');
fbq('init', '${pixelId}');
`,
      }}
    />
  );
}
