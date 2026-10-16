"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { carryCampaign, rememberCampaign, setCarryRegion } from "@/lib/analytics/campaign";

/**
 * Keeps the landing's campaign (utm_*, fbclid, gclid…) for the visit and carries it on every link to an INK store (src/lib/analytics/campaign.ts).
 * The link is rewritten at the moment it is followed — a click (mouse, touch, Enter) or a middle click, in the capture phase, before the
 * browser reads the href — so no link component, server-rendered or not, needs to know about it. Right after, the href goes back to what
 * was rendered: a link copied later never carries someone's click id, and React's DOM stays as React wrote it. Renders nothing.
 */
export function CampaignCarry({ region = null }: { region?: { region: string; host: string } | null }) {
  const pathname = usePathname();

  // Single-store mode only (the layout passes it): the browsed region goes along to the single store.
  useEffect(() => {
    setCarryRegion(region);
    return () => setCarryRegion(null);
  }, [region]);

  useEffect(() => {
    rememberCampaign(window.location.search);
  }, [pathname]);

  useEffect(() => {
    const onFollow = (event: MouseEvent) => {
      const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(anchor instanceof HTMLAnchorElement)) return;
      const carried = carryCampaign(anchor.href);
      if (carried === anchor.href) return;
      const rendered = anchor.getAttribute("href") ?? "";
      anchor.href = carried;
      // The navigation reads the href as soon as this event is done; the next task puts the rendered one back.
      window.setTimeout(() => anchor.setAttribute("href", rendered), 0);
    };
    document.addEventListener("click", onFollow, true);
    document.addEventListener("auxclick", onFollow, true);
    return () => {
      document.removeEventListener("click", onFollow, true);
      document.removeEventListener("auxclick", onFollow, true);
    };
  }, []);

  return null;
}
