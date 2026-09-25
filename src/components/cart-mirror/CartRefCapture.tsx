"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { extractArrival, referrerAllowsArrival } from "@/lib/analytics/origens-events";
import { trackStorefrontArrived, whenAnalyticsReady } from "@/lib/analytics/track";
import { extractCartRef } from "@/lib/cart-mirror/url";
import { INK_SUL_ORIGIN } from "@/lib/cart-mirror/constants";
import { setToken } from "@/lib/cart-mirror/token-store";

/**
 * Consumes, on any /sul page, everything the INK-side loader put in the address bar:
 *  - `?cart_ref=<token>`: keeps ONLY the token (sessionStorage);
 *  - `?origens_src=<enum>&origens_p=<slug>`: the one-time arrival marker (fixed enums, no token, no personal data), reported ONCE as
 *    `origens_storefront_arrived` when analytics is genuinely available and consented.
 * Both are removed from the address bar in ONE synchronous `history.replaceState`, preserving every other parameter (UTMs) and the hash,
 * before the consent-gated analytics scripts (loaded afterInteractive) read `location`. A malformed value is dropped and never stored or
 * sent. Renders nothing.
 *
 * `replaceState` is Next-integrated (like `router.replace`, without a navigation, an extra RSC request or a remount). A second run of the
 * effect (Strict Mode, a remount) finds no marker left, so the arrival can never be reported twice.
 */
export function CartRefCapture() {
  const pathname = usePathname();

  useEffect(() => {
    const cart = extractCartRef(window.location.search);
    const arrival = extractArrival(cart.search);
    if (!cart.present && !arrival.present) return;
    if (cart.token) setToken(cart.token);
    window.history.replaceState(null, "", window.location.pathname + arrival.search + window.location.hash);
    if (arrival.entryPoint && referrerAllowsArrival(document.referrer, INK_SUL_ORIGIN)) {
      const { entryPoint, productSlug } = arrival;
      // Not cancelled on unmount on purpose: a route change right after landing must not lose the one-time arrival.
      whenAnalyticsReady(() => trackStorefrontArrived({ entryPoint, productSlug }));
    }
  }, [pathname]);

  return null;
}
