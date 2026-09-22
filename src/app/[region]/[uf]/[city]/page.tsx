import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StateOutline } from "@/components/brand/StateOutline";
import { FamilyGrid } from "@/components/catalog/FamilyGrid";
import { ProductPhoto } from "@/components/catalog/ProductPhoto";
import { RegionalPhotoSection } from "@/components/banners/RegionalPhotoSection";
import { purchaseUrl } from "@/lib/catalog/commerce";
import { getCatalog } from "@/lib/catalog/repository";
import { resolveCity } from "@/lib/catalog/resolver";
import { bannerFor, usableBannerAsset } from "@/lib/editorial/banners";
import { formatPrice } from "@/lib/format";
import { citiesOfSameArea } from "@/lib/geo/cities";
import { ENABLED_REGIONS } from "@/lib/site";

export const revalidate = 3600;

// No pages are prebuilt: each one is rendered on first request, then cached and revalidated (ISR).
export function generateStaticParams() {
  return [];
}

type Params = Promise<{ region: string; uf: string; city: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { region, uf, city } = await params;
  const resolved = resolveCity(region, uf, city);
  if (!resolved) return {};
  const { name } = resolved.city;
  return {
    title: `Camisetas de ${name}, ${resolved.city.uf}`,
    description: `Escolha como vestir ${name} (${resolved.stateName}): camisetas com o nome, o mapa e as coordenadas da cidade.`,
    alternates: { canonical: `/${region}/${uf}/${city}` },
  };
}

export default async function CityPage({ params }: { params: Params }) {
  const { region, uf, city: citySlug } = await params;
  if (!ENABLED_REGIONS.some((r) => r === region)) notFound();
  const resolved = resolveCity(region, uf, citySlug);
  if (!resolved) notFound();

  const { city, stateName, families, localities } = resolved;
  const base = `/${region}/${uf}/${city.slug}`;
  const catalog = getCatalog();

  // Local voice: real expression / patron-saint products of this municipality. No content, no section.
  const lore = (catalog.lore(city.regionSlug).byCity.get(city.id) ?? []).flatMap((item) => {
    const href = purchaseUrl(item.product);
    return href ? [{ ...item, href }] : [];
  });

  // Same IBGE intermediate region, alphabetical neighbours of this city.
  const covered = catalog.coveredCityIds(city.regionSlug);
  const sameArea = citiesOfSameArea(city)
    .filter((c) => covered.has(c.id))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const at = sameArea.findIndex((c) => c.name.localeCompare(city.name, "pt-BR") > 0);
  const start = Math.max(0, (at === -1 ? sameArea.length : at) - 5);
  const neighbours = sameArea.slice(start, start + 10);

  // A real city photo (never one that names the city — the H1 already does that) ambients the header itself,
  // instead of sitting as its own banner slice between the header and "Estilos" (docs/decisions/0003).
  const cityPhoto = usableBannerAsset("city", bannerFor(city.regionSlug, "city"));

  return (
    <>
      <section className="relative isolate">
        {cityPhoto && <RegionalPhotoSection asset={cityPhoto} priority />}
        <div className={`wrap pb-8 pt-5 lg:pb-12 lg:pt-6 ${cityPhoto ? "pb-14 lg:pb-20" : ""}`}>
          <nav aria-label="Você está em" className="t-caption regional-caption">
            <Link href={`/${region}`} className="link-static">
              {resolved.region.name}
            </Link>
            <span aria-hidden="true"> / </span>
            <Link href={`/${region}/${uf}`} className="link-static">
              {stateName}
            </Link>
            <span aria-hidden="true"> / </span>
            <span aria-current="page">{city.name}</span>
          </nav>

          <div className="mt-6 flex items-end justify-between gap-6">
            <div className="min-w-0">
              <h1 className="t-city">{city.name}</h1>
              <p className="t-place mt-4 text-[1.125rem] sm:text-[1.5rem]">
                {stateName}
                {city.area ? ` · ${city.area}` : ""}
              </p>
            </div>
            <StateOutline uf={city.uf} className="hidden h-44 w-56 shrink-0 text-ink lg:block" strokeWidth={2} />
          </div>
        </div>
      </section>

      <section aria-labelledby="styles-title" className="wrap pb-14 lg:pb-20">
        <h2 id="styles-title" className="mb-6 text-[1.5rem] font-extrabold tracking-tight lg:mb-10 lg:text-[1.875rem]">
          Estilos
        </h2>
        {families.length > 0 ? (
          <FamilyGrid entries={families} hrefBase={base} cityName={city.name} />
        ) : (
          <p className="t-body max-w-xl">Ainda não temos camisetas de {city.name} na loja. Volte em breve ou escolha outra cidade da região.</p>
        )}
      </section>

      {lore.length > 0 && (
        <section aria-labelledby="lore-title" className="paper">
          <div className="wrap py-12 lg:py-16">
            <h2 id="lore-title" className="text-[1.5rem] font-extrabold tracking-tight lg:text-[1.875rem]">
              Fala de {city.name}
            </h2>
            <ul className="mt-6 grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-4 lg:gap-x-6">
              {lore.map((item) => (
                <li key={item.product.inkProductId}>
                  <a href={item.href} className="group block">
                    <ProductPhoto src={item.product.imageUrl} alt={`${item.text}, ${city.name}`} sizes="(min-width: 768px) 22vw, 46vw" />
                    <p className="t-h3 link-line mt-3 inline">{item.text}</p>
                    <p className="t-place mt-0.5 text-[0.95rem] text-ink-mute">{item.kind === "padroeiro" ? "Padroeiro" : "Expressão"} · {city.name}</p>
                    {formatPrice(item.product.price) && <p className="t-small mt-0.5 font-semibold">{formatPrice(item.product.price)}</p>}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {localities.length > 0 && (
        <section aria-labelledby="also-title" className="wrap py-12 lg:py-16">
          <h2 id="also-title" className="text-[1.25rem] font-extrabold tracking-tight">
            Lugares de {city.name}
          </h2>
          <ul className="mt-5 flex flex-wrap gap-x-6 gap-y-5">
            {localities.map((item) => {
              const href = purchaseUrl(item);
              const price = formatPrice(item.price);
              const content = (
                <>
                  <span className="photo relative block h-24 w-24 shrink-0 sm:h-28 sm:w-28">
                    <ProductPhoto src={item.imageUrl} alt={`Camiseta de ${item.localityLabel}, em ${city.name}`} sizes="112px" />
                  </span>
                  <span className="self-center">
                    <span className="t-place block text-[1.125rem]">{item.localityLabel}</span>
                    {price && <span className="t-small block font-semibold">{price}</span>}
                  </span>
                </>
              );
              return <li key={item.inkProductId}>{href ? <a href={href} className="group flex items-center gap-4">{content}</a> : <div className="flex items-center gap-4">{content}</div>}</li>;
            })}
          </ul>
        </section>
      )}

      {neighbours.length > 0 && (
        <section aria-labelledby="more-title" className="wrap pb-16 pt-4 lg:pb-24">
          <div className="border-t border-line pt-8">
            <h2 id="more-title" className="text-[1.25rem] font-extrabold tracking-tight">
              Mais da {city.area}
            </h2>
            <ul className="mt-4 flex flex-wrap gap-2">
              {neighbours.map((c) => (
                <li key={c.id}>
                  <Link href={`/${region}/${uf}/${c.slug}`} className="inline-flex min-h-11 items-center border border-ink/40 px-3 text-[0.9375rem] font-medium transition-colors hover:border-ink hover:bg-ink hover:text-white">
                    {c.name}
                  </Link>
                </li>
              ))}
              <li>
                <Link href={`/${region}/${uf}#${city.areaSlug}`} className="link-static inline-flex min-h-11 items-center px-2 text-[0.9375rem] font-semibold">
                  Ver toda a região
                </Link>
              </li>
            </ul>
          </div>
        </section>
      )}
    </>
  );
}
