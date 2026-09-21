import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FamilyCard } from "@/components/catalog/FamilyCard";
import { VariantPicker, type VariantOption } from "@/components/catalog/VariantPicker";
import { purchaseUrl } from "@/lib/catalog/commerce";
import { resolveCity, resolveCityProduct } from "@/lib/catalog/resolver";
import { formatPrice } from "@/lib/format";
import { ENABLED_REGIONS } from "@/lib/site";

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
  return {
    title: `${resolved.family.name} de ${resolved.city.name}`,
    description: `Camiseta ${resolved.family.name} de ${resolved.city.name} (${resolved.stateName}). ${resolved.family.description}`,
    alternates: { canonical: `/${region}/${uf}/${city}/${family}` },
    openGraph: { images: [resolved.primary.imageUrl] },
  };
}

export default async function CityFamilyPage({ params }: { params: Params }) {
  const { region, uf, city: citySlug, family: familySlug } = await params;
  if (!ENABLED_REGIONS.some((r) => r === region)) notFound();

  const resolved = resolveCityProduct(region, uf, citySlug, familySlug);
  const cityData = resolveCity(region, uf, citySlug);
  if (!resolved || !cityData) notFound();

  const { city, family, primary, variants, stateName } = resolved;
  const base = `/${region}/${uf}/${city.slug}`;

  const options: VariantOption[] = [primary, ...variants].map((binding) => ({
    id: binding.inkProductId,
    label: binding.designVariant === "base" ? "Principal" : binding.variantLabel ?? binding.designVariant,
    imageUrl: binding.imageUrl,
    price: formatPrice(binding.price),
    href: purchaseUrl(binding),
  }));

  const others = cityData.families.filter((entry) => entry.family.id !== family.id);

  return (
    <>
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
          intro={
            <>
              <h1 className="text-[2.25rem] font-extrabold leading-[1.02] tracking-tight [text-wrap:balance] sm:text-[3.25rem] lg:text-[4rem]">{family.name}</h1>
              <p className="t-place mt-3 text-[1.125rem] sm:text-[1.5rem]">
                {city.name}, {stateName}
                {city.area ? ` · ${city.area}` : ""}
              </p>
              <p className="t-body mt-4 hidden max-w-md text-ink-soft sm:block">{family.description}</p>
            </>
          }
        />
      </section>

      {others.length > 0 && (
        <section aria-labelledby="other-title" className="border-t border-line">
          <div className="wrap py-14 lg:py-20">
            <h2 id="other-title" className="mb-6 text-[1.5rem] font-extrabold tracking-tight lg:text-[1.875rem]">
              Outros estilos de {city.name}
            </h2>
            <ul className="grid grid-cols-2 gap-x-4 gap-y-8 lg:grid-cols-4 lg:gap-x-6">
              {others.map((entry) => (
                <li key={entry.family.id}>
                  <FamilyCard entry={entry} href={`${base}/${entry.family.id}`} cityName={city.name} sizes="(min-width: 1024px) 22vw, 46vw" />
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}
    </>
  );
}
