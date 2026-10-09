"use client";

import { useState } from "react";
import { ShareButton } from "@/components/share/ShareButton";
import { trackGoToInk } from "@/lib/analytics/track";
import { CLASSIC_GARMENT_TYPE_ID } from "@/lib/catalog/garments";
import type { SharePayload } from "@/lib/share/url";
import { ProductPhoto } from "./ProductPhoto";
import { SizeGuideButton } from "./SizeGuide";

export type VariantOption = {
  id: string;
  label: string;
  /** Extra context, e.g. the locality name. */
  detail?: string;
  imageUrl: string;
  price: string | null;
  /** Exactly what INK returned for this variant — the GoToInk `value` param; never invented when absent. */
  rawPrice?: number | null;
  /** Verified INK purchase URL, or null when the destination is unusable. */
  href: string | null;
  /** "Compartilhar" payload for THIS option (its own INK product page), built on the server; null = no verified destination, no button. */
  share?: SharePayload | null;
  /** Single-store SIMULATION only (commerce-mode.ts): hidden in INK today, shown as if activated — never presented as purchasable. */
  simulated?: boolean;
};

/**
 * Preview + buy panel for one design family. The primary product is selected first; other real
 * variants (regional, custom...) appear only when they exist. Layout stays stable while switching.
 *
 * The right column is ONE continuous block — title, versions, price and CTA together, not split across grid
 * rows — so the commercial decision reads as one clear unit next to the photo (CLAUDE_ADDENDUM_...md).
 */
export function VariantPicker({
  options,
  alt,
  storeName,
  intro,
  city,
  stateUf,
  familyId,
  productName,
  sourceSection = "pdp",
}: {
  options: VariantOption[];
  alt: string;
  storeName: string;
  /** Title block: on desktop it sits at the top of the right column, on phones above the photo. */
  intro: React.ReactNode;
  /** GoToInk context — constant across every variant option, only the selected product id changes. */
  city?: string;
  stateUf?: string;
  familyId?: string;
  /** GA4-only: the family's real display name (e.g. "Ponto de Origem") — go_to_ink/select_item's product name. */
  productName?: string;
  sourceSection?: string;
}) {
  const [selectedId, setSelectedId] = useState(options[0].id);
  const selected = options.find((o) => o.id === selectedId) ?? options[0];

  return (
    <div className="grid items-start gap-x-16 gap-y-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      {/* The title exists ONCE in the DOM (one <h1>). On phones the sticky wrapper below is `display: contents`, so its children join this grid and
          `order` puts the title above the photo; from `lg` the wrapper is a real box and holds the title at the top of the right column. */}
      <div className="relative order-2 mx-auto w-[74%] sm:w-[84%] lg:order-none lg:col-start-1 lg:w-full">
        {options.map((option) => (
          <div key={option.id} className={`transition-opacity duration-300 ${option.id === selected.id ? "relative opacity-100" : "pointer-events-none absolute inset-0 opacity-0"}`} aria-hidden={option.id !== selected.id}>
            <ProductPhoto src={option.imageUrl} alt={option.id === selected.id ? alt : ""} sizes="(min-width: 1024px) 56vw, 100vw" priority={option.id === options[0].id} />
          </div>
        ))}
      </div>

      {/* One continuous decision block: title, versions, price, CTA — all together, sticky as a unit. */}
      <div className="contents lg:sticky lg:top-24 lg:block">
        <div className="order-1 lg:order-none">{intro}</div>

        {/* data-purchase-controls: the coupon button (components/promotions) steps aside instead of covering these versions or the CTA. */}
        <div className="order-3 lg:order-none" data-purchase-controls>
          {options.length > 1 && (
            <fieldset className="mt-5 lg:mt-6">
              <legend className="t-label mb-3">Versões deste estilo</legend>
              <div className="flex flex-wrap gap-2">
                {options.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={option.id === selected.id}
                    onClick={() => setSelectedId(option.id)}
                    className="min-h-11 border-2 border-ink px-4 text-[0.9375rem] font-semibold transition-colors aria-pressed:border-region-primary aria-pressed:bg-region-primary aria-pressed:text-white"
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </fieldset>
          )}

          <div className="mt-5 lg:mt-6">
            {selected.detail && <p className="t-place mb-1">{selected.detail}</p>}
            {/* "Guia de medidas" shares the price's row, before the CTA, so it adds no height: the CTA stays inside a small phone's first
                screen and the decision block stays compact (tests/e2e/sul.spec.ts). Lighter than the CTA, never a second filled button. */}
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <p className="t-h2" aria-live="polite">
                {selected.price ?? "Consulte na loja"}
              </p>
              <SizeGuideButton garmentTypeIds={[CLASSIC_GARMENT_TYPE_ID]} initialGarmentTypeId={CLASSIC_GARMENT_TYPE_ID} fallbackHref={selected.href} source={sourceSection} />
            </div>
          </div>

          {selected.href ? (
            <a
              href={selected.href}
              onClick={() => trackGoToInk({ productId: selected.id, sourceSection, city, state: stateUf, family: familyId, value: selected.rawPrice ?? undefined, productName, destinationUrl: selected.href ?? undefined })}
              className="btn mt-4 w-full sm:w-auto sm:min-w-72"
            >
              Escolher tamanho na loja
            </a>
          ) : (
            <div className="mt-4">
              <span className="btn w-full sm:w-auto sm:min-w-72" aria-disabled="true">
                {selected.simulated ? "Prévia · ainda não está à venda" : "Indisponível no momento"}
              </span>
              <p className="t-caption mt-3">
                {selected.simulated
                  ? "Simulação da loja única: esta estampa ainda está oculta na loja e só aparece nesta prévia."
                  : "Não conseguimos abrir este produto na loja agora. Tente novamente em instantes."}
              </p>
            </div>
          )}
          <p className="t-caption mt-3 max-w-sm">Tamanho, cor, frete e pagamento você define na loja {storeName}.</p>
          {/* Sharing is secondary: after the purchase CTA, for the version selected now (its own INK product page). */}
          {selected.share && <ShareButton key={selected.id} share={selected.share} variant="inline" className="mt-2 -ml-0.5" />}
        </div>
      </div>
    </div>
  );
}
