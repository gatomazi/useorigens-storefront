"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { getFavorites, subscribeFavorites } from "@/lib/favorites/store";
import type { RegionSlug } from "@/lib/geo/regions";

function HeartIcon({ className }: { className: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20.5s-7.5-4.6-10-9.3C.6 7.8 2.4 4.5 5.7 4c2-.3 3.9.6 5 2.2C11.8 4.6 13.7 3.7 15.7 4c3.3.5 5.1 3.8 3.7 7.2-2.5 4.7-10 9.3-10 9.3Z" />
    </svg>
  );
}

/** Header trigger for "Meus Lugares": heart + count, same shape as CartMirrorMenu's own trigger. Always visible (no token gate — this is local, not a mirror of anything remote). */
export function FavoritesMenu({ region }: { region: RegionSlug }) {
  const count = useSyncExternalStore(
    subscribeFavorites,
    () => getFavorites().length,
    () => 0,
  );

  return (
    <Link
      href={`/${region}/meus-lugares`}
      data-testid="favorites-trigger"
      className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 px-2 font-semibold sm:px-3"
    >
      <span className="relative inline-flex">
        <HeartIcon className="h-5 w-5" />
        {count > 0 ? (
          <span aria-hidden="true" className="absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center bg-white px-[3px] text-[0.6875rem] font-bold leading-none text-ink">
            {count}
          </span>
        ) : null}
      </span>
      <span className="hidden sm:inline">Meus Lugares</span>
      <span className="sr-only sm:hidden">Meus Lugares{count > 0 ? `, ${count} ${count === 1 ? "estampa salva" : "estampas salvas"}` : ""}</span>
    </Link>
  );
}
