"use client";

import { useState } from "react";
import { ProductPhoto } from "./ProductPhoto";

export type VariantOption = {
  id: string;
  label: string;
  /** Extra context, e.g. the locality name. */
  detail?: string;
  imageUrl: string;
  price: string | null;
  /** Verified INK purchase URL, or null when the destination is unusable. */
  href: string | null;
};

/**
 * Preview + buy panel for one design family. The primary product is selected first; other real
 * variants (regional, custom...) appear only when they exist. Layout stays stable while switching.
 */
export function VariantPicker({
  options,
  alt,
  storeName,
  intro,
}: {
  options: VariantOption[];
  alt: string;
  storeName: string;
  /** Title block: on desktop it sits beside the photo, on phones above it. */
  intro: React.ReactNode;
}) {
  const [selectedId, setSelectedId] = useState(options[0].id);
  const selected = options.find((o) => o.id === selectedId) ?? options[0];

  return (
    <div className="grid items-start gap-x-16 gap-y-5 lg:gap-y-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:grid-rows-[auto_1fr]">
      <div className="lg:col-start-2 lg:row-start-1 lg:pt-4">{intro}</div>

      <div className="relative mx-auto w-[74%] sm:w-[84%] lg:col-start-1 lg:row-span-2 lg:row-start-1 lg:w-full">
        {options.map((option) => (
          <div key={option.id} className={`transition-opacity duration-300 ${option.id === selected.id ? "relative opacity-100" : "pointer-events-none absolute inset-0 opacity-0"}`} aria-hidden={option.id !== selected.id}>
            <ProductPhoto src={option.imageUrl} alt={option.id === selected.id ? alt : ""} sizes="(min-width: 1024px) 56vw, 100vw" priority={option.id === options[0].id} />
          </div>
        ))}
      </div>

      <div className="lg:col-start-2 lg:row-start-2 lg:sticky lg:top-24">
        {options.length > 1 && (
          <fieldset className="mb-5 lg:mb-8">
            <legend className="t-label mb-3">Versões deste estilo</legend>
            <div className="flex flex-wrap gap-2">
              {options.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={option.id === selected.id}
                  onClick={() => setSelectedId(option.id)}
                  className="min-h-11 border-2 border-ink px-4 text-[0.9375rem] font-semibold transition-colors aria-pressed:bg-ink aria-pressed:text-white"
                >
                  {option.label}
                </button>
              ))}
            </div>
          </fieldset>
        )}

        {selected.detail && <p className="t-place mb-2">{selected.detail}</p>}
        <p className="t-h2" aria-live="polite">
          {selected.price ?? "Consulte na loja"}
        </p>

        {selected.href ? (
          <a href={selected.href} className="btn mt-5 w-full sm:mt-8 sm:w-auto sm:min-w-72">
            Escolher tamanho na loja
          </a>
        ) : (
          <div className="mt-8">
            <span className="btn w-full sm:w-auto sm:min-w-72" aria-disabled="true">
              Indisponível no momento
            </span>
            <p className="t-caption mt-3">Não conseguimos abrir este produto na loja agora. Tente novamente em instantes.</p>
          </div>
        )}
        <p className="t-caption mt-4 max-w-sm">Tamanho, cor, frete e pagamento você define na loja {storeName}.</p>
      </div>
    </div>
  );
}
