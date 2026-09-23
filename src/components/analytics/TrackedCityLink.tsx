"use client";

import Link from "next/link";
import { trackSelectCity, type SelectCityParams } from "@/lib/analytics/track";

/** A `next/link` to another city's page that also fires SelectCity — for the handful of server-rendered
 * pages (the city page's own "Mais de {mesorregião}" neighbours) that need one interactive leaf without
 * becoming a client component themselves. */
export function TrackedCityLink({ href, params, className, children }: { href: string; params: SelectCityParams; className?: string; children: React.ReactNode }) {
  return (
    <Link href={href} onClick={() => trackSelectCity(params)} className={className}>
      {children}
    </Link>
  );
}
