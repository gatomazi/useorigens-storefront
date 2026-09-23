"use client";

import Link from "next/link";
import { trackSelectState, type SelectStateParams } from "@/lib/analytics/track";

/** A `next/link` to a state page that also fires `select_state` (GA4-only — Meta's four-event contract has no
 * equivalent, see track.ts) — for server-rendered pages (header "Regiões" dropdown, footer "Estados" column,
 * the home's own `#estados` chooser) that need one interactive leaf without becoming client components. */
export function TrackedStateLink({ href, params, className, children }: { href: string; params: SelectStateParams; className?: string; children: React.ReactNode }) {
  return (
    <Link href={href} onClick={() => trackSelectState(params)} className={className}>
      {children}
    </Link>
  );
}
