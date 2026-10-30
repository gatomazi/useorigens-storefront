/**
 * A product section outside its period (CMS `period`): the Black Month calendar's suspense. Before its first day, a frosted panel over placeholder
 * cards (shapes of shirts, never the real products: nothing of the offer is in the page) with the padlock, the period and the countdown, headed by the
 * section's neutral label ("Semana 2") instead of its title, which names the offer. After its last day, the same panel saying the offer ended, under
 * the section's own title. Server-rendered: it turns when the page is regenerated after Brasília midnight.
 */
const HIGHLIGHT = "#e2b64a";

function Shirt() {
  return (
    <svg aria-hidden="true" viewBox="0 0 120 120" className="h-3/5 w-3/5" fill="currentColor">
      <path d="M42 14 22 22 8 44l16 9 8-10v63h56V43l8 10 16-9-14-22-20-8c-2 9-9 14-18 14s-16-5-18-14Z" />
    </svg>
  );
}

export function LockedShelf({ anchor, heading, subtitle, state, period, daysLeft, cards = 4, accent }: {
  anchor: string;
  heading: string;
  subtitle?: string;
  state: "locked" | "ended";
  /** "09–15/11", "a partir de 09/11"… */
  period: string | null;
  daysLeft?: number;
  cards?: number;
  /** The section's own colour (a CSS colour or gradient: the Black Week's yellow). The glass takes it, with near-black text and a black padlock. */
  accent?: string;
}) {
  const locked = state === "locked";
  const headingId = `${anchor}-title`;
  const countdown = typeof daysLeft === "number" ? (daysLeft <= 1 ? "Abre amanhã" : `Faltam ${daysLeft} dias`) : null;
  return (
    <section id={anchor} aria-labelledby={headingId} className="wrap py-12 lg:py-16" data-testid="locked-shelf" data-state={state}>
      <div className="ground-plate mb-6 w-fit max-w-2xl lg:mb-8">
        <h2 id={headingId} className="t-h2 [text-wrap:balance]">{heading}</h2>
        {subtitle && <p className="t-body mt-2.5 max-w-[60ch] text-ink-soft">{subtitle}</p>}
      </div>
      <div className="relative">
        {/* The shelf it will be: card shapes with a shirt each that the glass turns into soft glows (nothing real, so nothing to unblur). Dark cards
            with gold and grey shirts under the smoked glass; light cards with gold and black shirts under the gold one, so the gold stays bright. */}
        <ul aria-hidden="true" className={`grid grid-cols-2 gap-3 md:grid-cols-4 lg:gap-4 ${accent ? "rounded-xl bg-[#f6eedb] p-3 lg:p-4" : ""}`}>
          {Array.from({ length: cards }, (_, i) => (
            <li key={i} className={`overflow-hidden rounded-lg border ${accent ? "border-black/10 bg-[#f6eedb]" : "border-[var(--line)] bg-[var(--card-fill)]"} ${i >= 2 ? "hidden md:block" : ""}`}>
              <span className="flex aspect-[800/820] items-center justify-center" style={accent ? { background: "#efe4c6", color: i % 2 ? "#1d1d1d" : "#b8862a" } : { background: "#1c1c1c", color: i % 2 ? "#5a5a5a" : HIGHLIGHT }}>
                <Shirt />
              </span>
              <span className="block space-y-2 p-3">
                <span className="block h-3 w-3/4 rounded bg-[var(--line)]" />
                <span className="block h-3 w-1/3 rounded bg-[var(--line)]" />
              </span>
            </li>
          ))}
        </ul>
        {/* The glass, translucent and blurred over the whole shelf, with the lock in the middle: smoked (the ground's colour) or, with the section's
            own colour, gold glass (that colour as a translucent layer over the blur, a light edge catching the light). */}
        <div
          className={`absolute inset-0 flex items-center justify-center overflow-hidden rounded-xl border p-5 text-center [-webkit-backdrop-filter:blur(16px)_saturate(1.2)] [backdrop-filter:blur(16px)_saturate(1.2)] ${accent ? "on-light border-white/50 shadow-[inset_0_1px_0_rgb(255_255_255/0.6)]" : "border-white/10"}`}
          style={accent ? { color: "#111" } : { background: "color-mix(in srgb, var(--plate-solid, #111) 45%, transparent)" }}
        >
          {accent && <span aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-60" style={{ background: accent }} />}
          <div className="relative max-w-sm">
            <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full" style={accent ? { background: "#111", color: HIGHLIGHT } : locked ? { background: HIGHLIGHT, color: "#111" } : { border: "2px solid var(--line)" }}>
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="4.5" y="10.5" width="15" height="10" rx="2" />
                <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
              </svg>
            </span>
            <p className="text-[0.75rem] font-bold uppercase tabular-nums tracking-[0.12em]" style={locked && !accent ? { color: HIGHLIGHT } : undefined}>
              {locked ? period ?? "Em breve" : `Encerrada${period ? ` · ${period}` : ""}`}
            </p>
            <p className="mt-2 font-display text-[clamp(1.6rem,3vw,2.25rem)] font-extrabold uppercase leading-[0.95]">{locked ? "Oferta surpresa" : "Oferta encerrada"}</p>
            <p className={`mt-2 text-[0.9375rem] ${accent ? "" : "text-ink-soft"}`}>{locked ? (countdown ? `${countdown}. O cadeado abre à meia-noite.` : "O cadeado abre à meia-noite.") : "Veja no calendário a oferta desta semana."}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
