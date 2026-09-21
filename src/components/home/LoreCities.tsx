import Link from "next/link";
import { ProductPhoto } from "@/components/catalog/ProductPhoto";
import { SearchDialog } from "@/components/search/SearchDialog";
import type { LoreCityCard } from "@/lib/home";
import type { RegionSlug } from "@/lib/geo/regions";
import { numberPt } from "@/lib/format";

/**
 * A small set of cities that really have a local expression in the catalog (never a filler list).
 * Each carries its IBGE intermediate region as factual microcontext. The rest of the cities live in search
 * and in the state pages.
 */
export function LoreCities({ region, cities, totalCities }: { region: RegionSlug; cities: LoreCityCard[]; totalCities: number }) {
  if (cities.length === 0) return null;
  return (
    <section id="cidades" aria-labelledby="cities-title" className="wrap py-14 lg:py-24">
      <h2 id="cities-title" className="t-h2 max-w-2xl">
        Cidades para começar
      </h2>
      <p className="t-body mt-3 max-w-xl text-ink-soft">Estas têm expressão própria estampada. Outras {numberPt.format(totalCities - cities.length)} estão a uma busca de distância.</p>
      <ul className="mt-8 grid grid-cols-2 gap-x-4 gap-y-8 lg:mt-12 lg:grid-cols-4 lg:gap-x-6">
        {cities.map((c) => (
          <li key={`${c.uf}-${c.slug}`}>
            <Link href={`/${region}/${c.uf}/${c.slug}`} className="group block">
              <ProductPhoto src={c.items[0].imageUrl} alt={`Camiseta com a expressão “${c.items[0].text}”, de ${c.name}`} sizes="(min-width: 1024px) 23vw, 46vw" />
              <h3 className="mt-3 text-[1.25rem] font-extrabold leading-tight tracking-tight link-line inline">{c.name}</h3>
              <p className="t-place mt-1 text-[1rem]">“{c.items[0].text}”</p>
              {c.area && <p className="t-caption mt-1">{c.area}</p>}
            </Link>
          </li>
        ))}
      </ul>
      <div className="t-small mt-8 flex flex-wrap items-center gap-x-2">
        <span>Não é nenhuma delas?</span>
        <SearchDialog region={region} variant="link" />
      </div>
    </section>
  );
}
