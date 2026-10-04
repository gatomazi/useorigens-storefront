import { isUmaPencaSource, type PublishedBundle, type ScopeDoc } from "../site-config/schema";
import type { ArticleKind } from "./types";

export type CreateYourOwnCard = {
  id: string;
  href: string;
  title: string;
  description?: string;
  image: { src: string; width: number; height: number; variants?: { w: number; src: string }[]; alt: string };
};

/**
 * The "Crie a sua" cards of one article kind on `/<region>/outros-artigos`: the region's PUBLISHED, active Uma Penca models of that kind, in the
 * CMS order. Pure. Same rules as a carousel's customizer card (src/lib/site-config/resolve.ts): a model without a mockup, whose image is not in
 * the bundle, or of another region is simply left out — never a broken card.
 */
export function createYourOwnCards(doc: ScopeDoc | undefined, media: PublishedBundle["media"], region: string, kind: ArticleKind): CreateYourOwnCard[] {
  if (!doc || doc.scope !== region) return [];
  return (doc.customizers ?? []).flatMap((model) => {
    if (!model.active || !model.pageMockup || !isUmaPencaSource(model.source) || model.source.articleKind !== kind) return [];
    const ref = model.cardImage ?? model.pageMockup;
    const info = media[ref.assetId];
    if (!info) return [];
    return [
      {
        id: model.id,
        href: `/${region}/personalizar/${model.slug}`,
        title: model.name,
        ...(model.description ? { description: model.description } : {}),
        image: { src: info.src, width: info.width, height: info.height, ...(info.variants ? { variants: info.variants } : {}), alt: ref.decorative ? "" : ref.alt || model.name },
      },
    ];
  });
}
