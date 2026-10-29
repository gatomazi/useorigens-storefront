import type { RegionSlug } from "../geo/regions";
import { customizerHref } from "../site-config/pages";
import { isUmaPencaSource, type PublishedBundle, type ScopeDoc } from "../site-config/schema";
import type { CreateYourOwnCard } from "../umapenca/customizer-cards";

/** The region's page with every personalized print: `/<region>/personalizar`. */
export const personalizationHubHref = (region: RegionSlug): string => `/${region}/personalizar`;

/**
 * The cards of the personalization page: the region's PUBLISHED, active models with the art editor (the surname, the plate…), in the CMS order.
 * Pure. Same rules as the "Crie a sua" cards (src/lib/umapenca/customizer-cards.ts): a model without a mockup, whose image is not in the bundle,
 * or of another region is left out — never a broken card. Uma Penca models stay on "Outros artigos"; the old text-only request forms are not
 * listed. With direct purchase on, the card shows the shirt price.
 */
export function personalizationCards(doc: ScopeDoc | undefined, media: PublishedBundle["media"], region: RegionSlug): CreateYourOwnCard[] {
  if (!doc || doc.scope !== region) return [];
  return (doc.customizers ?? []).flatMap((model) => {
    if (!model.active || !model.pageMockup || isUmaPencaSource(model.source) || !model.studioArts?.length) return [];
    const ref = model.cardImage ?? model.pageMockup;
    const info = media[ref.assetId];
    if (!info) return [];
    const direct = model.directPurchase?.enabled ? model.directPurchase : undefined;
    return [
      {
        id: model.id,
        href: customizerHref(region, model),
        title: model.name,
        ...(model.description ? { description: model.description } : {}),
        ...(direct ? { price: `R$ ${direct.price.replace(".", ",")}` } : {}),
        image: { src: info.src, width: info.width, height: info.height, ...(info.variants ? { variants: info.variants } : {}), alt: ref.decorative ? "" : ref.alt || model.name },
      },
    ];
  });
}
