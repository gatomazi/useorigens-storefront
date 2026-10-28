"use client";

import { SHIRT_COLORS, shirtColor } from "@/lib/customization/shirts";
import { InfoTip } from "./InfoTip";

export type ArtOption = { key: number; label: string; thumb: string; caption?: string };

/**
 * Art (or version) choice as thumbnails of the art itself, on the colour of the shirt being previewed: the customer recognises "the one with
 * the tree" faster than a name. The name stays for screen readers; `caption` (e.g. "Infantil") shows under a thumbnail when the art alone
 * does not say it. `strip` lays them in one scrolling row (the full-screen preview).
 */
export function ArtPicker({ legend, name, options, value, onChange, shirt, strip = false }: { legend: React.ReactNode; name: string; options: ArtOption[]; value: number; onChange: (key: number) => void; shirt: string; strip?: boolean }) {
  const tile = shirtColor(shirt).swatch;
  return (
    <fieldset className="min-w-0">
      <legend className={strip ? "sr-only" : "t-h3"}>{legend}</legend>
      <div className={strip ? "-mx-4 mt-2 flex snap-x gap-3 overflow-x-auto px-4 pb-1" : "mt-3 grid grid-cols-3 gap-3 sm:grid-cols-5"}>
        {options.map((o) => {
          const picked = o.key === value;
          return (
            <label key={o.key} className={`group block cursor-pointer ${strip ? "w-[5.5rem] shrink-0 snap-start" : "min-w-0"}`}>
              <input type="radio" name={name} checked={picked} onChange={() => onChange(o.key)} className="peer sr-only" />
              <span className={`relative flex aspect-square items-center justify-center overflow-hidden p-2 outline-offset-2 ring-offset-2 transition-shadow peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-region-primary ${picked ? "ring-[3px] ring-ink" : "ring-1 ring-line group-hover:ring-ink-mute"}`} style={{ backgroundColor: tile }}>
                {/* eslint-disable-next-line @next/next/no-img-element -- a small cached thumbnail served by our own route */}
                <img src={o.thumb} alt="" loading="lazy" decoding="async" className="max-h-full max-w-full object-contain" />
                {picked && <span aria-hidden="true" className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-ink text-white"><svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3.5 8.5l3 3 6-7" /></svg></span>}
              </span>
              <span className={o.caption ? "mt-1 block text-center text-[0.8125rem] font-bold leading-tight" : "sr-only"}>{o.caption ?? o.label}</span>
              {o.caption && <span className="sr-only">{o.label}</span>}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Shirt colours as plain squares, like INK; the name is for screen readers and the line below, with the "only for viewing" note behind an "i". */
export function ShirtSwatches({ name, value, onChange, row = false }: { name: string; value: string; onChange: (id: string) => void; row?: boolean }) {
  const current = shirtColor(value);
  return (
    <fieldset className="min-w-0">
      <legend className="sr-only">Cor da camiseta na prévia</legend>
      <div className={row ? "-mx-4 flex gap-2.5 overflow-x-auto px-4 py-1" : "grid max-w-[18.5rem] grid-cols-5 gap-2.5"}>
        {SHIRT_COLORS.map((c) => (
          <label key={c.id} className={`block cursor-pointer ${row ? "h-11 w-11 shrink-0" : "aspect-square min-h-11"}`} title={c.label}>
            <input type="radio" name={name} checked={c.id === value} onChange={() => onChange(c.id)} className="peer sr-only" />
            <span className={`block h-full w-full ring-offset-2 ring-offset-ground peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-region-primary ${c.id === value ? "ring-[3px] ring-ink" : "ring-1 ring-black/20"}`} style={{ backgroundColor: c.swatch }} />
            <span className="sr-only">{c.label}</span>
          </label>
        ))}
      </div>
      <p className="t-small mt-2 flex items-center text-ink-mute"><span aria-live="polite">Camiseta {current.label.toLowerCase()}</span>
        <InfoTip label="Sobre a cor e a prévia">Só para ver como fica: a cor você escolhe na compra. A prévia é uma simulação, e a nossa equipe confere a arte antes de preparar o produto.</InfoTip></p>
    </fieldset>
  );
}
