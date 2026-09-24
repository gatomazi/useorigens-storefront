"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { extractCartRef } from "@/lib/cart-mirror/url";
import { setToken } from "@/lib/cart-mirror/token-store";

/**
 * Captures `?cart_ref=<token>` on any /sul page: keeps ONLY the token (sessionStorage), then removes the parameter from the
 * address bar right away, preserving every other parameter and the hash. A malformed token is dropped from the URL and never
 * stored. Renders nothing.
 *
 * The URL is rewritten with the native `history.replaceState`, which Next.js integrates with its router (and with
 * `usePathname`/`useSearchParams`): unlike `router.replace` it needs no navigation, so it triggers no extra RSC request and no
 * remount, and the token is gone before the analytics scripts (consent-gated, loaded afterInteractive) read `location`.
 */
export function CartRefCapture() {
  const pathname = usePathname();

  useEffect(() => {
    const { token, present, search } = extractCartRef(window.location.search);
    if (!present) return;
    if (token) setToken(token);
    window.history.replaceState(null, "", window.location.pathname + search + window.location.hash);
  }, [pathname]);

  return null;
}
