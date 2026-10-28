"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useSyncExternalStore, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { getFavorites, subscribeFavorites } from "@/lib/favorites/store";
import { trackSelectState } from "@/lib/analytics/track";
import { SOURCES } from "@/lib/analytics/sources";
import type { NavBlockData, NavItemData } from "@/lib/site-config/navigation";
import { highlightProps } from "./menu-highlight";

/**
 * The hierarchy of the menu, drawn from resolved blocks (`resolveNavigation`): "Comprar", the region's states, the other regions. One
 * presentational component for the real drawer AND the admin preview, so what the editor sees is what the visitor gets. `interactive={false}`
 * (the preview) renders inert text instead of links: nothing in a preview navigates or reports an event.
 */
export function MobileMenuPanel({ blocks, interactive = true, onNavigate }: { blocks: NavBlockData[]; interactive?: boolean; onNavigate?: (item: NavItemData) => void }) {
  const prefix = useId();
  return (
    <nav aria-label="Menu principal" data-testid="mobile-menu-nav">
      {blocks.map((block, index) => {
        const headingId = `${prefix}-${block.kind}`;
        const primary = block.kind === "primary";
        // "Comprar" leads at the largest size; states a step down; the collections ("Categorias") read in two columns at a lighter size, since there
        // can be a dozen of them; the other regions are a short row of chips. The menu stays one screen tall instead of a long single column.
        const itemClass =
          block.kind === "categories"
            ? "text-[1.0625rem] font-semibold leading-snug"
            : block.kind === "regions"
              ? "border-2 border-current/60 px-3 text-[0.9375rem] font-semibold leading-none"
              : primary
                ? "text-[1.625rem] font-bold leading-tight tracking-tight"
                : "text-[1.25rem] font-semibold leading-snug";
        const listClass = block.kind === "categories" ? "grid grid-cols-2 gap-x-4" : block.kind === "regions" ? "flex flex-wrap gap-2 pt-1" : "space-y-0.5";
        return (
          <div key={block.kind} role="group" aria-labelledby={headingId} data-block={block.kind} className={index === 0 ? "" : "mt-7 border-t border-current/25 pt-5"}>
            <h2 id={headingId} className="mb-2 flex items-center gap-2.5 text-[0.8125rem] font-semibold uppercase leading-none tracking-[0.14em]">
              <span aria-hidden="true" className="inline-block h-[3px] w-5" style={{ background: "var(--region-accent, currentColor)" }} />
              {block.label}
            </h2>
            <ul className={listClass}>
              {block.items.map((item) => {
                // A state: its UF before the name and its number of places under it; a collection with a description (CMS): a full row, the
                // description under the name. Everything else: the label alone. One link per entry either way.
                const rich = Boolean(item.badge || item.detail);
                const content = rich ? (
                  <>
                    {item.badge && <span aria-hidden="true" className="w-11 shrink-0 font-display text-[1.5rem] font-extrabold uppercase leading-none opacity-75">{item.badge}</span>}
                    <span className="min-w-0">
                      <span className="block">{item.label}</span>
                      {item.detail && <span className="mt-0.5 block text-[0.875rem] font-normal leading-snug opacity-80">{item.detail}</span>}
                    </span>
                  </>
                ) : (
                  item.label
                );
                // A highlighted collection (CMS): its button and text colours, and its line always drawn (no hover on a phone).
                const rowClass = `flex min-h-11 items-center py-1 ${rich ? "gap-3 py-1.5" : ""} ${itemClass} ${item.highlight ? "menu-highlight menu-highlight-static" : ""}`;
                const highlight = highlightProps(item.highlight);
                return (
                  <li key={item.href} className={`min-w-0 ${block.kind === "categories" && item.detail ? "col-span-2" : ""}`}>
                    {interactive ? (
                      <Link href={item.href} onClick={() => onNavigate?.(item)} className={rowClass} {...highlight}>
                        {content}
                      </Link>
                    ) : (
                      <span className={rowClass} {...highlight}>{content}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

const CLOSE_ICON = (
  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
    <path d="M5 5l14 14M19 5L5 19" />
  </svg>
);

/**
 * Full-screen menu for small screens, built on a native modal <dialog>: the rest of the page is inert while it is open (a real focus trap) and
 * Escape closes it. On top of that: the first focus lands on the menu itself (predictable, no stray ring on the close control), focus returns to the
 * button that opened it, the page behind does not scroll, and the close row stays put while the list scrolls (safe areas respected).
 */
export function MobileMenu({ blocks, search, account = [], favorites }: {
  blocks: NavBlockData[];
  /** "Sua cidade": the city journey (place, design, piece on one screen), first thing in the menu. */
  search?: ReactNode;
  /** "Sua conta": the store's account links (AccountMenu), last in the menu; on phones the header has no room for a fourth icon. */
  account?: { label: string; href: string }[];
  /** "Meus Lugares" (its page): right under the search. On phones it is not in the header (the search field takes the middle). */
  favorites?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const searchHeading = useId();
  const accountHeading = `${searchHeading}-conta`;
  const pathname = usePathname();
  const saved = useSyncExternalStore(subscribeFavorites, () => getFavorites().length, () => 0);

  // Any navigation closes the menu, also one that did not come from its own links (a city chosen in the search opened from it, back/forward).
  useEffect(() => {
    if (dialog.current?.open) dialog.current.close();
  }, [pathname]);

  useEffect(() => {
    // Rotating a tablet or widening the window past the mobile layout closes the drawer instead of leaving it over the desktop header.
    const wide = window.matchMedia("(min-width: 1024px)");
    const close = () => wide.matches && dialog.current?.open && dialog.current.close();
    wide.addEventListener("change", close);
    return () => wide.removeEventListener("change", close);
  }, []);

  function open() {
    dialog.current?.showModal();
    document.documentElement.style.overflow = "hidden";
    panel.current?.focus({ preventScroll: true });
  }

  // Focus trap: the modal dialog already makes the page inert, but Tab past either end would otherwise leave for the browser's own controls.
  // Wrapping keeps keyboard and screen-reader users inside the menu until they close it.
  function trapTab(event: React.KeyboardEvent<HTMLDialogElement>) {
    if (event.key !== "Tab") return;
    // The search sheet opened from the menu is a dialog of its own (nested in this one's DOM): its own Tab order, never this trap's.
    if (event.target instanceof Element && event.target.closest("dialog") !== event.currentTarget) return;
    const focusable = [...event.currentTarget.querySelectorAll<HTMLElement>("a[href], button:not([disabled])")];
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) return;
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === panel.current)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function onClose() {
    document.documentElement.style.overflow = "";
    trigger.current?.focus(); // browsers restore focus on their own; the explicit call covers the ones that do not
  }

  return (
    <>
      <button ref={trigger} type="button" onClick={open} aria-haspopup="dialog" className="inline-flex min-h-11 min-w-11 items-center justify-center lg:hidden">
        <span className="sr-only">Abrir menu</span>
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </button>

      <dialog ref={dialog} aria-label="Menu" onClose={onClose} onKeyDown={trapTab} className="nav-menu m-0 h-dvh max-h-none w-full max-w-none p-0 backdrop:bg-black">
        <div className="flex h-full flex-col">
          <div className="flex shrink-0 justify-end px-5 pt-[max(0.5rem,env(safe-area-inset-top))]">
            <button type="button" onClick={() => dialog.current?.close()} aria-label="Fechar menu" className="nav-menu-close -mr-2 inline-flex min-h-11 min-w-11 items-center justify-center gap-2 px-2 text-[1rem] font-semibold">
              Fechar
              {CLOSE_ICON}
            </button>
          </div>
          <div ref={panel} tabIndex={-1} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-3 outline-none">
            {search && (
              <div role="group" aria-labelledby={searchHeading} data-block="search" className="mb-7 border-b border-current/25 pb-6">
                <h2 id={searchHeading} className="mb-3 flex items-center gap-2.5 text-[0.8125rem] font-semibold uppercase leading-none tracking-[0.14em]">
                  <span aria-hidden="true" className="inline-block h-[3px] w-5" style={{ background: "var(--region-accent, currentColor)" }} />
                  Sua cidade
                </h2>
                {search}
              </div>
            )}
            {favorites && (
              <Link href={favorites} onClick={() => dialog.current?.close()} className="mb-7 flex min-h-12 items-center gap-3 border-b border-current/25 pb-6 text-[1.25rem] font-semibold leading-snug" data-testid="menu-favorites">
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 20.5s-7.5-4.6-10-9.3C.6 7.8 2.4 4.5 5.7 4c2-.3 3.9.6 5 2.2C11.8 4.6 13.7 3.7 15.7 4c3.3.5 5.1 3.8 3.7 7.2-2.5 4.7-10 9.3-10 9.3Z" />
                </svg>
                Meus Lugares
                {saved > 0 && (
                  <span className="ml-auto inline-flex h-7 min-w-7 items-center justify-center border-2 border-current px-1.5 text-[0.875rem] font-bold leading-none">
                    {saved}
                    <span className="sr-only"> {saved === 1 ? "estampa salva" : "estampas salvas"}</span>
                  </span>
                )}
              </Link>
            )}
            <MobileMenuPanel
              blocks={blocks}
              onNavigate={(item) => {
                if (item.trackState) trackSelectState({ ...item.trackState, source: SOURCES.stateSelector });
                dialog.current?.close();
              }}
            />
            {account.length > 0 && (
              <div role="group" aria-labelledby={accountHeading} data-block="account" className="mt-7 border-t border-current/25 pt-5">
                <h2 id={accountHeading} className="mb-2 flex items-center gap-2.5 text-[0.8125rem] font-semibold uppercase leading-none tracking-[0.14em]">
                  <span aria-hidden="true" className="inline-block h-[3px] w-5" style={{ background: "var(--region-accent, currentColor)" }} />
                  Sua conta
                </h2>
                <ul className="space-y-0.5">
                  {account.map((l) => (
                    <li key={l.label}>
                      {/* The store's own pages (plain links: the region and the campaign go along on the click, CampaignCarry). */}
                      <a href={l.href} onClick={() => dialog.current?.close()} className="flex min-h-11 items-center py-1 text-[1.25rem] font-semibold leading-snug">
                        {l.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </dialog>
    </>
  );
}
