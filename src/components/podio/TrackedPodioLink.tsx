"use client";

import Link from "next/link";
import { trackPodioClick, type PodioClickParams } from "@/lib/analytics/track";

/** A `next/link` inside the Pódio that also fires `podio_click` — the one interactive leaf of an otherwise server-rendered block. */
export function TrackedPodioLink({
  href,
  params,
  className,
  ariaLabel,
  children,
}: {
  href: string;
  params: PodioClickParams;
  className?: string;
  ariaLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} onClick={() => trackPodioClick(params)} className={className} aria-label={ariaLabel}>
      {children}
    </Link>
  );
}
