"use client";

import { ProductPhoto } from "@/components/catalog/ProductPhoto";
import { SOURCES } from "@/lib/analytics/sources";
import { trackGoToUmaPenca } from "@/lib/analytics/track";
import { formatPrice } from "@/lib/format";
import { ARTICLE_KIND_LABELS, type UmaPencaArticle } from "@/lib/umapenca/types";

/**
 * One Uma Penca article (caneca, ecobag). Same card rhythm as FamilyCard — photo, accent rule, name, price — but the whole
 * card is a plain same-tab `<a>` to the verified Uma Penca product page (like every INK purchase link on the site), firing
 * GoToPenca (Meta) and `go_to_umapenca` (GA4) on the real click. Merch photos carry their own backgrounds, hence the 4:5 poster frame.
 */
export function ArticleCard({ article, region, sizes, priority = false }: { article: UmaPencaArticle; region: string; sizes: string; priority?: boolean }) {
  const current = article.salePrice ?? article.price;
  const price = formatPrice(current);
  const fullPrice = article.salePrice !== null ? formatPrice(article.price) : null;

  return (
    <a
      href={article.url}
      className="group block"
      onClick={() =>
        trackGoToUmaPenca({
          productId: article.id,
          productName: article.title,
          kind: article.kind,
          region,
          sourceSection: SOURCES.outrosArtigos,
          destinationUrl: article.url,
          ...(current !== null ? { value: current } : {}),
        })
      }
    >
      <ProductPhoto src={article.imageUrl} alt={article.title} sizes={sizes} priority={priority} poster />
      <span aria-hidden="true" className="mt-3 block h-[3px] w-6 bg-region-accent transition-colors group-hover:bg-region-primary" />
      <div className="mt-2">
        <h3 className="link-line inline text-[1.0625rem] font-bold leading-tight tracking-tight transition-colors group-hover:text-region-primary sm:text-[1.125rem]">
          {article.title}
        </h3>
        {price && (
          <p className="t-small mt-0.5 font-semibold">
            {fullPrice && (
              <>
                <s className="mr-1.5 font-normal text-ink/60">{fullPrice}</s>
                <span className="sr-only">por </span>
              </>
            )}
            {price}
          </p>
        )}
      </div>
      <p className="t-caption mt-1">{ARTICLE_KIND_LABELS[article.kind].singular} · na loja Uma Penca</p>
    </a>
  );
}
