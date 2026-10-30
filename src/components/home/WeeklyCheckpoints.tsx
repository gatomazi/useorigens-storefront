import type { CSSProperties } from "react";
import { dayMonth, type CheckpointState } from "@/lib/site-config/checkpoints";

export type CheckpointView = {
  label: string;
  caption?: string;
  cta: string;
  /** Null while locked (the destination is never sent before its day) or when it cannot be resolved here. */
  href: string | null;
  external: boolean;
  opensAt?: string;
  highlight: boolean;
  state: CheckpointState;
};

/** The block in evidence (the week of Black Friday itself): the yellow of the Black Friday opening. */
const HIGHLIGHT = "#e2b64a";

function Padlock({ open }: { open: boolean }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4.5" y="10.5" width="15" height="10" rx="2" />
      <path d={open ? "M8 10.5V7a4 4 0 0 1 7.6-1.7" : "M8 10.5V7a4 4 0 0 1 8 0v3.5"} />
    </svg>
  );
}

/**
 * "Checkpoints semanais": a progress bar (one segment per week, yellow once open) over one card per week. A locked week shows only its name, a
 * padlock and the day it opens (the offer is a surprise: no caption, no link); an open one shows what is on offer and leads to it; the week running
 * now says so. Phones: the cards one under the other; from 1024px, side by side, the one in evidence a little wider. Server-rendered: the lock turns
 * when the page is regenerated after Brasília midnight.
 */
export function WeeklyCheckpoints({ anchor, headingId, title, subtitle, items }: { anchor: string; headingId: string; title: string; subtitle?: string; items: CheckpointView[] }) {
  const opened = items.filter((it) => it.state !== "locked").length;
  const cols = { "--cp-cols": items.map((it) => (it.highlight ? "1.35fr" : "1fr")).join(" "), "--cp-n": `repeat(${items.length}, minmax(0, 1fr))` } as CSSProperties;
  return (
    <section id={anchor} aria-labelledby={headingId} className="wrap py-14 lg:py-24" data-testid="checkpoints">
      <div className="ground-plate mb-8 w-fit max-w-2xl lg:mb-10">
        <h2 id={headingId} className="t-h2">{title}</h2>
        {subtitle && <p className="t-body mt-3 text-ink-soft">{subtitle}</p>}
      </div>
      <div style={cols}>
        <p className="sr-only">{opened} de {items.length} semanas liberadas.</p>
        <div aria-hidden="true" className="mb-4 grid grid-cols-[var(--cp-n)] gap-1.5 lg:grid-cols-[var(--cp-cols)] lg:gap-4">
          {items.map((it, i) => (
            <span key={i} className="h-1.5 rounded-full" style={{ background: it.state === "locked" ? "var(--line)" : HIGHLIGHT }} />
          ))}
        </div>
        <ol className="grid gap-3 lg:grid-cols-[var(--cp-cols)] lg:gap-4">
          {items.map((it, i) => {
            const locked = it.state === "locked";
            const lit = it.highlight;
            const body = (
              <>
                <span className="flex items-center justify-between gap-3">
                  <span className={`inline-flex items-center gap-2 text-[0.8125rem] font-bold uppercase tracking-[0.06em] ${lit || locked ? "" : "text-ink-soft"}`}>
                    <Padlock open={!locked} />
                    {locked ? `Abre ${it.opensAt ? dayMonth(it.opensAt) : ""}` : it.state === "current" ? "Esta semana" : "Liberada"}
                  </span>
                  {it.state === "current" && !lit && <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full" style={{ background: HIGHLIGHT }} />}
                </span>
                <span className={`mt-3 block font-display sm:mt-4 font-extrabold uppercase leading-[0.95] tracking-[0.004em] ${lit ? "text-[clamp(2rem,3.4vw,3rem)]" : "text-[clamp(1.6rem,2.4vw,2.1rem)]"}`}>{it.label}</span>
                {locked ? (
                  <span className={`mt-2 block text-[0.9375rem] ${lit ? "opacity-80" : "text-ink-mute"}`}>Oferta surpresa</span>
                ) : (
                  <>
                    {it.caption && <span className={`mt-2 block text-[0.9375rem] leading-snug ${lit ? "" : "text-ink-soft"}`}>{it.caption}</span>}
                    {it.href && (
                      <span className="mt-5 inline-flex items-center gap-2 text-[0.8125rem] font-bold uppercase tracking-[0.04em] underline decoration-2 underline-offset-4 group-hover:no-underline">
                        {it.cta}
                        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                      </span>
                    )}
                  </>
                )}
              </>
            );
            // The week in evidence on its yellow with dark text; the others on the cards' own surface (the ground's colour over a pattern), the week
            // running now outlined in yellow, the locked ones quieter.
            // Opaque in every state (the ground's pattern never shows through a card); a locked week is quieter in its text only.
            const card = `flex h-full flex-col rounded-lg border-2 p-4 sm:p-5 lg:p-6 ${lit ? "on-light border-transparent" : `bg-[var(--card-fill)] ${it.state === "current" ? "" : "border-[var(--line)]"}`} ${locked && !lit ? "text-ink-mute" : ""}`;
            // The yellow card's text is always near-black (inline: it must win over `.on-light`, which brings back the theme's own ink).
            const style: CSSProperties = lit ? { background: HIGHLIGHT, color: "#111" } : it.state === "current" ? { borderColor: HIGHLIGHT } : {};
            return (
              <li key={i}>
                {it.href && !locked ? (
                  <a href={it.href} {...(it.external ? { rel: "noopener" } : {})} className={`group ${card} transition-transform hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2`} style={style}>
                    {body}
                  </a>
                ) : (
                  <div className={card} style={style}>
                    {body}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
