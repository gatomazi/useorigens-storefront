import type { ReactNode } from "react";
import { Fragment } from "react";

/**
 * The first block of a hotpage or a parent-category landing: title, subtitle and an optional button over the section's own background (the layer
 * is drawn INSIDE the section, like every other section: never a loose banner). No search box and no product cards: those belong to the region home.
 */
export function PageHero({ id, headingId, title, subtitle, cta, tone, backdrop, className }: { id: string; headingId: string; title: string; subtitle?: string; cta?: { label: string; href: string }; tone: "light" | "dark"; backdrop?: ReactNode; className?: string }) {
  const dark = tone === "dark";
  return (
    <section id={id} aria-labelledby={headingId} className={["relative isolate overflow-hidden", dark ? "text-white" : "", className].filter(Boolean).join(" ")}>
      {backdrop}
      <div className="wrap py-14 lg:py-24">
        <span aria-hidden="true" className="mb-4 block h-[3px] w-12 bg-region-accent" />
        <h1 id={headingId} className="t-display max-w-4xl [text-wrap:balance]">
          {title.split("\n").map((line, i) => (
            <Fragment key={i}>
              {i > 0 && <br />}
              {line}
            </Fragment>
          ))}
        </h1>
        {subtitle && <p className={`t-body mt-5 max-w-xl ${dark ? "text-white/85" : "text-ink"}`}>{subtitle}</p>}
        {cta && (
          <div className="mt-8">
            <a href={cta.href} className={dark ? "btn btn-light" : "btn"}>
              {cta.label}
            </a>
          </div>
        )}
      </div>
    </section>
  );
}
