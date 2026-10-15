"use client";

import Script from "next/script";
import { useEffect, useRef } from "react";
import { useConsent } from "@/lib/consent/ConsentProvider";
import { measurementAllowed } from "@/lib/consent/policy";
import { clarityProjectId } from "@/lib/config/public-env";
import type { RegionSlug } from "@/lib/geo/regions";

declare global {
  interface Window {
    clarity?: ((...args: unknown[]) => void) & { q?: unknown[] };
  }
}

/**
 * Microsoft Clarity (heatmaps and session recordings), gated exactly like `MetaPixel.tsx` / `GoogleAnalytics.tsx`: while measurement
 * isn't allowed this renders nothing at all — no <Script>, no clarity.ms request. One Clarity project covers the whole domain, so every
 * session is tagged with the store (`regiao`) to filter Sul / Norte / Centro-Oeste apart in the dashboard.
 *
 * No page-view plumbing: Clarity follows App Router navigations (history changes) by itself. The cart token never reaches it either:
 * `CartRefCapture` strips `?cart_ref` from the address bar synchronously on hydration, before this afterInteractive script runs.
 *
 * Revocation while already loaded this session (strict consent gate only): Clarity's Consent API v2 with `denied` erases its cookies and
 * drops to its cookieless mode. Clarity has no documented call to stop recording outright, so the script stays loaded until the next
 * full page load, where it is no longer rendered. Accepting again in the same session flips it back to `granted`.
 */
export function MicrosoftClarity({ region }: { region: RegionSlug }) {
  const projectId = clarityProjectId();
  const { record } = useConsent();
  const accepted = measurementAllowed(record); // true from the start unless the strict consent gate is on (src/lib/consent/policy.ts)
  const wasAccepted = useRef(false);
  const revokedThisSession = useRef(false);

  useEffect(() => {
    if (wasAccepted.current && !accepted && typeof window.clarity === "function") {
      window.clarity("consentv2", { ad_Storage: "denied", analytics_Storage: "denied" });
      revokedThisSession.current = true;
    } else if (!wasAccepted.current && accepted && revokedThisSession.current && typeof window.clarity === "function") {
      window.clarity("consentv2", { ad_Storage: "granted", analytics_Storage: "granted" });
      revokedThisSession.current = false;
    }
    wasAccepted.current = accepted;
  }, [accepted]);

  // A client-side move to another region keeps the loaded script (same id, the bootstrap won't re-run): re-tag the session here.
  useEffect(() => {
    if (accepted && projectId) window.clarity?.("set", "regiao", region);
  }, [accepted, projectId, region]);

  if (!projectId || !accepted) return null;

  return (
    <Script
      id="ms-clarity"
      strategy="afterInteractive"
      dangerouslySetInnerHTML={{
        // Microsoft's own snippet, plus `if(c[a])return;` (same guard as Meta's shim) so the tag is only ever inserted once.
        __html: `
!function(c,l,a,r,i,t,y){if(c[a])return;c[a]=function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y)}(window,document,"clarity","script","${projectId}");
window.clarity("set","regiao","${region}");
`,
      }}
    />
  );
}
