"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";

/**
 * A small "i" that opens a short explanation on tap or click (a toggletip), so secondary copy stays off the page without being hidden from
 * anyone: the text is announced when it opens, and Escape or a tap elsewhere closes it. The bubble is shifted left when it would cross the
 * right edge of the window. Never inside a `<label>` (a tap would also reach the input).
 */
export function InfoTip({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null);
  const bubble = useRef<HTMLSpanElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    const escape = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setOpen(false); } };
    document.addEventListener("pointerdown", away);
    // Capture, so Escape closes the bubble before it reaches an open <dialog> (which would close the full-screen view).
    document.addEventListener("keydown", escape, true);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", escape, true); };
  }, [open]);

  useLayoutEffect(() => {
    const b = bubble.current;
    if (!open || !b) return;
    b.style.translate = "";
    const over = b.getBoundingClientRect().right - (document.documentElement.clientWidth - 12);
    if (over > 0) b.style.translate = `${-over}px 0`;
  }, [open]);

  return (
    <span ref={wrap} className="relative ml-1.5 inline-flex align-middle normal-case tracking-normal">
      <button type="button" aria-label={label} aria-expanded={open} aria-controls={id} onClick={() => setOpen((v) => !v)}
        className={`-m-[0.8125rem] inline-flex items-center justify-center p-[0.8125rem] outline-offset-0 focus-visible:outline-2 focus-visible:outline-region-primary ${open ? "text-ink" : "text-ink-mute hover:text-ink"}`}>
        <svg viewBox="0 0 20 20" aria-hidden="true" className="h-[1.125rem] w-[1.125rem]" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="10" cy="10" r="8.2" /><path d="M10 9v5" strokeLinecap="round" /><circle cx="10" cy="6.2" r=".9" fill="currentColor" stroke="none" /></svg>
      </button>
      <span id={id} role="status">
        {open && <span ref={bubble} className="absolute left-0 top-full z-30 mt-2 block w-[min(17rem,calc(100vw-2rem))] bg-ink p-3 text-left text-[0.8125rem] font-normal leading-snug text-white shadow-lg">{children}</span>}
      </span>
    </span>
  );
}
