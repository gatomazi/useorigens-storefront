"use client";

import { trackGoToInk, type GoToInkParams } from "@/lib/analytics/track";

/** A plain `<a>` to a verified INK product that also fires GoToInk on the real click — for the
 * server-rendered pages (city page's "Fala de"/"Lugares de" sections, FamilyCard's direct-to-INK link) that
 * need one interactive leaf without becoming a client component themselves. Same tab, no popup, no delay: this
 * wraps the exact same navigation the plain `<a>` already did, only adding the tracking call. */
export function TrackedInkLink({
  href,
  params,
  className,
  ariaLabel,
  children,
}: {
  href: string;
  params: GoToInkParams;
  className?: string;
  ariaLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <a href={href} onClick={() => trackGoToInk(params)} className={className} aria-label={ariaLabel}>
      {children}
    </a>
  );
}
