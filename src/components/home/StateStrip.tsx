import type { ReactNode } from "react";
import { TrackedStateLink } from "@/components/analytics/TrackedStateLink";
import { SOURCES } from "@/lib/analytics/sources";
import type { StateCard } from "@/lib/home";
import type { RegionSlug } from "@/lib/geo/regions";

/**
 * The state chooser as a band (CMS `variant: "strip"`): one entry per state with products, each ONE link (UF, name and the call with the number of
 * places), so the whole entry opens the state page and nothing inside it looks clickable without being so. Every entry has the same grid (a fixed
 * column for the UF), so a long name ("Rio Grande do Sul") never pushes the call out of line with its neighbours.
 *
 * Desktop: the heading, then the states side by side in equal columns between hairlines (from 1280px the heading takes a column of its own). Phones and
 * tablets below 768px: one row per state, full width, at least 64px tall. The band's hairlines and its background (the section's own, CMS) run edge to
 * edge; only the content keeps to the page container.
 */
export function StateStrip({
  region,
  states,
  title,
  subtitle,
  anchor = "estados",
  headingId = "states-title",
  backdrop,
  className,
}: {
  region: RegionSlug;
  states: StateCard[];
  title: string;
  subtitle?: string;
  anchor?: string;
  headingId?: string;
  backdrop?: ReactNode;
  className?: string;
}) {
  return (
    <section id={anchor} aria-labelledby={headingId} className={["relative isolate border-y border-line", className].filter(Boolean).join(" ")}>
      {backdrop}
      <div className="wrap grid gap-x-10 gap-y-3 py-6 md:gap-y-4 lg:py-8 xl:grid-cols-[minmax(12rem,1fr)_minmax(0,3.4fr)] xl:items-center">
        <div>
          {/* A quiet label, not a headline: the band is a path to the states, and the opening above it carries the page's voice. */}
          <h2 id={headingId} className="text-[0.8125rem] font-semibold uppercase leading-snug tracking-[0.14em] text-ink-soft">
            {title}
          </h2>
          {subtitle && <p className="t-small mt-1.5 max-w-sm text-ink-soft">{subtitle}</p>}
        </div>
        <ul className="grid border-t border-line md:grid-cols-3 md:border-l md:border-t-0">
          {states.map((state) => (
            <li key={state.uf} className="border-b border-line md:border-b-0 md:border-r">
              <TrackedStateLink
                href={`/${region}/${state.uf.toLowerCase()}`}
                params={{ state: state.uf, region, source: SOURCES.stateSelector }}
                className="group grid min-h-16 grid-cols-[3.25rem_minmax(0,1fr)] items-center gap-x-3 py-3 transition-colors hover:bg-black/[0.035] active:bg-black/[0.06] md:min-h-[5.5rem] md:grid-cols-[3.75rem_minmax(0,1fr)] md:px-5 md:py-4"
              >
                {/* The region's accent when it reads on the page (theme), else its primary colour. */}
                <span aria-hidden="true" className="font-display text-[2.25rem] font-extrabold uppercase leading-none tracking-[0.01em] text-[var(--region-accent-ink,var(--region-primary))] md:text-[2.75rem]">
                  {state.uf}
                </span>
                <span className="min-w-0">
                  <span className="block text-[1.0625rem] font-bold leading-tight md:text-[1.125rem]">{state.name}</span>
                  <span className="mt-1 inline-flex items-center gap-1 text-[0.875rem] font-semibold leading-tight underline decoration-region-accent decoration-2 underline-offset-4 transition-colors group-hover:decoration-current">
                    Ver {state.localityLabel}
                    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12h14M13 6l6 6-6 6" />
                    </svg>
                  </span>
                </span>
              </TrackedStateLink>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
