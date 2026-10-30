import type { CSSProperties, ReactNode } from "react";
import { dayMonth, type CheckpointState } from "@/lib/site-config/checkpoints";

export type CheckpointView = {
  label: string;
  caption?: string;
  cta: string;
  /** Null while locked (the destination is never sent before its day) or when it cannot be resolved here. */
  href: string | null;
  external: boolean;
  opensAt?: string;
  /** Locked only: whole days until it opens (the countdown of the block in evidence). */
  daysLeft?: number;
  highlight: boolean;
  state: CheckpointState;
};

/** The yellow of the Black Friday opening: the open weeks on the bar, the week running now, the block in evidence. */
const HIGHLIGHT = "#e2b64a";
const NEAR_BLACK = "#111";
/** The block in evidence: the same yellow, lit like foil (lighter at the top left, deeper at the bottom right). */
const FOIL = "linear-gradient(135deg, #f1d47e 0%, #e2b64a 45%, #c99a2e 100%)";

function Padlock({ open }: { open: boolean }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4.5" y="10.5" width="15" height="10" rx="2" />
      <path d={open ? "M8 10.5V7a4 4 0 0 1 7.6-1.7" : "M8 10.5V7a4 4 0 0 1 8 0v3.5"} />
    </svg>
  );
}

const Arrow = ({ className = "h-4 w-4" }: { className?: string }) => (
  <svg aria-hidden="true" viewBox="0 0 24 24" className={`${className} shrink-0 transition-transform duration-200 ease-out group-hover:translate-x-0.5`} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
);

/** The line with the padlock: "Abre 23/11", "Esta semana" or "Valendo" (an earlier week whose offer still holds). */
function Status({ it }: { it: CheckpointView }) {
  const text = it.state === "locked" ? `Abre ${it.opensAt ? dayMonth(it.opensAt) : "em breve"}` : it.state === "current" ? "Esta semana" : "Valendo";
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[0.6875rem] font-bold uppercase tabular-nums tracking-[0.1em]">
      <Padlock open={it.state !== "locked"} />
      {text}
    </span>
  );
}

const countdown = (days: number) => (days <= 1 ? "Falta 1 dia" : `Faltam ${days} dias`);
const NAME = "block font-display font-extrabold uppercase leading-[0.95] tracking-[0.004em] [text-wrap:balance]";
/** Every card: opaque (the ground's pattern never runs under a word), 12px corners, the same border weight in every state. */
const SHELL = "rounded-xl border-2";

/** The marker of the week running now (still: the card itself breathes, `.cp-pulse`). */
const Dot = () => <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ background: HIGHLIGHT }} />;

/**
 * A card that leads somewhere (`href`) or a plain block (a week that cannot be opened yet). The week running now breathes: a soft yellow ring that
 * grows and fades (`.cp-pulse`, globals.css; still for whoever asks the system for less motion).
 */
function Card({ href, external, current, className, style, children }: { href: string | null; external: boolean; current: boolean; className: string; style?: CSSProperties; children: ReactNode }) {
  const aria = current ? { "aria-current": "step" as const } : {};
  const shell = current ? `${className} cp-pulse` : className;
  if (!href) return <div className={shell} style={style} {...aria}>{children}</div>;
  return (
    <a href={href} {...(external ? { rel: "noopener" } : {})} {...aria} className={`group ${shell} transition-[transform,border-color,filter] duration-200 ease-out hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4`} style={style}>
      {children}
    </a>
  );
}

/**
 * "Checkpoints semanais": a progress bar (one segment per week, yellow once open) over one block per week, in the list's order.
 *   - The week running now: a card outlined in yellow with the section's one filled button.
 *   - The week in evidence (Black Friday): foil yellow, a little wider from 1024px, a punched hole like the tags of the ground; locked, it counts the
 *     days ("Faltam 13 dias · oferta surpresa").
 *   - An earlier week (its offer still holds): quieter, an underlined call.
 *   - A locked week: only its name, a padlock and the day it opens (the offer is a surprise: no caption, no link is sent).
 * Phones keep it short: the current and the evidence weeks as cards, every other week as one line. From 1024px, all side by side. Server-rendered:
 * the lock turns when the page is regenerated after Brasília midnight.
 */
export function WeeklyCheckpoints({ anchor, headingId, title, subtitle, items }: { anchor: string; headingId: string; title: string; subtitle?: string; items: CheckpointView[] }) {
  const opened = items.filter((it) => it.state !== "locked").length;
  const cols = { "--cp-cols": items.map((it) => (it.highlight ? "1.3fr" : "1fr")).join(" "), "--cp-n": `repeat(${items.length}, minmax(0, 1fr))` } as CSSProperties;
  return (
    <section id={anchor} aria-labelledby={headingId} className="wrap py-12 lg:py-20" data-testid="checkpoints">
      <div className="ground-plate mb-7 w-fit max-w-2xl lg:mb-9">
        <h2 id={headingId} className="t-h2 [text-wrap:balance]">{title}</h2>
        {subtitle && <p className="t-body mt-2.5 max-w-[60ch] text-ink-soft">{subtitle}</p>}
      </div>
      <div style={cols}>
        <p className="sr-only">{opened} de {items.length} semanas liberadas.</p>
        <div aria-hidden="true" className="mb-3 grid grid-cols-[var(--cp-n)] gap-1.5 lg:grid-cols-[var(--cp-cols)] lg:gap-3">
          {items.map((it, i) => (
            <span key={i} className="h-1 rounded-full" style={{ background: it.state === "locked" ? "var(--line)" : HIGHLIGHT }} />
          ))}
        </div>
        <ol className="grid gap-2 lg:grid-cols-[var(--cp-cols)] lg:gap-3">
          {items.map((it, i) => {
            const locked = it.state === "locked";
            const current = it.state === "current";
            const href = locked ? null : it.href;

            // The week in evidence: foil yellow, near-black text (inline: it must win over `.on-light`, which brings back the theme's own ink).
            if (it.highlight) {
              return (
                <li key={i}>
                  <Card href={href} external={it.external} current={current} className={`on-light relative flex h-full flex-col border-transparent p-5 ${SHELL} hover:brightness-105`} style={{ background: FOIL, color: NEAR_BLACK }}>
                    {/* The punched hole of a price tag, in the ground's colour. */}
                    <span aria-hidden="true" className="absolute right-4 top-4 h-2.5 w-2.5 rounded-full" style={{ background: "var(--plate-solid, #111)", boxShadow: "inset 0 1px 1px rgb(0 0 0 / 0.35)" }} />
                    <Status it={it} />
                    <span className={`${NAME} mt-3 text-[clamp(2rem,3.2vw,2.75rem)]`}>{it.label}</span>
                    {locked ? (
                      <span className="mt-2 block text-[0.875rem] font-bold tabular-nums">{typeof it.daysLeft === "number" ? `${countdown(it.daysLeft)} · oferta surpresa` : "Oferta surpresa"}</span>
                    ) : (
                      it.caption && <span className="mt-2 block max-w-[34ch] text-[0.875rem] font-medium leading-snug">{it.caption}</span>
                    )}
                    {href && (
                      <span className="mt-auto block pt-4">
                        <span className="inline-flex h-10 items-center gap-2 rounded-md px-3.5 pt-px text-[0.75rem] font-bold uppercase tracking-[0.06em] text-white" style={{ background: NEAR_BLACK }}>
                          {it.cta}
                          <Arrow />
                        </span>
                      </span>
                    )}
                  </Card>
                </li>
              );
            }

            // The week running now: outlined in yellow, the section's one filled button.
            if (current) {
              return (
                <li key={i}>
                  <Card href={href} external={it.external} current className={`flex h-full flex-col bg-[var(--card-fill)] p-5 ${SHELL}`} style={{ borderColor: HIGHLIGHT }}>
                    <span className="flex items-center justify-between gap-3">
                      <Status it={it} />
                      <Dot />
                    </span>
                    <span className={`${NAME} mt-3 text-[clamp(1.5rem,2.2vw,1.875rem)]`}>{it.label}</span>
                    {it.caption && <span className="mt-1.5 block max-w-[34ch] text-[0.875rem] leading-snug text-ink-soft">{it.caption}</span>}
                    {href && (
                      <span className="mt-auto block pt-4">
                        <span className="inline-flex h-10 items-center gap-2 rounded-md px-3.5 pt-px text-[0.75rem] font-bold uppercase tracking-[0.06em] transition-[filter] duration-200 group-hover:brightness-110" style={{ background: HIGHLIGHT, color: NEAR_BLACK }}>
                          {it.cta}
                          <Arrow />
                        </span>
                      </span>
                    )}
                  </Card>
                </li>
              );
            }

            // An earlier week (still valid) or a locked one: one line on phones, a quieter card from 1024px.
            return (
              <li key={i}>
                <Card
                  href={href}
                  external={it.external}
                  current={false}
                  className={`flex h-full items-center justify-between gap-4 border-[var(--line)] bg-[var(--card-fill)] px-4 py-3 lg:flex-col lg:items-stretch lg:justify-start lg:p-5 ${SHELL} ${locked ? "text-ink-mute" : "hover:border-[color:var(--ink-mute)]"}`}
                >
                  <span className="min-w-0">
                    <span className={`hidden lg:inline-flex ${locked ? "" : "text-ink-soft"}`}><Status it={it} /></span>
                    <span className={`${NAME} text-[1.25rem] lg:mt-3 lg:text-[clamp(1.5rem,2.2vw,1.875rem)]`}>{it.label}</span>
                    {locked ? (
                      <span className="mt-1.5 hidden text-[0.875rem] lg:block">Oferta surpresa</span>
                    ) : (
                      it.caption && <span className="mt-1 block truncate text-[0.8125rem] text-ink-soft lg:mt-1.5 lg:whitespace-normal lg:text-[0.875rem] lg:leading-snug">{it.caption}</span>
                    )}
                  </span>
                  {/* Phones: the state on the right of the line (the day of a locked week, an arrow to an open one). */}
                  <span className="shrink-0 lg:hidden">{locked ? <Status it={it} /> : href && <Arrow className="h-5 w-5" />}</span>
                  {!locked && href && (
                    <span className="mt-auto hidden pt-4 lg:block">
                      <span className="inline-flex items-center gap-2 text-[0.75rem] font-bold uppercase tracking-[0.06em] underline decoration-2 underline-offset-[6px] group-hover:no-underline">
                        {it.cta}
                        <Arrow />
                      </span>
                    </span>
                  )}
                </Card>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
