import type { CreateYourOwnCard as Card } from "@/lib/umapenca/customizer-cards";

/**
 * "Crie a sua": the first card of a kind on "Outros artigos", leading to the model's personalization form. Same look as a carousel's customizer
 * card (ProductCarousel): the CMS mockup in the poster frame, the "Personalizável" tag, and a call to action instead of a price.
 */
export function CreateYourOwnCard({ card, sizes, priority = false }: { card: Card; sizes: string; priority?: boolean }) {
  return (
    <a href={card.href} className="group block" aria-label={`${card.title}. Crie a sua: você escolhe o texto (não é um produto pronto da loja).`}>
      <span className="photo photo-poster">
        {/* eslint-disable-next-line @next/next/no-img-element -- a CMS upload served pre-sized from the media origin (never through the image optimizer) */}
        <img
          src={card.image.variants?.[Math.min(1, card.image.variants.length - 1)]?.src ?? card.image.src}
          srcSet={card.image.variants?.map((v) => `${v.src} ${v.w}w`).join(", ")}
          sizes={sizes}
          width={card.image.width}
          height={card.image.height}
          alt={card.image.alt}
          loading={priority ? "eager" : "lazy"}
          className="absolute inset-0 h-full w-full object-cover"
        />
        <span className="absolute left-2 top-2 bg-ink px-2 py-1 text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-white">Personalizável</span>
      </span>
      <span aria-hidden="true" className="mt-3 block h-[3px] w-6 bg-region-accent transition-colors group-hover:bg-region-primary" />
      <div className="mt-2">
        <h3 className="link-line inline text-[1.0625rem] font-bold leading-tight tracking-tight transition-colors group-hover:text-region-primary sm:text-[1.125rem]">{card.title}</h3>
        {card.description && <p className="t-caption mt-1">{card.description}</p>}
        <p className="t-small mt-1 font-semibold underline decoration-region-accent decoration-2 underline-offset-4">Crie a sua →</p>
      </div>
    </a>
  );
}
