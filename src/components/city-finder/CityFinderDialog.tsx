"use client";

import { useEffect, useRef, useState } from "react";
import type { FinderState } from "@/lib/catalog/city-finder-shared";
import type { RegionSlug } from "@/lib/geo/regions";
import { trackCityFinder } from "@/lib/analytics/track";
import type { CardBuy } from "@/lib/site-config/cards-schema";
import { ArrowIcon, FinderFlow, type FinderAnswer } from "./CityFinder";
import { CITY_FINDER_EVENT, type CityFinderOpen } from "./open";

/**
 * "Quero minha cidade" as a window over the page, opened by the home's state chooser set to "Escolher a cidade aqui" (`stateAction: "finder"`): it
 * opens on the state tapped, with its places, and goes on to the chosen place's designs, the same questions as the page (`FinderFlow`). The answers
 * live in the window only (the page's address does not change), and only the region's own states are offered, those of the chooser.
 *
 * ONE window per page, opened by an event (`openCityFinder`): the chooser's links stay real links. A full-screen native <dialog> (focus trap,
 * Escape and the inert page come from the platform); closing it gives the focus back to the state that opened it.
 */
export function CityFinderDialog({ region, states, buy }: { region: RegionSlug; states: readonly FinderState[]; buy?: CardBuy }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const [answer, setAnswer] = useState<FinderAnswer>({ estado: null, cidade: null });

  useEffect(() => {
    const onOpen = (event: Event) => {
      const { uf, opener: from } = (event as CustomEvent<CityFinderOpen>).detail;
      opener.current = from;
      // The start of the home's funnel (the tap itself is also the chooser's usual select_state): the window, open on this state.
      const chosen = states.find((s) => s.uf === uf.toUpperCase());
      trackCityFinder("origens_minha_cidade_state", { region, entry_point: "home_states", uf: uf.toUpperCase(), ...(chosen ? { place_count: chosen.places } : {}) });
      setAnswer({ estado: uf.toLowerCase(), cidade: null });
      if (!dialog.current?.open) dialog.current?.showModal();
      dialog.current?.scrollTo({ top: 0 });
    };
    window.addEventListener(CITY_FINDER_EVENT, onOpen);
    return () => window.removeEventListener(CITY_FINDER_EVENT, onOpen);
  }, [region, states]);

  useEffect(() => {
    // A native listener: a close by the platform (Escape) must always give the focus back.
    const node = dialog.current;
    if (!node) return;
    const onClose = () => opener.current?.focus();
    node.addEventListener("close", onClose);
    return () => node.removeEventListener("close", onClose);
  }, []);

  const go = (next: FinderAnswer) => {
    setAnswer(next);
    // A new state starts from the top of the window, where its question is.
    if (next.estado !== answer.estado) dialog.current?.scrollTo({ top: 0 });
  };

  return (
    <dialog ref={dialog} aria-label="Quero minha cidade" className="city-finder-dialog m-0 h-dvh max-h-none w-full max-w-none bg-ground p-0 text-ink backdrop:bg-black/60" data-testid="city-finder-dialog">
      <div className="finder-dialog-bar">
        <p className="font-display text-[1.375rem] font-extrabold uppercase leading-none tracking-[0.01em]">Quero minha cidade</p>
        <button type="button" onClick={() => dialog.current?.close()} className="finder-dialog-close" aria-label="Fechar" data-testid="city-finder-close">
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      </div>
      <div className="city-finder wrap finder-in-dialog">
        {/* "Trocar" on the state brings back the region's states, here in the window. */}
        <FinderFlow region={region} states={states} buy={buy} uf={answer.estado?.toUpperCase() ?? null} citySlug={answer.cidade} go={go} entry="home_states" quick={false} />
      </div>
      {/* The way back always in reach at the foot of the window, besides the X up top: it closes the window, the page stays where it was. */}
      <div className="finder-dialog-foot">
        <div className="wrap">
          <button type="button" onClick={() => dialog.current?.close()} className="btn btn-ghost finder-dialog-back" data-testid="city-finder-back">
            <ArrowIcon className="h-5 w-5" back />
            Voltar ao início
          </button>
        </div>
      </div>
    </dialog>
  );
}
