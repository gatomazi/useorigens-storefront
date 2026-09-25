"use client";

import Link from "next/link";
import { useConsent } from "@/lib/consent/ConsentProvider";
import type { RegionSlug } from "@/lib/geo/regions";

/**
 * Compact bottom bar, shown only while there is no stored decision (`record === null`). Deliberately has no
 * "×"/dismiss control: the only ways it goes away are "Aceitar cookies" or "Rejeitar" — closing it, scrolling
 * past it, or navigating away must never count as consent. It never blocks the rest of the page — search and
 * every product page work identically either way.
 *
 * The copy is the INK stores' own sentence and vendor-neutral on purpose: the choice covers every optional measurement tool the
 * storefront uses (today Meta + Google Analytics, possibly others later), so the detail lives in the privacy policy, not here.
 * Both buttons share the same size and weight so neither choice is visually pushed.
 */
export function ConsentBanner({ region }: { region: RegionSlug }) {
  const { record, accept, reject } = useConsent();
  if (record !== null) return null;

  return (
    <div
      role="region"
      aria-label="Preferências de cookies"
      className="on-ink fixed inset-x-0 bottom-0 z-40 border-t border-white/15 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3"
    >
      <div className="wrap flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <p className="text-[0.8125rem] leading-snug text-white/90 sm:max-w-2xl sm:text-[0.875rem]">
          Nosso site utiliza cookies para você ter uma melhor experiência.{" "}
          Saiba mais em nossa{" "}
          <Link href={`/${region}/privacidade`} className="link-line font-semibold text-white">
            Política de Privacidade
          </Link>
          .
        </p>
        <div className="grid shrink-0 grid-cols-2 gap-2.5 sm:flex sm:gap-3">
          <button
            type="button"
            onClick={reject}
            className="btn-ghost min-h-11 whitespace-nowrap border-2 border-white/40 px-4 text-[0.8125rem] font-bold uppercase tracking-[0.04em] text-white hover:border-white sm:px-5 sm:text-[0.875rem]"
          >
            Rejeitar
          </button>
          <button type="button" onClick={accept} className="btn-light min-h-11 whitespace-nowrap border-2 px-4 text-[0.8125rem] font-bold uppercase tracking-[0.04em] sm:px-5 sm:text-[0.875rem]">
            Aceitar cookies
          </button>
        </div>
      </div>
    </div>
  );
}
