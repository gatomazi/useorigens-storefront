"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export type BrowserCity = { n: string; s: string };
export type BrowserGroup = { name: string; slug: string; cities: BrowserCity[] };

/**
 * Cities of a state, by IBGE intermediate region (default) or A–Z. Groups are collapsed <details> so a state
 * with 500 cities is a short page on a phone; the chips jump to (and open) a group, and a `#region-slug`
 * link from the home opens it too.
 */
export function StateCityBrowser({ region, uf, groups, letters }: { region: string; uf: string; groups: BrowserGroup[]; letters: BrowserGroup[] }) {
  const [mode, setMode] = useState<"regiao" | "az">("regiao");
  const list = mode === "regiao" ? groups : letters;

  useEffect(() => {
    // Opening a <details> is a DOM operation on a platform element, not React state.
    const openFromHash = () => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      const el = id ? document.getElementById(id) : null;
      if (el instanceof HTMLDetailsElement) {
        el.open = true;
        el.scrollIntoView({ block: "start" });
      }
    };
    openFromHash();
    window.addEventListener("hashchange", openFromHash);
    return () => window.removeEventListener("hashchange", openFromHash);
  }, [mode]);

  return (
    <section aria-label="Cidades do estado" className="wrap pb-16 lg:pb-24">
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-6">
        <div role="group" aria-label="Organizar as cidades" className="inline-flex">
          {(
            [
              ["regiao", "Por região"],
              ["az", "A–Z"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-pressed={mode === key}
              onClick={() => setMode(key)}
              className="min-h-11 border-2 border-ink px-4 text-[0.9375rem] font-semibold transition-colors first:border-r-0 aria-pressed:bg-ink aria-pressed:text-white"
            >
              {label}
            </button>
          ))}
        </div>
        <p className="t-caption">{mode === "regiao" ? "Divisão do IBGE (2017)" : "Ordem alfabética"}</p>
      </div>

      <ul className="-mx-4 mt-5 flex gap-2 overflow-x-auto px-4 pb-1 no-scrollbar sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0" aria-label={mode === "regiao" ? "Ir para a região" : "Ir para a letra"}>
        {list.map((g) => (
          <li key={g.slug} className="shrink-0">
            <a href={`#${g.slug}`} className="inline-flex min-h-11 items-center border border-ink/40 px-3 text-[0.875rem] font-medium transition-colors hover:border-ink hover:bg-ink hover:text-white">
              {g.name}
              <span className="t-caption ml-2">{g.cities.length}</span>
            </a>
          </li>
        ))}
      </ul>

      <div className="mt-6">
        {list.map((g) => (
          <details key={`${mode}-${g.slug}`} id={g.slug} className="group border-t border-line py-1 last:border-b">
            <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 [&::-webkit-details-marker]:hidden">
              <span className="text-[1.125rem] font-extrabold tracking-tight sm:text-[1.25rem]">{g.name}</span>
              <span className="flex items-center gap-3">
                <span className="t-place text-[0.95rem] text-ink-mute">{g.cities.length} cidades</span>
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 transition-transform group-open:rotate-180" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </span>
            </summary>
            <ul className="grid grid-cols-2 gap-x-4 pb-5 pt-1 sm:grid-cols-3 lg:grid-cols-4">
              {g.cities.map((c) => (
                <li key={c.s}>
                  <Link href={`/${region}/${uf}/${c.s}`} className="link-line flex min-h-11 items-center text-[0.9375rem]">
                    {c.n}
                  </Link>
                </li>
              ))}
            </ul>
          </details>
        ))}
      </div>
    </section>
  );
}
