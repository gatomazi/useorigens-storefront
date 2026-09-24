"use client";

import { useEffect } from "react";

/**
 * The preview renders the storefront's real components, but it must be inert: it fires no tracking (there is no MetaPixel/GA/consent banner
 * in this tree), and it must not navigate away or submit anything. Clicks on links (except in-page #anchors) and form submits are swallowed.
 */
export function PreviewGuard() {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const link = (e.target as HTMLElement | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!link) return;
      const href = link.getAttribute("href") ?? "";
      if (href.startsWith("#")) return;
      e.preventDefault();
    };
    const onSubmit = (e: Event) => e.preventDefault();
    document.addEventListener("click", onClick, true);
    document.addEventListener("submit", onSubmit, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("submit", onSubmit, true);
    };
  }, []);
  return null;
}
