import Image from "next/image";
import Link from "next/link";
import { StateOutline } from "@/components/brand/StateOutline";
import { BannerBackground } from "@/components/banners/BannerBackground";
import { TrackedStateLink } from "@/components/analytics/TrackedStateLink";
import { SOURCES } from "@/lib/analytics/sources";
import { bannerFor, usableBannerAsset } from "@/lib/editorial/banners";
import type { StateCard } from "@/lib/home";
import { pluralCidades } from "@/lib/format";
import type { RegionSlug } from "@/lib/geo/regions";

function StateLine({ line }: { line: NonNullable<StateCard["line"]> }) {
  if (!line.href) return null;
  return (
    <a href={line.href} className="group mt-5 flex items-center gap-4 border-t border-line pt-4">
      <span className="photo relative block h-20 w-20 shrink-0">
        <Image src={line.imageUrl} alt="" fill sizes="80px" quality={70} />
      </span>
      <span>
        <span className="t-label block">{line.name}</span>
        {line.price && <span className="t-small block font-semibold">{line.price}</span>}
        <span className="t-caption block link-line">Ver na loja</span>
      </span>
    </a>
  );
}

function RegionChips({ region, uf, shown, more }: { region: RegionSlug; uf: string; shown: { name: string; slug: string; count: number }[]; more: number }) {
  if (shown.length === 0) return null;
  return (
    <div className="mt-5">
      <p className="t-label">Regiões</p>
      <ul className="mt-2 flex flex-wrap gap-2">
        {shown.map((g) => (
          <li key={g.slug}>
            <Link href={`/${region}/${uf.toLowerCase()}#${g.slug}`} className="inline-flex min-h-11 items-center border border-ink/40 px-3 text-[0.875rem] font-medium transition-colors hover:border-region-primary hover:bg-region-primary hover:text-white focus-visible:border-region-primary">
              {g.name}
              <span className="t-caption ml-2">{g.count}</span>
            </Link>
          </li>
        ))}
        {more > 0 && (
          <li>
            <Link href={`/${region}/${uf.toLowerCase()}`} className="inline-flex min-h-11 items-center px-2 text-[0.875rem] font-semibold link-static">
              +{more} regiões
            </Link>
          </li>
        )}
      </ul>
    </div>
  );
}

/**
 * States (E1 + E3): each state carries its own clean product and its editorial mesoregions as shortcuts (ADR 0004).
 * When a real photo exists it becomes the cover (never a separate banner slice); the gold accent rule sits right
 * at the seam between photo and text, olive on hover. Without a photo the card/row is plain text.
 *
 * Desktop (md+): the three-card grid. Mobile: a native accordion, one state open at a time (`name` attribute —
 * no JS needed), replacing the old horizontal swipe row, which made it hard to compare states at a glance
 * (CLAUDE_ADDENDUM_PRODUCT_STATE_SELECTOR_REDESIGNS.md). Both trees render; CSS shows the one that fits the width.
 */
export function StateCards({ region, states, title = "Escolha o seu estado" }: { region: RegionSlug; states: StateCard[]; title?: string }) {
  return (
    <section id="estados" aria-labelledby="states-title" className="wrap py-14 lg:py-24">
      <h2 id="states-title" className="t-h2">
        {title}
      </h2>

      {/* Desktop and up: three cover cards. */}
      <ul className="mt-8 hidden gap-6 md:grid md:grid-cols-3 lg:mt-12">
        {states.map((state) => {
          const shown = state.regions.slice(0, 4);
          const more = state.regions.length - shown.length;
          const cover = usableBannerAsset("state", bannerFor(region, "state", state.uf));
          return (
            <li key={state.uf}>
              <article className="flex h-full flex-col overflow-hidden">
                {cover && (
                  <div className="relative aspect-[4/3] w-full overflow-hidden bg-ground">
                    <BannerBackground asset={cover} />
                  </div>
                )}
                <div className={`flex flex-1 flex-col border-t-[3px] border-region-accent pt-5 transition-colors hover:border-region-primary ${cover ? "-mt-[3px]" : ""}`}>
                  <TrackedStateLink href={`/${region}/${state.uf.toLowerCase()}`} params={{ state: state.uf, region, source: SOURCES.stateSelector }} className="group flex items-end justify-between gap-4">
                    <div>
                      <h3 className="link-line inline text-[1.75rem] font-extrabold leading-tight tracking-tight transition-colors group-hover:text-region-primary">{state.name}</h3>
                      <p className="t-place mt-1 text-[1rem] text-ink-mute">{pluralCidades(state.cityCount)}</p>
                    </div>
                    <StateOutline uf={state.uf} className="h-20 w-24 shrink-0 text-ink" strokeWidth={1.75} />
                  </TrackedStateLink>
                  <RegionChips region={region} uf={state.uf} shown={shown} more={more} />
                  {state.line && <StateLine line={state.line} />}
                </div>
              </article>
            </li>
          );
        })}
      </ul>

      {/* Phones and tablets: an accordion, one state open at a time. */}
      <div className="mt-6 border-t border-line md:hidden">
        {states.map((state) => {
          const shown = state.regions.slice(0, 6);
          const more = state.regions.length - shown.length;
          const cover = usableBannerAsset("state", bannerFor(region, "state", state.uf));
          return (
            <details key={state.uf} name="estados-mobile" className="group border-b border-line">
              <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 py-4 [&::-webkit-details-marker]:hidden">
                <span>
                  <span className="block text-[1.1875rem] font-extrabold leading-tight tracking-tight transition-colors group-open:text-region-primary">{state.name}</span>
                  <span className="t-place mt-0.5 block text-[0.9375rem] text-ink-mute">{pluralCidades(state.cityCount)}</span>
                </span>
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 shrink-0 transition-transform group-open:rotate-180" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </summary>
              <div className="pb-6">
                {cover && (
                  <div className="relative aspect-[4/3] w-full overflow-hidden bg-ground">
                    <BannerBackground asset={cover} />
                  </div>
                )}
                <RegionChips region={region} uf={state.uf} shown={shown} more={more} />
                {state.line && <StateLine line={state.line} />}
                <TrackedStateLink href={`/${region}/${state.uf.toLowerCase()}`} params={{ state: state.uf, region, source: SOURCES.stateSelector }} className="mt-5 inline-flex min-h-11 items-center text-[0.9375rem] font-semibold link-static">
                  Ver todas as cidades de {state.name}
                </TrackedStateLink>
              </div>
            </details>
          );
        })}
      </div>
    </section>
  );
}
