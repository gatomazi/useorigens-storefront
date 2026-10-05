"use client";

import Image from "next/image";
import { useId, useRef, useState } from "react";
import { SheetDialog, SheetHeader } from "@/components/layout/SheetDialog";
import { trackSizeGuideOpen } from "@/lib/analytics/track";
import { formatMeasure, sizeGuidesFor, type SizeGuide } from "@/lib/catalog/size-guides";

/** Tape measure, same line style as the site's other icons (24px grid, currentColor stroke). */
export function TapeMeasureIcon({ className }: { className: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="9" cy="11" r="6" />
      <circle cx="9" cy="11" r="1.6" />
      <path d="M15 11v6h6.5M17.5 17v-2M20 17v-2" />
    </svg>
  );
}

/**
 * "Guia de medidas" inside the storefront: a button that opens the official INK size table of the piece in a sheet (bottom sheet on phones,
 * modal from `sm`). Data is the static, versioned config in size-guides.ts — nothing is fetched when it opens, so switching model can never
 * show a previous table (the table always derives synchronously from the selected id).
 *
 * `garmentTypeIds` = the base garments relevant here (the family page: the classic tee; the city page: every piece tab it lists); the guide
 * opens on `initialGarmentTypeId`. Choosing another model in the guide never changes what is being bought. With no official table for these
 * pieces it shows no numbers at all — only "Consultar medidas na página de compra" (to `fallbackHref`, the real product) when there is one.
 */
export function SizeGuideButton({
  garmentTypeIds,
  initialGarmentTypeId,
  fallbackHref,
  source,
  className = "",
}: {
  garmentTypeIds: readonly number[];
  initialGarmentTypeId: number;
  fallbackHref?: string | null;
  /** Analytics source (SOURCES). */
  source: string;
  className?: string;
}) {
  const guides = sizeGuidesFor(garmentTypeIds);
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  const selected = guides.find((g) => g.id === selectedId) ?? guides.find((g) => g.garmentTypeId === initialGarmentTypeId) ?? guides[0];

  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-haspopup="dialog"
        data-testid="size-guide-button"
        onClick={() => {
          // Always (re)open on the piece selected now (a city tab may have changed since the last time).
          setSelectedId(guides.find((g) => g.garmentTypeId === initialGarmentTypeId)?.id ?? null);
          setOpen(true);
          trackSizeGuideOpen({ garmentTypeId: initialGarmentTypeId, source });
        }}
        className={`inline-flex min-h-11 items-center gap-2 border border-line bg-white px-4 text-[0.9375rem] font-semibold text-ink transition-colors hover:border-ink ${className}`}
      >
        <TapeMeasureIcon className="h-5 w-5 shrink-0" />
        Guia de medidas
      </button>

      <SheetDialog open={open} onClose={() => setOpen(false)} labelledBy={titleId} returnFocus={trigger} wide>
        <SheetHeader id={titleId} title="Guia de medidas" onClose={() => setOpen(false)} />
        {selected ? (
          <GuideBody guides={guides} selected={selected} onSelect={setSelectedId} />
        ) : (
          <div>
            <p className="t-body text-ink-soft">Ainda não temos a tabela oficial desta peça aqui.</p>
            {fallbackHref && (
              <a href={fallbackHref} className="btn btn-ghost mt-5 w-full sm:w-auto">
                Consultar medidas na página de compra
              </a>
            )}
          </div>
        )}
      </SheetDialog>
    </>
  );
}

/** Full header for screen readers and from `sm`; a short visible one on phones (e.g. "Compr."), so six columns fit a 360px sheet. */
function HeaderLabel({ label, short }: { label: string; short?: string }) {
  if (!short) return <>{label}</>;
  return (
    <>
      <span aria-hidden="true" className="sm:hidden">
        {short}
      </span>
      <span className="sr-only sm:not-sr-only">{label}</span>
    </>
  );
}

function GuideBody({ guides, selected, onSelect }: { guides: SizeGuide[]; selected: SizeGuide; onSelect: (id: string) => void }) {
  const [zoomed, setZoomed] = useState(false);
  const tableId = useId();

  return (
    <div>
      {guides.length > 1 && (
        <fieldset className="mb-5">
          <legend className="t-label mb-2">Modelagem</legend>
          <div className="flex flex-wrap gap-2">
            {guides.map((g) => (
              <button
                key={g.id}
                type="button"
                aria-pressed={g.id === selected.id}
                onClick={() => {
                  setZoomed(false);
                  onSelect(g.id);
                }}
                className="min-h-11 border-2 border-ink px-3 text-[0.9375rem] font-semibold transition-colors aria-pressed:border-region-primary aria-pressed:bg-region-primary aria-pressed:text-white"
              >
                {g.shortName}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      <p className="text-[1.0625rem] font-bold">{selected.name}</p>
      <p className="t-small mt-1 text-ink-soft">Medidas da peça (não do corpo), em centímetros (cm), com a peça estendida.</p>

      <div className="mt-4 overflow-x-auto">
        <table aria-describedby={tableId} className="w-full border-collapse text-left text-[0.875rem] sm:text-[0.9375rem]">
          <caption className="sr-only">Tabela de medidas: {selected.name}, em centímetros</caption>
          <thead>
            <tr className="border-b-2 border-ink">
              <th scope="col" className="py-2 pr-2 font-bold sm:pr-3">
                <HeaderLabel label="Tamanho" short="Tam." />
              </th>
              {selected.columns.map((c) => (
                <th key={c.label} scope="col" className="px-1.5 py-2 font-bold sm:px-2">
                  <HeaderLabel label={c.label} short={c.short} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {selected.rows.map((row) => (
              <tr key={row.size} className="border-b border-line">
                <th scope="row" className="whitespace-nowrap py-2 pr-2 font-semibold sm:pr-3">
                  {row.size}
                </th>
                {row.values.map((v, i) => (
                  <td key={selected.columns[i].label} className="whitespace-nowrap px-1.5 py-2 tabular-nums sm:px-2">
                    {formatMeasure(v)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div id={tableId} className="mt-4 grid gap-1">
        <p className="t-small">
          <span className="font-semibold">Margem de tolerância:</span> {selected.tolerance}
        </p>
        {selected.note && <p className="t-small font-semibold">{selected.note}</p>}
      </div>

      <h3 className="t-label mt-6">Como medir</h3>
      <p className="t-small mt-1">{selected.howTo}</p>
      <dl className="mt-3 grid gap-2">
        {selected.columns.map((c) => (
          <div key={c.label} className="t-small">
            <dt className="inline font-semibold">{c.label}: </dt>
            <dd className="inline text-ink-soft">{c.meaning}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-6">
        <div className={zoomed ? "overflow-x-auto" : ""}>
          <Image
            src={selected.image.desktop}
            alt={`Tabela oficial de medidas da INK: ${selected.inkTitle}. Os mesmos valores estão na tabela acima.`}
            width={selected.image.width}
            height={selected.image.height}
            sizes={zoomed ? `${Math.min(selected.image.width, 1400)}px` : "(min-width: 640px) 44rem, 100vw"}
            className={zoomed ? "h-auto max-w-none" : "h-auto w-full"}
            style={zoomed ? { width: Math.min(selected.image.width, 1400) } : undefined}
          />
        </div>
        <button type="button" aria-pressed={zoomed} onClick={() => setZoomed((z) => !z)} className="link-static mt-2 min-h-11 text-[0.9375rem] font-semibold">
          {zoomed ? "Reduzir imagem" : "Ampliar imagem"}
        </button>
      </div>

      <p className="t-caption mt-4">
        Fonte: tabela oficial da Reserva INK ({selected.inkTitle}), conferida em {selected.checkedAt.split("-").reverse().join("/")}. A disponibilidade de cada
        tamanho aparece na página de compra.
      </p>
    </div>
  );
}
