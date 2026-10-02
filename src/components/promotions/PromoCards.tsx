import type { PublicPromotion } from "@/lib/site-config/promotions";

/**
 * The cards of the "Cupons e ofertas" panel. Presentational only: every word comes from the CMS item (title, code, description, optional callout and tag);
 * nothing commercial is written here, and no line is drawn for an empty field. The storefront button and the CMS preview render THIS component, so the
 * preview is the real thing. A coupon is a ticket (code in a dashed box + Copiar); an announcement has no code and a quieter, tinted surface.
 */
export type CopyState = { id: string; status: "copied" | "failed" } | null;

export function PromoList({ items, copy, onCopy }: { items: readonly PublicPromotion[]; copy: CopyState; onCopy: (item: PublicPromotion, codeEl: HTMLElement | null) => void }) {
  return (
    <ul className="flex flex-col gap-3" data-testid="promo-list">
      {items.map((item) => (item.type === "coupon" ? <CouponCard key={item.id} item={item} copy={copy?.id === item.id ? copy.status : null} onCopy={onCopy} /> : <PromotionCard key={item.id} item={item} />))}
    </ul>
  );
}

function CouponCard({ item, copy, onCopy }: { item: PublicPromotion; copy: "copied" | "failed" | null; onCopy: (item: PublicPromotion, codeEl: HTMLElement | null) => void }) {
  const codeId = `promo-code-${item.id}`;
  return (
    <li className="border-2 border-ink bg-white p-4 text-ink" data-promo-type="coupon" data-promo-id={item.id}>
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-display text-[1.375rem] font-extrabold uppercase leading-[0.95] tracking-[0.01em] [overflow-wrap:anywhere]">{item.title}</h3>
        {item.badgeLabel && <span className="mt-0.5 shrink-0 bg-[var(--promo-bg)] px-1.5 py-0.5 text-[0.6875rem] font-bold uppercase leading-tight tracking-[0.06em] text-[var(--promo-fg)]">{item.badgeLabel}</span>}
      </div>
      <div className="mt-3 flex items-stretch">
        <span id={codeId} className="flex min-h-11 min-w-0 flex-1 select-all items-center border-2 border-r-0 border-dashed border-ink px-3 font-mono text-[1rem] font-bold tracking-[0.08em] [overflow-wrap:anywhere]" data-testid="promo-code">
          {item.code}
        </span>
        <button
          type="button"
          onClick={(e) => onCopy(item, e.currentTarget.parentElement?.querySelector<HTMLElement>(`#${codeId}`) ?? null)}
          aria-describedby={codeId}
          className="min-h-11 shrink-0 border-2 border-ink bg-ink px-4 text-[0.8125rem] font-bold uppercase tracking-[0.06em] text-white transition-colors duration-200 hover:bg-white hover:text-ink"
          data-testid="promo-copy"
        >
          {copy === "copied" ? "Copiado" : "Copiar"}
        </button>
      </div>
      {copy === "failed" && <p className="mt-2 text-[0.8125rem] font-semibold" role="status">Não deu para copiar automaticamente: o código está selecionado, copie com o menu do aparelho.</p>}
      <p className="mt-3 text-[0.9375rem] leading-snug">{item.description}</p>
      {item.callout && <p className="mt-1.5 text-[0.8125rem] leading-snug text-ink-mute" data-testid="promo-callout">{item.callout}</p>}
    </li>
  );
}

function PromotionCard({ item }: { item: PublicPromotion }) {
  return (
    <li className="border-l-4 border-[var(--promo-bg)] bg-[rgb(0_0_0/0.045)] px-4 py-3.5 text-ink" data-promo-type="promotion" data-promo-id={item.id}>
      <h3 className="text-[1.0625rem] font-extrabold leading-tight tracking-[-0.01em] [overflow-wrap:anywhere]">{item.title}</h3>
      <p className="mt-1 text-[0.9375rem] leading-snug">{item.description}</p>
      {item.callout && <p className="mt-1.5 text-[0.8125rem] leading-snug text-ink-mute" data-testid="promo-callout">{item.callout}</p>}
    </li>
  );
}

/** The ticket icon of the button (stroke follows the text colour). */
export function TicketIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M3 8.5V6a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v2.5a2.5 2.5 0 0 0 0 5V18a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-4.5a2.5 2.5 0 0 0 0-5Z" />
      <path d="M14.5 5v2M14.5 11v2M14.5 17v2" />
    </svg>
  );
}
