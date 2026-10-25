"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import type { AssistantReply } from "@/lib/assistant/engine";

/**
 * Asks the region's assistant whether it is on (`GET /api/assistente/<region>`, the same endpoint the INK Worker reads) AFTER the page is ready (idle),
 * and only then loads the chat's code. Fail-open by construction: off, an error, a timeout or an invalid answer renders nothing at all (no button,
 * no reserved space, no retry loop). Nothing of the page waits for it.
 */
const AssistantWidget = dynamic(() => import("./AssistantWidget"), { ssr: false });

const FETCH_TIMEOUT_MS = 4000;
const IDLE_FALLBACK_MS = 1500;

export function AssistantFab({ region }: { region: string }) {
  const [boot, setBoot] = useState<{ opening: AssistantReply; whatsapp?: string } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const load = async () => {
      timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      try {
        const response = await fetch(`/api/assistente/${region}`, { headers: { accept: "application/json" }, credentials: "omit", signal: controller.signal });
        if (!response.ok) return;
        const data = (await response.json()) as { v?: number; region?: string; enabled?: boolean; opening?: AssistantReply; whatsapp?: unknown };
        const whatsapp = typeof data.whatsapp === "string" && data.whatsapp.startsWith("https://wa.me/") ? data.whatsapp : undefined;
        if (data.v === 1 && data.region === region && data.enabled === true && data.opening?.v === 1 && typeof data.opening.text === "string") setBoot({ opening: data.opening, whatsapp });
      } catch {
        // The assistant is complementary: any failure simply shows no button.
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

  if (!boot) return null;
  return <AssistantWidget region={region} opening={boot.opening} whatsapp={boot.whatsapp} />;
}
