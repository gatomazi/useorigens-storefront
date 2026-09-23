"use client";

import Link from "next/link";
import { useRef } from "react";
import { trackSelectState } from "@/lib/analytics/track";
import { SOURCES } from "@/lib/analytics/sources";

export type NavItem = {
  label: string;
  href: string;
  external?: boolean;
  /** Present only for the three state entries inlined into this flat mobile list (SiteChrome.tsx) — plain,
   * serializable data (not a function: this component is rendered from a Server Component, which can't pass
   * callbacks as props) so `select_state` can still fire from here, same as the desktop Regiões dropdown. */
  trackState?: { state: string; region: string };
};

/** Full-screen menu for small screens, built on a native modal <dialog>. */
export function MobileMenu({ items }: { items: NavItem[] }) {
  const ref = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button type="button" onClick={() => ref.current?.showModal()} aria-haspopup="dialog" className="inline-flex min-h-11 min-w-11 items-center justify-center lg:hidden">
        <span className="sr-only">Abrir menu</span>
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </button>

      <dialog ref={ref} aria-label="Menu" className="m-0 h-dvh max-h-none w-full max-w-none bg-ink p-0 text-white backdrop:bg-black">
        <div className="flex h-full flex-col p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))]">
          <div className="flex justify-end">
            <button type="button" onClick={() => ref.current?.close()} className="inline-flex min-h-11 items-center gap-2 font-semibold text-white" aria-label="Fechar menu">
              Fechar
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <path d="M5 5l14 14M19 5L5 19" />
              </svg>
            </button>
          </div>
          <nav aria-label="Menu principal" className="mt-6 flex flex-1 flex-col gap-1">
            {items.map((item) =>
              item.external ? (
                <a key={item.href} href={item.href} className="min-h-11 py-2 text-[2rem] font-extrabold leading-tight tracking-tight text-white">
                  {item.label}
                </a>
              ) : (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => {
                    if (item.trackState) trackSelectState({ ...item.trackState, source: SOURCES.stateSelector });
                    ref.current?.close();
                  }}
                  className="min-h-11 py-2 text-[2rem] font-extrabold leading-tight tracking-tight text-white"
                >
                  {item.label}
                </Link>
              ),
            )}
          </nav>
        </div>
      </dialog>
    </>
  );
}
