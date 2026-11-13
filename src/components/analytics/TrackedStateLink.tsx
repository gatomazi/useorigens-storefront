"use client";

import Link from "next/link";
import { openCityFinder } from "@/components/city-finder/open";
import { trackSelectState, type SelectStateParams } from "@/lib/analytics/track";

/** A `next/link` to a state page that also fires `select_state` (GA4-only — Meta's four-event contract has no
 * equivalent, see track.ts) — for server-rendered pages (header "Regiões" dropdown, footer "Estados" column,
 * the home's own `#estados` chooser) that need one interactive leaf without becoming client components.
 *
 * `opensFinder` (the home's state chooser set to "Escolher a cidade aqui"): a plain click opens the "Quero minha cidade" window on that state instead
 * of the page; the link stays a real link, so a new tab, a middle click and the crawlers still reach the state's page. */
export function TrackedStateLink({
  href,
  params,
  className,
  children,
  opensFinder = false,
}: {
  href: string;
  params: SelectStateParams;
  className?: string;
  children: React.ReactNode;
  opensFinder?: boolean;
}) {
  return (
    <Link
      href={href}
      onClick={(e) => {
        trackSelectState(params);
        if (!opensFinder || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        openCityFinder(params.state, e.currentTarget);
      }}
      className={className}
      aria-haspopup={opensFinder ? "dialog" : undefined}
    >
      {children}
    </Link>
  );
}
