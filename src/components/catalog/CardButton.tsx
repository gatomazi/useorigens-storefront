/**
 * The buy button at the foot of a product card, in the store's own CTA shape (rectangular, solid, uppercase). It is NOT a second link: it sits inside
 * the card's own link, so it opens the same product page and the click is reported once, exactly as without it. The card's `group` drives the hover.
 * `className`: on the wrapper (`mt-auto` keeps the buttons of a row on one line when the texts above them differ in height).
 */
export function CardButton({ label, dark = false, className = "" }: { label: string; dark?: boolean; className?: string }) {
  return (
    <span className={`block pt-2.5 ${className}`}>
      <span
        className={`flex min-h-11 w-full items-center justify-center border-2 px-3 text-center text-[0.8125rem] font-bold uppercase leading-tight tracking-[0.04em] transition-colors ${dark ? "border-white bg-white text-black group-hover:bg-transparent group-hover:text-white" : "border-ink bg-ink text-white group-hover:bg-transparent group-hover:text-ink"}`}
      >
        {label}
      </span>
    </span>
  );
}
