import Image from "next/image";
import Link from "next/link";
import { StateOutline } from "@/components/brand/StateOutline";
import type { StateCard } from "@/lib/home";
import { numberPt } from "@/lib/format";
import type { RegionSlug } from "@/lib/geo/regions";

/**
 * States (E1 + E3): each card carries the state's own clean product and its IBGE intermediate regions as shortcuts.
 * Regional color is only the accent rule on top, never a surface. On phones the cards are a swipe row.
 */
export function StateCards({ region, states }: { region: RegionSlug; states: StateCard[] }) {
  return (
    <section id="estados" aria-labelledby="states-title" className="wrap py-14 lg:py-24">
      <h2 id="states-title" className="t-h2">
        Escolha o seu estado
      </h2>
      <ul className="-mx-4 mt-8 flex snap-x snap-mandatory scroll-pl-4 gap-4 overflow-x-auto px-4 pb-2 no-scrollbar md:mx-0 md:grid md:grid-cols-3 md:gap-6 md:overflow-visible md:px-0 lg:mt-12">
        {states.map((state) => {
          const shown = state.regions.slice(0, 4);
          const more = state.regions.length - shown.length;
          return (
            <li key={state.uf} className="w-[84%] shrink-0 snap-start sm:w-[46%] md:w-auto">
              <article className="flex h-full flex-col border-t-[3px] border-region pt-5">
                <Link href={`/${region}/${state.uf.toLowerCase()}`} className="group flex items-end justify-between gap-4">
                  <div>
                    <h3 className="text-[1.75rem] font-extrabold leading-tight tracking-tight link-line inline">{state.name}</h3>
                    <p className="t-place mt-1 text-[1rem] text-ink-mute">{numberPt.format(state.cityCount)} cidades</p>
                  </div>
                  <StateOutline uf={state.uf} className="h-20 w-24 shrink-0 text-ink" strokeWidth={1.75} />
                </Link>

                {shown.length > 0 && (
                  <div className="mt-5">
                    <p className="t-label">Regiões</p>
                    <ul className="mt-2 flex flex-wrap gap-2">
                      {shown.map((g) => (
                        <li key={g.slug}>
                          <Link href={`/${region}/${state.uf.toLowerCase()}#${g.slug}`} className="inline-flex min-h-11 items-center border border-ink/40 px-3 text-[0.875rem] font-medium transition-colors hover:border-ink hover:bg-ink hover:text-white">
                            {g.name}
                          </Link>
                        </li>
                      ))}
                      {more > 0 && (
                        <li>
                          <Link href={`/${region}/${state.uf.toLowerCase()}`} className="inline-flex min-h-11 items-center px-2 text-[0.875rem] font-semibold link-static">
                            +{more} regiões
                          </Link>
                        </li>
                      )}
                    </ul>
                  </div>
                )}

                {state.line?.href && (
                  <a href={state.line.href} className="group mt-5 flex items-center gap-4 border-t border-line pt-4">
                    <span className="photo relative block h-20 w-20 shrink-0">
                      <Image src={state.line.imageUrl} alt="" fill sizes="80px" quality={70} />
                    </span>
                    <span>
                      <span className="t-label block">{state.line.name}</span>
                      {state.line.price && <span className="t-small block font-semibold">{state.line.price}</span>}
                      <span className="t-caption block link-line">Ver na loja</span>
                    </span>
                  </a>
                )}
              </article>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
