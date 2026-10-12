import type { ReactNode } from "react";
import { Fragment } from "react";

/**
 * The first block of a hotpage or a parent-category landing: title, subtitle and an optional button over the section's own background (the layer
 * is drawn INSIDE the section, like every other section: never a loose banner). No search box and no product cards: those belong to the region home.
 */
export function PageHero({ id, headingId, title, subtitle, cta, tone, backdrop, className, compact = false, aside }: { id: string; headingId: string; title: string; subtitle?: string; cta?: { label: string; href: string }; tone: "light" | "dark"; backdrop?: ReactNode; className?: string; /** The automatic collection page: a short header (the person already chose the collection; the products come first), the title still in the display face. */ compact?: boolean; /** Next to the title in the compact header (the product count). */ aside?: ReactNode }) {
  const dark = tone === "dark";
  return (
    <section id={id} aria-labelledby={headingId} className={["relative isolate overflow-hidden", dark ? "text-white" : "", className].filter(Boolean).join(" ")}>
      {backdrop}
      <div className={compact ? "wrap flex flex-wrap items-end justify-between gap-x-6 gap-y-2 pb-6 pt-6 lg:pb-7 lg:pt-8" : "wrap py-14 lg:py-24"}>
        {compact && (
          <div aria-hidden="true" className="basis-full">
            <span className="mb-3 block h-[3px] w-10 bg-region-accent lg:mb-4" />
          </div>
        )}
        {!compact && <span aria-hidden="true" className="mb-4 block h-[3px] w-12 bg-region-accent" />}
        <h1 id={headingId} className={compact ? "t-h1 max-w-4xl text-[clamp(2.25rem,7vw,4rem)] [text-wrap:balance]" : "t-display max-w-4xl [text-wrap:balance]"}>
          {title.split("\n").map((line, i) => (
            <Fragment key={i}>
              {i > 0 && <br />}
              {line}
            </Fragment>
          ))}
        </h1>
        {compact && aside}
        {subtitle && <p className={`t-body max-w-xl ${compact ? "basis-full" : "mt-5"} ${dark ? "text-white/85" : "text-ink"}`}>{subtitle}</p>}
        {cta && (
          <div className={compact ? "basis-full" : "mt-8"}>
            <a href={cta.href} className={dark ? "btn btn-light" : "btn"}>
              {cta.label}
            </a>
          </div>
        )}
      </div>
    </section>
  );
}
