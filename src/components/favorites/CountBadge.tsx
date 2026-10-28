"use client";

import { useEffect, useRef } from "react";

const SEEN_KEY = "uo:estampas-contadas";
/** The hop of the latest growth, shared by every circle on the page (the first one to see it records it as seen for the others). */
let hop: { count: number; until: number } | null = null;

/**
 * The number of saved estampas in a small circle (like the bag's), on the heart of the header, the menu button of a phone and the menu's own
 * item. When the number grows during the visit (a personalized shirt got ready and went into "Minhas Estampas", a heart was tapped) the circle
 * hops once, so the customer notices; a number already seen in this tab does not hop again on every page. Nothing for a screen reader: each
 * place says the count in words itself.
 */
export function CountBadge({ count, className = "" }: { count: number; className?: string }) {
  const badge = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    // 0 is also what the page renders first (the server does not know the list): never a reference, or every page would hop.
    if (count <= 0) return;
    let seen = Number.NaN;
    try { seen = Number(sessionStorage.getItem(SEEN_KEY) ?? Number.NaN); } catch { return; /* storage blocked: never hops */ }
    const now = Date.now();
    if (count > seen) hop = { count, until: now + 1000 }; // NaN (first count of the visit) is never exceeded: no hop, just recorded
    if (count !== seen) {
      try { sessionStorage.setItem(SEEN_KEY, String(count)); } catch { /* ignore */ }
    }
    const node = badge.current;
    if (node && hop?.count === count && now < hop.until) {
      node.classList.remove("count-hop");
      void node.offsetWidth; // restart the animation when it hops twice in a row
      node.classList.add("count-hop");
    }
  }, [count]);
  if (count <= 0) return null;
  return (
    <span ref={badge} aria-hidden="true" className={`flex h-[1.125rem] min-w-[1.125rem] items-center justify-center rounded-full bg-white px-1 text-[0.6875rem] font-bold leading-none text-ink tabular-nums ${className}`}>
      {count}
    </span>
  );
}
