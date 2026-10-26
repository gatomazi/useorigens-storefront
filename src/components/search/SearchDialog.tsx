"use client";

import { useRef, useState } from "react";
import type { RegionSlug } from "@/lib/geo/regions";
import { SOURCES } from "@/lib/analytics/sources";
import { placeSearchCopy } from "@/lib/search/copy";
import { TYPING_STILL } from "@/lib/search/typing-hint";
import { GlobalSearch, SearchIcon } from "./GlobalSearch";
import { TypingHint } from "./TypingHint";

/**
 * The global search (places, designs, collections) as a native modal <dialog> (focus trap and Esc come from the platform): a full-screen sheet
 * on phones, a wide sheet on larger screens. Its triggers: the header icon, the hero field, the field under a heading of its own (`field`, a
 * city page's "Busque outra cidade"), a quiet text link next to styles shown on an example (`link`, "Encontre aqui a sua cidade") and the first word of
 * the header's menu (`nav`, "Sua cidade") and, on phones, the field in the middle of the header (`bar`, "Busque por lugar…", typing what it finds).
 * A field low on a page opens the sheet instead of searching inline, so the phone keyboard never covers the results.
 */
export function SearchDialog({
  region,
  variant = "header",
  source,
  label = "Busque a sua cidade",
  arrow = false,
  labelled = true,
  tone,
}: {
  region: RegionSlug;
  variant?: "header" | "hero" | "field" | "cta" | "link" | "nav" | "bar";
  /** `hero` / `field`: the owner's colour for the field's frame and its arrow button, and the mark on that button (CMS `heroColors.field`). */
  tone?: { frame: string; arrow: string };
  /** GA4 `source` for select_city when a result is chosen; defaults to the trigger's own (hero or dialog). */
  source?: string;
  /** The words of the `link` and `nav` triggers. */
  label?: string;
  /** `hero` / `field`: the field ends in a solid square with an arrow (the editorial opening) instead of the word "Buscar". Still one button. */
  arrow?: boolean;
  /** `header`: the word next to the magnifier from 640px (the menu's "Ícones do topo"); otherwise the icon only, the word for screen readers and the tooltip. */
  labelled?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const copy = placeSearchCopy(region);
  // The search only mounts while the dialog is open: its input autofocuses on mount.
  const [isOpen, setIsOpen] = useState(false);

  const open = () => {
    setIsOpen(true);
    ref.current?.showModal();
  };
  const close = () => ref.current?.close();

  return (
    <>
      {variant === "hero" || variant === "field" ? (
        <button
          type="button"
          onClick={open}
          aria-haspopup="dialog"
          className="group flex min-h-16 w-full items-center gap-3 border-2 border-ink bg-white px-4 text-left text-ink transition-colors hover:border-region-primary hover:bg-paper sm:min-h-[4.5rem] sm:px-5"
          style={tone ? { borderColor: tone.frame } : undefined}
        >
          <SearchIcon className="h-6 w-6 shrink-0" />
          <span className="flex-1 text-[1.0625rem] font-medium text-ink-mute sm:text-[1.1875rem]">{variant === "hero" ? copy.hero : copy.field}</span>
          {arrow ? (
            // Drawn inside the one button (it opens the same sheet): a mark of the action, not a second control.
            <span aria-hidden="true" className="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center bg-ink text-white transition-colors group-hover:bg-region-primary sm:-mr-3 sm:h-12 sm:w-12" style={tone ? { background: tone.frame, color: tone.arrow } : undefined}>
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </span>
          ) : (
            <span className="hidden text-[0.9375rem] font-semibold sm:inline">Buscar</span>
          )}
        </button>
      ) : variant === "cta" ? (
        <button type="button" onClick={open} aria-haspopup="dialog" className="btn btn-light">
          Encontrar minha cidade
        </button>
      ) : variant === "nav" ? (
        // A word in the header's menu ("Sua cidade"): it opens the search, so it is a button, drawn like the menu's links.
        <button type="button" onClick={open} aria-haspopup="dialog" className="inline-flex min-h-11 items-center whitespace-nowrap py-1 text-[0.9375rem] font-semibold" data-testid="header-city-search">
          <span className="link-line">{label}</span>
        </button>
      ) : variant === "bar" ? (
        // Phones only (the store is a search): a field in the middle of the header. It opens the same sheet, whose real field takes the focus; the
        // words it types are decoration, its name is the still text.
        <button
          type="button"
          onClick={open}
          aria-haspopup="dialog"
          aria-label={TYPING_STILL}
          className="flex h-10 min-w-0 flex-1 items-center gap-1.5 border-2 border-white bg-white px-2.5 text-left text-ink min-[360px]:gap-2 min-[360px]:px-3 sm:hidden"
          data-testid="header-search-bar"
        >
          <SearchIcon className="h-[18px] w-[18px] shrink-0" />
          <span className="min-w-0 flex-1 truncate text-[0.875rem] text-ink-mute min-[360px]:text-[0.9375rem]">
            <TypingHint />
          </span>
        </button>
      ) : variant === "link" ? (
        <button type="button" onClick={open} aria-haspopup="dialog" className="link-static inline-flex min-h-11 items-center gap-1.5 font-semibold">
          <SearchIcon className="h-4 w-4 shrink-0" />
          {label}
        </button>
      ) : (
        <button type="button" onClick={open} className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 px-2 font-semibold sm:px-3" aria-haspopup="dialog" title={labelled ? undefined : copy.trigger}>
          <SearchIcon className="h-5 w-5" />
          {labelled && <span className="hidden sm:inline">{copy.trigger}</span>}
          <span className={labelled ? "sr-only sm:hidden" : "sr-only"}>{copy.trigger}</span>
        </button>
      )}

      <dialog
        ref={ref}
        aria-label={copy.dialog}
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
          {isOpen && <GlobalSearch region={region} autoFocus sticky onNavigate={close} source={source ?? (variant === "hero" ? SOURCES.heroSearch : SOURCES.searchDialog)} />}
        </div>
      </dialog>
    </>
  );
}
