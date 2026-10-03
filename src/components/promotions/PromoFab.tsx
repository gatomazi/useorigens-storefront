"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { parsePromotionsPayload, type PromoTheme, type PublicPromotion } from "@/lib/site-config/promotions";

/**
 * Loads the region's live coupons and promotions AFTER the page is ready (idle), from the same public endpoint the INK Worker reads, and only then the
 * button's code. Fail-open by construction: an error, a timeout, an invalid answer or an empty list renders nothing at all (no button, no reserved
 * space, no retry loop). Nothing of the page waits for it, so search, the cart bridge and every link work identically with or without it.
 */
const PromoWidget = dynamic(() => import("./PromoWidget"), { ssr: false });

const FETCH_TIMEOUT_MS = 4000;
const IDLE_FALLBACK_MS = 1500;

export function PromoFab({ region }: { region: string }) {
  const [data, setData] = useState<{ items: PublicPromotion[]; theme?: PromoTheme } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const load = async () => {
      timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      try {
        const response = await fetch(`/api/promotions/${region}`, { headers: { accept: "application/json" }, credentials: "omit", signal: controller.signal });
        if (!response.ok) return;
        const parsed = parsePromotionsPayload(await response.json(), region, Date.now());
        if (parsed && parsed.items.length > 0) setData(parsed);
      } catch {
        // Promotions are complementary: any failure simply shows no button.
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

  if (!data) return null;
  return <PromoWidget region={region} items={data.items} theme={data.theme} />;
}
