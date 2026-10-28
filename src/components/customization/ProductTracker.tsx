"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { carryCampaign } from "@/lib/analytics/campaign";
import { isTerminal, type PublicProductJob } from "@/lib/customization/product-status";
import { onTrackedChange, readTracked, trackedSnapshot, untrack, updateTracked, type TrackedProduct } from "@/lib/customization/product-tracker";
import { ProductSteps } from "./ProductSteps";

const POLL_MS = 5_000;
const ShirtIcon = () => <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"><path d="M8 3.5 4 5.5 2.5 10l3 1.2V20.5h13V11.2l3-1.2L20 5.5l-4-2c-.6 1.5-2.1 2.5-4 2.5S8.6 5 8 3.5Z" /></svg>;
const SHIRT_PATH = "M8 3.5 4 5.5 2.5 10l3 1.2V20.5h13V11.2l3-1.2L20 5.5l-4-2c-.6 1.5-2.1 2.5-4 2.5S8.6 5 8 3.5Z";
/** While a shirt is being made: the small shirt inside two arrows that turn around it (still with reduced motion). */
const WorkingIcon = () => (
  <span aria-hidden="true" className="relative inline-flex h-7 w-7 shrink-0 items-center justify-center">
    <svg viewBox="0 0 24 24" className="absolute inset-0 h-7 w-7 motion-safe:animate-[spin_1.6s_linear_infinite]" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" /><path d="M8 16H3v5" />
    </svg>
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round"><path d={SHIRT_PATH} /></svg>
  </span>
);

/**
 * The floating reminder of a direct purchase that is still being made, on every page of the site: the customer chose "Continuar navegando" (or
 * left the page) and the server goes on. It follows the jobs kept in this browser, glows and shakes once a shirt is ready and opens a small panel with the
 * steps and "Ver minha camiseta". Bottom centre, between the coupons (left) and the help chat (right), above the cookie bar while it shows. It
 * stays quiet while a dialog of the page is open (the waiting screen itself) and while the tab is hidden.
 */
export function ProductTracker() {
  const raw = useSyncExternalStore(onTrackedChange, trackedSnapshot, () => "");
  const items = useMemo<TrackedProduct[]>(() => (raw ? readTracked() : []), [raw]);
  const [open, setOpen] = useState(false);
  const [bottom, setBottom] = useState(0);
  const pending = items.filter((p) => !isTerminal(p.status));
  const pendingIds = pending.map((p) => p.id).join(",");

  useEffect(() => {
    if (!pendingIds) return;
    const timer = setInterval(() => {
      if (document.visibilityState !== "visible" || document.querySelector("dialog[open]")) return;
      for (const id of pendingIds.split(",")) {
        fetch(`/api/personalizar/produto/${id}`, { cache: "no-store" })
          .then((res) => (res.ok ? (res.json() as Promise<PublicProductJob>) : null))
          .then((job) => job && updateTracked(job))
          .catch(() => undefined);
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [pendingIds]);

  // Above the cookie bar while it shows, like the coupons and the help chat.
  useEffect(() => {
    let observer: ResizeObserver | null = null;
    const measure = () => {
      const banner = document.querySelector<HTMLElement>("[data-consent-banner]");
      setBottom(banner && banner.getClientRects().length > 0 ? Math.ceil(banner.getBoundingClientRect().height) : 0);
      return banner;
    };
    const frame = requestAnimationFrame(() => {
      const banner = measure();
      if (banner && typeof ResizeObserver !== "undefined") { observer = new ResizeObserver(measure); observer.observe(banner); }
    });
    return () => { cancelAnimationFrame(frame); observer?.disconnect(); };
  }, [items.length]);

  if (!items.length) return null;
  const ready = items.filter((p) => p.status === "ready" && p.url);
  // Short: on a phone the button sits between the coupons and the help chat (about 14 rem).
  const label = ready.length ? (ready.length > 1 ? `${ready.length} camisetas prontas!` : "Camiseta pronta!") : pending.length ? "Criando camiseta…" : "Sua camiseta";
  const lift = `calc(max(1rem, env(safe-area-inset-bottom)) + ${bottom}px)`;

  return (
    <div data-product-tracker>
      {open && (
        // The panel takes the phone's width (the button is narrow); on a larger screen, 22 rem over the button.
        <div role="dialog" aria-label="Sua camiseta" className="fixed inset-x-4 z-40 max-h-[min(70dvh,32rem)] overflow-y-auto border-2 border-ink bg-paper p-4 text-ink shadow-[0_18px_40px_rgb(0_0_0/0.28)] sm:inset-x-auto sm:left-1/2 sm:w-[22rem] sm:-translate-x-1/2" style={{ bottom: `calc(${lift} + 3.75rem)` }}>
          <div className="flex items-center justify-between gap-3">
            <p className="t-h3">{items.length > 1 ? "Suas camisetas" : "Sua camiseta"}</p>
            <button type="button" className="min-h-11 px-2 text-[0.9375rem] font-bold underline underline-offset-4" onClick={() => setOpen(false)}>Fechar</button>
          </div>
          <ul className="mt-2 space-y-4">
            {items.map((p) => (
              <li key={p.id} className="border-t border-line pt-3">
                <p className="font-bold leading-tight">{p.label}<span className="block text-[0.875rem] font-normal text-ink-mute">com “{p.surname}”</span></p>
                {p.status === "ready" && p.url ? (
                  <div className="mt-2 space-y-2">
                    {/* eslint-disable-next-line @next/next/no-img-element -- INK's product photo, shown small */}
                    {p.image && <img src={p.image} alt="" className="mx-auto h-40 w-auto bg-ground object-contain" />}
                    <a className="btn w-full" href={carryCampaign(p.url)} onClick={() => untrack(p.id)}>Ver minha camiseta</a>
                  </div>
                ) : isTerminal(p.status) ? (
                  <p className="mt-2 text-[0.9375rem]">Não deu para criar agora. <a className="font-bold underline underline-offset-4" href={p.page}>Voltar à página</a> e pedir o link à equipe.</p>
                ) : (
                  <div className="mt-2"><ProductSteps status={p.status} surname={p.surname} /></div>
                )}
                <button type="button" className="mt-2 min-h-11 text-[0.875rem] text-ink-mute underline underline-offset-4" onClick={() => untrack(p.id)}>Tirar da lista</button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} style={{ bottom: lift }}
        className={`fixed left-1/2 z-40 flex min-h-12 max-w-[calc(100vw-11rem)] -translate-x-1/2 items-center justify-center gap-2 whitespace-nowrap border-2 px-3 text-[0.875rem] font-bold shadow-[0_8px_24px_rgb(0_0_0/0.22)] ${ready.length ? "uo-attention border-[var(--region-primary)] bg-[var(--region-primary)] text-white" : "border-ink bg-paper text-ink"}`}>
        {!ready.length && pending.length > 0 ? <WorkingIcon /> : <ShirtIcon />}
        <span className="truncate">{label}</span>
        {!ready.length && pending.length > 0 && <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-[#d8a800] motion-safe:animate-pulse" />}
      </button>
    </div>
  );
}
