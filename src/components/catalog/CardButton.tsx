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

/**
 * The other style of the same button (`CardBuy.style === "fab"`): a small round cart over the bottom-right corner of the card's picture, the way INK's
 * own store draws it. Like the bar, it is NOT a second link: it sits inside the card's link (a child of `ProductPhoto`), so it opens the same product
 * page and the click is reported once. The label stays as its accessible name (read with the card) and as the tooltip. Always ink on the picture's
 * grey, whatever the section's tone: it sits on the photo, never on the section's ground.
 */
export function CardFab({ label }: { label: string }) {
  return (
    <span
      title={label}
      data-testid="card-fab"
      className="pointer-events-none absolute bottom-2 right-2 z-[1] flex h-10 w-10 items-center justify-center rounded-full bg-ink text-white shadow-[0_2px_8px_rgb(0_0_0/0.18)] transition-transform duration-200 group-hover:scale-110 sm:bottom-3 sm:right-3 sm:h-11 sm:w-11"
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-[1.15rem] w-[1.15rem] sm:h-5 sm:w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 4h2l2.4 10.2a1 1 0 0 0 1 .8h8.9a1 1 0 0 0 1-.76L20 8H6.2" />
        <circle cx="9.5" cy="19" r="1.3" />
        <circle cx="17" cy="19" r="1.3" />
      </svg>
      <span className="sr-only">{label}</span>
    </span>
  );
}
