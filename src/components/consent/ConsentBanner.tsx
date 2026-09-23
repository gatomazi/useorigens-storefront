"use client";

import Link from "next/link";
import { useConsent } from "@/lib/consent/ConsentProvider";
import type { RegionSlug } from "@/lib/geo/regions";

/**
 * Non-blocking bottom bar, shown only while there is no stored decision (`record === null`). Deliberately has
 * no "×"/dismiss control: the only ways it goes away are Aceitar or Rejeitar — closing it, scrolling past it,
 * or navigating away must never count as consent (command CLAUDE_CONSENTIMENTO_META_PIXEL.md). It never
 * covers or blocks the rest of the page — search and every product page work identically either way.
 */
export function ConsentBanner({ region }: { region: RegionSlug }) {
  const { record, accept, reject } = useConsent();
  if (record !== null) return null;

  return (
    <div
      role="region"
      aria-label="Preferências de cookies"
      className="on-ink fixed inset-x-0 bottom-0 z-40 border-t border-white/15 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4"
    >
      <div className="wrap flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <p className="t-small max-w-2xl text-white/90">
          Usamos cookies de marketing (Meta Pixel) para entender como as pessoas chegam até a sua cidade. Só ativamos
          isso com a sua aceitação — recusar não muda em nada a busca ou a compra.{" "}
          <Link href={`/${region}/privacidade`} className="link-line font-semibold text-white">
            Política de privacidade
          </Link>
          .
        </p>
        <div className="flex shrink-0 gap-3">
          <button type="button" onClick={reject} className="btn-ghost min-h-11 border-2 border-white/40 px-5 text-[0.875rem] font-bold uppercase tracking-[0.04em] text-white hover:border-white">
            Rejeitar
          </button>
          <button type="button" onClick={accept} className="btn-light min-h-11 px-5 text-[0.875rem]">
            Aceitar
          </button>
        </div>
      </div>
    </div>
  );
}
