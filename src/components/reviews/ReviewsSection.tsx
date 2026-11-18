import type { InkReviewsPage } from "@/lib/reviews/parse";
import { allReviewsUrl } from "@/lib/reviews/source";
import { ReviewCarousel } from "./ReviewCarousel";
import { ReviewPhotoStrip } from "./ReviewPhotoStrip";
import { summaryLine } from "./summaryLine";

/**
 * Social proof from the store's real reviews on INK (src/lib/reviews): the customers' photos ("Quem usa, recomenda!") and the featured reviews
 * ("O que nossos clientes dizem"), each shown only when there is enough of it. The caller passes what `homeReviews` returned (never null here).
 */
export function ReviewsSection({ data }: { data: InkReviewsPage }) {
  const hasPhotos = data.photos.length > 0;
  const hasCards = data.reviews.length > 0;
  return (
    <section id="avaliacoes" aria-label="Avaliações de clientes" className="paper">
      <div className="wrap py-14 lg:py-24">
        {hasPhotos && <ReviewPhotoStrip photos={data.photos} intro="Fotos enviadas por quem já vestiu." />}
        {hasCards && (
          <div className={hasPhotos ? "mt-14 lg:mt-20" : undefined}>
            <ReviewCarousel reviews={data.reviews} intro={summaryLine(data)} viewAllHref={allReviewsUrl()} />
          </div>
        )}
      </div>
    </section>
  );
}
