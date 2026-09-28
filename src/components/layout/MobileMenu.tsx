"use client";

import Link from "next/link";
import { useEffect, useId, useRef } from "react";
import { trackSelectState } from "@/lib/analytics/track";
import { SOURCES } from "@/lib/analytics/sources";
import type { NavBlockData, NavItemData } from "@/lib/site-config/navigation";

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
        const itemClass = primary ? "text-[1.625rem] font-bold leading-tight tracking-tight" : "text-[1.25rem] font-semibold leading-snug";
        return (
          <div key={block.kind} role="group" aria-labelledby={headingId} data-block={block.kind} className={index === 0 ? "" : "mt-9 border-t border-current/25 pt-6"}>
            <h2 id={headingId} className="mb-2 flex items-center gap-2.5 text-[0.8125rem] font-semibold uppercase leading-none tracking-[0.14em]">
              <span aria-hidden="true" className="inline-block h-[3px] w-5" style={{ background: "var(--region-accent, currentColor)" }} />
              {block.label}
            </h2>
            <ul className="space-y-0.5">
              {block.items.map((item) => (
                <li key={item.href}>
                  {interactive ? (
                    <Link href={item.href} onClick={() => onNavigate?.(item)} className={`flex min-h-11 items-center py-1 ${itemClass}`}>
                      {item.label}
                    </Link>
                  ) : (
                    <span className={`flex min-h-11 items-center py-1 ${itemClass}`}>{item.label}</span>
                  )}
                </li>
              ))}
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
export function MobileMenu({ blocks }: { blocks: NavBlockData[] }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

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
            <MobileMenuPanel
              blocks={blocks}
              onNavigate={(item) => {
                if (item.trackState) trackSelectState({ ...item.trackState, source: SOURCES.stateSelector });
                dialog.current?.close();
              }}
            />
          </div>
        </div>
      </dialog>
    </>
  );
}
