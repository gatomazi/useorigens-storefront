import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FamilyGrid } from "@/components/catalog/FamilyGrid";
import { VariantPicker, type VariantOption } from "@/components/catalog/VariantPicker";
import { SOURCES } from "@/lib/analytics/sources";
import { purchaseUrl } from "@/lib/catalog/commerce";
import { resolveCity, resolveCityProduct } from "@/lib/catalog/resolver";
import { formatPrice } from "@/lib/format";
import { isRegionSlug } from "@/lib/geo/regions";
import { isRegionLaunched } from "@/lib/regions/launched";
import { JsonLd } from "@/components/seo/JsonLd";
import { familyDescription, familyTitle } from "@/lib/seo/copy";
import { breadcrumbList } from "@/lib/seo/jsonld";
import { pageOpenGraph } from "@/lib/seo/open-graph";
import { SITE_URL } from "@/lib/site";
import { inkProductShare } from "@/lib/share/server";

export const revalidate = 3600;

// No pages are prebuilt: each one is rendered on first request, then cached and revalidated (ISR).
export function generateStaticParams() {
  return [];
}

type Params = Promise<{ region: string; uf: string; city: string; family: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { region, uf, city, family } = await params;
  const resolved = resolveCityProduct(region, uf, city, family);
  if (!resolved) return {};
  const title = familyTitle(resolved.family, resolved.city);
  const description = familyDescription(resolved.family, resolved.city);
  const path = `/${region}/${uf}/${city}/${family}`;
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: pageOpenGraph({ title: `${title} | Use Origens`, description, path, imageUrl: resolved.primary.imageUrl }),
  };
}

export default async function CityFamilyPage({ params }: { params: Params }) {
  const { region, uf, city: citySlug, family: familySlug } = await params;
  if (!isRegionSlug(region) || !isRegionLaunched(region)) notFound();

  const resolved = resolveCityProduct(region, uf, citySlug, familySlug);
  const cityData = resolveCity(region, uf, citySlug);
  if (!resolved || !cityData) notFound();

  const { city, family, primary, variants, stateName } = resolved;
  const base = `/${region}/${uf}/${city.slug}`;

  const options: VariantOption[] = [primary, ...variants].map((binding) => {
    const label = binding.designVariant === "base" ? "Principal" : binding.variantLabel ?? binding.designVariant;
    return {
      id: binding.inkProductId,
      label,
      imageUrl: binding.imageUrl,
      price: formatPrice(binding.price),
      rawPrice: binding.price,
      href: purchaseUrl(binding),
      // Each version shares its own real INK product page (this page opens on the primary one, so it cannot stand for a version).
      share: inkProductShare(binding, `${family.name} – ${city.name}${binding.designVariant === "base" ? "" : ` (${label})`}`),
    };
  });

  const others = cityData.families.filter((entry) => entry.family.id !== family.id);

  return (
    <>
      <JsonLd
        data={breadcrumbList(SITE_URL, [
          { name: resolved.region.name, path: `/${region}` },
          { name: stateName, path: `/${region}/${uf}` },
          { name: city.name, path: base },
          { name: family.name, path: `${base}/${family.id}` },
        ])}
      />
      <section className="wrap pb-16 pt-5 lg:pb-24 lg:pt-6" aria-label={`Camiseta ${family.name} de ${city.name}`}>
        <nav aria-label="Você está em" className="t-caption mb-5 lg:mb-8">
          <Link href={`/${region}`} className="link-static">
            {resolved.region.name}
          </Link>
          <span aria-hidden="true"> / </span>
          <Link href={`/${region}/${uf}`} className="link-static">
            {stateName}
          </Link>
          <span aria-hidden="true"> / </span>
          <Link href={base} className="link-static">
            {city.name}
          </Link>
          <span aria-hidden="true"> / </span>
          <span aria-current="page">{family.name}</span>
        </nav>
        <VariantPicker
          options={options}
          alt={`Camiseta ${family.name} de ${city.name}`}
          storeName={`Use ${resolved.region.name}`}
          city={city.name}
          stateUf={city.uf}
          familyId={family.id}
          productName={family.name}
          sourceSection={SOURCES.pdp}
          intro={
            <>
              <h1 className="text-[2.25rem] font-extrabold leading-[1.02] tracking-tight [text-wrap:balance] sm:text-[3.25rem] lg:text-[4rem]">{family.name}</h1>
              <p className="t-place mt-3 text-[1.125rem] sm:text-[1.5rem]">
                {city.name}, {stateName}
                {/* Editorial mesoregion (ADR 0004), same microcontext as the city page — never the current IBGE division. An administrative region says what it is. */}
                {city.type === "administrative_region" ? " · Região Administrativa" : city.meso ? ` · ${city.meso}` : ""}
              </p>
              <p className="t-body mt-4 hidden max-w-md text-ink-soft sm:block">{family.description}</p>
            </>
          }
        />
      </section>

      {others.length > 0 && (
        <section aria-labelledby="other-title" className="border-t border-line">
          <div className="wrap py-14 lg:py-20">
            <h2 id="other-title" className="mb-6 text-[1.5rem] font-extrabold tracking-tight lg:mb-10 lg:text-[1.875rem]">
              Outros estilos de {city.name}
            </h2>
            <FamilyGrid entries={others} hrefBase={base} cityName={city.name} stateUf={city.uf} sourceSection={SOURCES.pdpOtherStyles} directToInk />
          </div>
        </section>
      )}
    </>
  );
}
