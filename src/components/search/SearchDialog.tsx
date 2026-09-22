"use client";

import { useRef, useState } from "react";
import type { RegionSlug } from "@/lib/geo/regions";
import { CitySearch } from "./CitySearch";

function SearchIcon({ className }: { className: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.2">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" strokeLinecap="round" />
    </svg>
  );
}

/**
 * City search as a native modal <dialog> (focus trap and Esc come from the platform): a full-screen sheet
 * on phones, a wide sheet on larger screens. Two triggers share it: the header icon and the hero field.
 */
export function SearchDialog({ region, variant = "header" }: { region: RegionSlug; variant?: "header" | "hero" | "cta" | "link" }) {
  const ref = useRef<HTMLDialogElement>(null);
  // The search only mounts while the dialog is open: its input autofocuses on mount.
  const [isOpen, setIsOpen] = useState(false);

  const open = () => {
    setIsOpen(true);
    ref.current?.showModal();
  };
  const close = () => ref.current?.close();

  return (
    <>
      {variant === "hero" ? (
        <button
          type="button"
          onClick={open}
          aria-haspopup="dialog"
          className="group flex min-h-16 w-full items-center gap-3 border-2 border-ink bg-white px-4 text-left text-ink transition-colors hover:border-region-primary hover:bg-paper sm:min-h-[4.5rem] sm:px-5"
        >
          <SearchIcon className="h-6 w-6 shrink-0" />
          <span className="flex-1 text-[1.0625rem] font-medium text-ink-mute sm:text-[1.1875rem]">Busque sua cidade…</span>
          <span className="hidden text-[0.9375rem] font-semibold sm:inline">Buscar</span>
        </button>
      ) : variant === "cta" ? (
        <button type="button" onClick={open} aria-haspopup="dialog" className="btn btn-light">
          Encontrar minha cidade
        </button>
      ) : variant === "link" ? (
        <button type="button" onClick={open} aria-haspopup="dialog" className="link-static min-h-11 font-semibold">
          Busque a sua cidade
        </button>
      ) : (
        <button type="button" onClick={open} className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 px-2 font-semibold sm:px-3" aria-haspopup="dialog">
          <SearchIcon className="h-5 w-5" />
          <span className="hidden sm:inline">Buscar cidade</span>
          <span className="sr-only sm:hidden">Buscar cidade</span>
        </button>
      )}

      <dialog
        ref={ref}
        aria-label="Buscar cidade"
        onClose={() => setIsOpen(false)}
        onClick={(event) => event.target === ref.current && close()}
        className="search-sheet m-0 h-dvh max-h-none w-full max-w-none overflow-y-auto bg-ground p-0 text-ink backdrop:bg-black/60 sm:mx-auto sm:mt-0 sm:h-auto sm:max-h-[86dvh] sm:max-w-4xl"
      >
        <div className="px-5 pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] sm:px-10 sm:pb-12 sm:pt-6">
          <div className="mb-6 flex items-center justify-between sm:mb-10">
            {/* Same headline copy as the hero (RegionHero.tsx) — this label was missed when the hero's own H1 was updated. */}
            <p className="t-label">O seu lugar, do seu jeito.</p>
            <button type="button" onClick={close} className="inline-flex min-h-11 items-center gap-2 font-semibold" aria-label="Fechar busca">
              Fechar
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <path d="M5 5l14 14M19 5L5 19" />
              </svg>
            </button>
          </div>
          {isOpen && <CitySearch region={region} autoFocus onNavigate={close} />}
        </div>
      </dialog>
    </>
  );
}
