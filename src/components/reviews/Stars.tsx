/**
 * The rating as five stars: `rating` of them filled in the store's gold (the `#e2b64a` of the weekly checkpoints and the locked shelf), the rest a pale
 * grey so "4 de 5" still reads. Read aloud once ("5 de 5 estrelas"), never star by star.
 */
export function Stars({ rating, className = "h-4 w-4" }: { rating: number; className?: string }) {
  return (
    <span role="img" aria-label={`${rating} de 5 estrelas`} className="inline-flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <svg key={n} aria-hidden="true" viewBox="0 0 24 24" className={`${className} ${n <= rating ? "text-[#e2b64a]" : "text-ink/20"}`} fill="currentColor">
          <path d="M12 2.5l2.94 6.1 6.56.9-4.8 4.62 1.2 6.63L12 17.64 6.1 20.75l1.2-6.63L2.5 9.5l6.56-.9L12 2.5z" />
        </svg>
      ))}
    </span>
  );
}
