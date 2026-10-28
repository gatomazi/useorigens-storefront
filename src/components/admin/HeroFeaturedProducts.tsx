"use client";

import { useRef, useState, useTransition } from "react";
import type { FeaturedCandidate } from "@/lib/hero-featured";
import type { FeaturedRotation } from "@/lib/site-config/schema";
import type { MediaOption } from "./SectionEditorForm";
import { HERO_PANEL, sizeHintText } from "@/lib/admin/image-sizes";

/** One position of the hero, as the server resolved it against the region's catalog snapshot. */
export type FeaturedSlotView = {
  value: string; // "store:productId"
  ok: boolean;
  reason: string | null;
  familyName?: string;
  cityName?: string;
  uf?: string;
  price?: string | null;
  imageUrl?: string | null;
  buyUrl?: string | null;
  /** "feature" opening only: this product's own banner (a media id) and its description (empty = decorative). */
  image?: { assetId: string; alt: string };
  /** "feature" opening, with a banner only: the products marked on it ("compre o look"), where they sit in % of the picture. */
  pins?: PinView[];
};

/** A product marked on a banner, as the server resolved it (or as just chosen). */
export type PinView = { value: string; x: number; y: number; ok: boolean; reason: string | null; familyName?: string; cityName?: string; uf?: string; imageUrl?: string | null };
/** At most this many products marked on one banner (the schema's MAX_HERO_PINS). */
const MAX_PINS = 4;
/** "Use aqui" in the search goes to a position (`pin` absent), to a new mark at `at`, or to mark `pin` (its product replaced). */
type Target = { slot: number; pin?: number | "new"; at?: { x: number; y: number } };
const pinLine = (p: PinView) => `${p.familyName ?? `Produto #${p.value.split(":")[1]}`}${p.cityName ? ` · ${p.cityName} · ${p.uf}` : ""}`;

const ROTATIONS: readonly [FeaturedRotation | "", string, string][] = [
  ["", "Sempre o primeiro", "A abertura mostra só o produto da posição 1."],
  ["random", "Sorteado a cada visita", "Cada visita vê um dos produtos, sorteado na hora de entrar na loja."],
  ["slide", "Passando ao lado", "Os produtos passam sozinhos a cada 6 segundos, com bolinhas para escolher e um botão de pausa. No celular, dá para arrastar."],
];

const fromCandidate = (c: FeaturedCandidate): FeaturedSlotView => ({
  value: `${c.store}:${c.productId}`, ok: true, reason: null, familyName: c.familyName, cityName: c.cityName, uf: c.uf, price: c.price, imageUrl: c.imageUrl, buyUrl: c.buyUrl,
});

function Thumb({ src }: { src?: string | null }) {
  // eslint-disable-next-line @next/next/no-img-element -- an admin thumbnail of a catalog photo (already public on the store)
  return src ? <img src={src} alt="" className="h-20 w-16 shrink-0 bg-neutral-300 object-cover" loading="lazy" /> : <span aria-hidden className="block h-20 w-16 shrink-0 bg-neutral-300" />;
}

function SlotCard({ slot }: { slot: FeaturedSlotView }) {
  return (
    <div className="flex gap-3">
      <Thumb src={slot.imageUrl} />
      <div className="min-w-0 text-[0.875rem]">
        <p className="font-bold">{slot.familyName ?? "Produto"} {slot.cityName ? <span className="font-normal">· {slot.cityName} · {slot.uf}</span> : <span className="a-muted font-normal">{slot.ok ? "· peça (sem cidade) " : ""}#{slot.value.split(":")[1]}</span>}</p>
        <p className="a-muted">{slot.price ? `${slot.price} (preço do catálogo sincronizado)` : "Sem preço no catálogo"}</p>
        {slot.ok ? <span className="a-badge ok">Disponível na loja</span> : <span className="a-badge bad">Não aparece na loja: {slot.reason}. Substitua.</span>}
        {slot.buyUrl && <a href={slot.buyUrl} target="_blank" rel="noreferrer" className="a-link ml-2">Ver na loja ↗</a>}
      </div>
    </div>
  );
}

export function HeroFeaturedProducts({
  scope, regionName, mode, initial, eligible, search, feature = false, max = 3, media = [], thumbOf, rotation,
}: {
  scope: string;
  regionName: string;
  /** `legacy`: Sul, never customised: the three original cards, read-only until the owner chooses to customise. */
  mode: "edit" | "legacy";
  initial: FeaturedSlotView[];
  /** How many eligible products the region's catalog offers (0 = the reason to show instead of a search). */
  eligible: number;
  search: (scope: string, query: string) => Promise<{ results: FeaturedCandidate[]; total: number; error?: string }>;
  /** The "feature" opening (one product at a time): up to `max` products, each with its own banner, and how it goes through them. */
  feature?: boolean;
  max?: number;
  media?: MediaOption[];
  thumbOf?: (assetId: string) => string | undefined;
  rotation?: FeaturedRotation;
}) {
  const modeRef = useRef<HTMLInputElement>(null);
  // The three-card hero keeps its three fixed positions; the "feature" opening lists the products chosen, plus one empty position to add another.
  const [slots, setSlots] = useState<(FeaturedSlotView | null)[]>(() => (feature ? initial.slice(0, max) : Array.from({ length: max }, (_, i) => initial[i] ?? null)));
  const [target, setTarget] = useState<Target | null>(null);
  const openSlot = target && target.pin === undefined ? target.slot : null;
  const setOpenSlot = (slot: number | null) => setTarget(slot === null ? null : { slot });
  // A mark being moved: the next click on its picture puts it there.
  const [moving, setMoving] = useState<{ slot: number; pin: number } | null>(null);
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<{ results: FeaturedCandidate[]; total: number; error?: string } | null>(null);
  const [pending, start] = useTransition();

  // Every change is saved as a DRAFT at once (the whole form), so the preview below follows; nothing is published.
  const submit = (next: (FeaturedSlotView | null)[], submitMode = "edit") => {
    setSlots(next);
    const form = modeRef.current?.form;
    if (!form || !modeRef.current) return;
    modeRef.current.value = submitMode;
    // the hidden inputs below are controlled by `slots`; write them synchronously before submitting
    for (let i = 0; i < max; i++) {
      const set = (name: string, value: string) => { const el = form.elements.namedItem(name) as HTMLInputElement | null; if (el) el.value = value; };
      set(`featured_${i + 1}`, next[i]?.value ?? "");
      set(`featured_image_${i + 1}`, next[i]?.image?.assetId ?? "");
      set(`featured_alt_${i + 1}`, next[i]?.image?.alt ?? "");
      set(`featured_pins_${i + 1}`, next[i]?.image && next[i]?.pins?.length ? JSON.stringify(next[i]!.pins!.map((p) => ({ p: p.value, x: p.x, y: p.y }))) : "");
    }
    form.requestSubmit();
  };
  // The "feature" list closes up its holes; the three-card hero keeps three positions.
  const settle = (next: (FeaturedSlotView | null)[]) => (feature ? next.filter((s): s is FeaturedSlotView => s !== null) : next.filter(Boolean).concat(Array(max).fill(null)).slice(0, max));
  const setImage = (i: number, image: FeaturedSlotView["image"], save: boolean) => {
    const next = slots.map((s, k) => (k === i && s ? { ...s, image } : s));
    if (save) submit(next);
    else setSlots(next);
  };

  const run = (q: string) => {
    setQuery(q);
    if (q.trim().length < 2) return setFound(null);
    start(async () => setFound(await search(scope, q)));
  };
  const swap = (i: number, j: number) => { const next = [...slots]; [next[i], next[j]] = [next[j], next[i]]; submit(next.filter((s, k) => s || k >= 0)); };
  const filled = slots.filter(Boolean).length;
  // The positions drawn: the "feature" list plus one empty position while there is room.
  const shown = feature && slots.length < max ? [...slots, null] : slots;

  if (mode === "legacy") {
    return (
      <fieldset className="space-y-4">
        <legend className="a-h2 mb-3">Produtos em destaque</legend>
        <input ref={modeRef} type="hidden" name="featured_mode" value="keep" readOnly />
        <p className="a-muted text-[0.875rem]">Estes são os três cards que o hero do {regionName} mostra hoje (definidos no código). Continuam assim até você personalizar.</p>
        <ol className="space-y-3">{initial.map((s, i) => <li key={s.value} className="flex items-start gap-3"><span className="a-badge">{i + 1}</span><SlotCard slot={s} /></li>)}</ol>
        <button type="button" className="a-btn ghost sm" onClick={() => submit(slots, "seed")}>Personalizar a partir destes três</button>
      </fieldset>
    );
  }

  return (
    <fieldset className="space-y-4">
      <legend className="a-h2 mb-3">Produtos em destaque</legend>
      <input ref={modeRef} type="hidden" name="featured_mode" defaultValue="edit" />
      {Array.from({ length: max }, (_, i) => (
        <span key={i} hidden>
          <input type="hidden" name={`featured_${i + 1}`} defaultValue={slots[i]?.value ?? ""} />
          {feature && <input type="hidden" name={`featured_image_${i + 1}`} defaultValue={slots[i]?.image?.assetId ?? ""} />}
          {feature && <input type="hidden" name={`featured_alt_${i + 1}`} defaultValue={slots[i]?.image?.alt ?? ""} />}
          {feature && <input type="hidden" name={`featured_pins_${i + 1}`} defaultValue={slots[i]?.image && slots[i]?.pins?.length ? JSON.stringify(slots[i]!.pins!.map((p) => ({ p: p.value, x: p.x, y: p.y }))) : ""} />}
        </span>
      ))}
      {feature ? (
        <p className="a-muted text-[0.875rem]">Até {max} produtos reais do catálogo da loja {regionName}, um de cada vez na metade direita da abertura. Cada produto pode ter um banner próprio; sem banner, ele usa a imagem da seção (Aparência) e, sem ela, a foto do produto. Cada escolha é salva como rascunho e atualiza a prévia; nada vai para a loja até publicar.</p>
      ) : (
        <p className="a-muted text-[0.875rem]">Até três produtos reais do catálogo da loja {regionName}, mostrados como cards no hero (à direita no desktop, em fileira no mobile). Cada escolha é salva como rascunho e atualiza a prévia; nada vai para a loja até publicar. O preço e a foto vêm sempre do catálogo sincronizado.</p>
      )}
      {feature && (
        <fieldset className="space-y-2" data-testid="featured-rotation">
          <legend className="a-label">Como alternar os produtos</legend>
          <div className="flex flex-wrap gap-3">
            {ROTATIONS.map(([value, label, help]) => (
              <label key={value || "first"} className="flex max-w-xs cursor-pointer gap-2 border border-black/20 p-3 has-[:checked]:border-black has-[:checked]:bg-white">
                <input type="radio" name="featured_rotation" value={value} defaultChecked={(rotation ?? "") === value} className="mt-1" onChange={(e) => e.currentTarget.form?.requestSubmit()} data-testid={`featured-rotation-${value || "first"}`} />
                <span><span className="block font-bold">{label}</span><span className="a-muted block text-[0.8125rem]">{help}</span></span>
              </label>
            ))}
          </div>
          {rotation && filled < 2 && <p className="a-flash ok text-[0.875rem]">Com um produto só, a abertura mostra sempre esse. Escolha mais produtos para alternar.</p>}
        </fieldset>
      )}
      {eligible === 0 && <p className="a-flash err text-[0.875rem]">Nenhum produto elegível no catálogo da loja {regionName} neste ambiente (sincronize o catálogo em Coleções). O título, o texto e a imagem do hero continuam editáveis, e o hero sai sem cards.</p>}
      {!feature && eligible > 0 && filled < 3 && <p className="a-flash ok text-[0.875rem]">{filled === 0 ? "Nenhum card escolhido: o hero sai sem cards." : `${filled} de 3 cards escolhidos: ${filled === 1 ? "o card aparece sozinho" : "os dois cards se ajustam à grade"}.`} Preencha as três posições para a apresentação completa.</p>}
      <ol className="space-y-4">
        {shown.map((slot, i) => (
          <li key={i} className="border border-black/20 bg-white p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="a-label !mb-0">Posição {i + 1}</p>
              <div className="flex flex-wrap gap-1.5">
                <button type="button" className="a-btn sm ghost" disabled={i === 0 || !slot} onClick={() => swap(i, i - 1)} aria-label={`Mover a posição ${i + 1} para cima`}>↑</button>
                <button type="button" className="a-btn sm ghost" disabled={i === max - 1 || !slot || !slots[i + 1]} onClick={() => swap(i, i + 1)} aria-label={`Mover a posição ${i + 1} para baixo`}>↓</button>
                {slot && <button type="button" className="a-btn sm ghost" onClick={() => { const next = [...slots]; next[i] = null; submit(settle(next)); }} aria-label={`Limpar a posição ${i + 1}`}>{feature ? "Remover" : "Limpar"}</button>}
                {eligible > 0 && <button type="button" className="a-btn sm" onClick={() => { setOpenSlot(openSlot === i ? null : i); setQuery(""); setFound(null); }} aria-expanded={openSlot === i}>{slot ? "Substituir" : "Escolher produto"}</button>}
              </div>
            </div>
            <div className="mt-2">{slot ? <SlotCard slot={slot} /> : <p className="a-muted text-[0.875rem]">{feature ? "Escolha um produto para acrescentar." : "Vazia."}</p>}</div>
            {feature && slot && (
              <div className="mt-3 grid gap-3 border-t border-black/15 pt-3 sm:grid-cols-[6rem_1fr]">
                {/* eslint-disable-next-line @next/next/no-img-element -- an admin thumbnail of a media file */}
                {slot.image && thumbOf?.(slot.image.assetId) ? <img src={thumbOf(slot.image.assetId)} alt="" className="h-20 w-24 bg-neutral-200 object-cover" /> : <span aria-hidden className="flex h-20 w-24 items-center justify-center bg-neutral-200 text-center text-[0.75rem] text-neutral-600">sem banner</span>}
                <div className="min-w-0 space-y-2">
                  <div>
                    <label className="a-label" htmlFor={`featured-image-${i}`}>Banner deste produto</label>
                    <select id={`featured-image-${i}`} className="a-select" value={slot.image?.assetId ?? ""} onChange={(e) => setImage(i, e.target.value ? { assetId: e.target.value, alt: slot.image?.alt ?? "" } : undefined, true)} data-testid={`featured-image-${i + 1}`}>
                      <option value="">Sem banner próprio (imagem da seção ou foto do produto)</option>
                      <optgroup label="Banners do projeto">{media.filter((m) => m.kind === "banner").map((m) => <option key={m.assetId} value={m.assetId}>{m.label} ({m.width}×{m.height})</option>)}</optgroup>
                      {media.some((m) => m.kind === "upload") && <optgroup label="Enviadas">{media.filter((m) => m.kind === "upload").map((m) => <option key={m.assetId} value={m.assetId}>{m.label} ({m.width}×{m.height})</option>)}</optgroup>}
                    </select>
                    <p className="a-muted mt-1 text-[0.8125rem]">{sizeHintText(HERO_PANEL)}</p>
                  </div>
                  {slot.image && (
                    <div>
                      <label className="a-label" htmlFor={`featured-alt-${i}`}>Descrição do banner (opcional; vazio = decorativo)</label>
                      <input id={`featured-alt-${i}`} className="a-input" maxLength={200} value={slot.image.alt} onChange={(e) => setImage(i, { assetId: slot.image!.assetId, alt: e.target.value }, false)} onBlur={() => submit(slots)} />
                    </div>
                  )}
                </div>
              </div>
            )}
            {feature && slot?.image && (
              <PinsEditor
                slot={slot}
                index={i}
                picture={media.find((m) => m.assetId === slot.image!.assetId)}
                thumb={thumbOf?.(slot.image.assetId)}
                target={target}
                moving={moving}
                onPlace={(at) => {
                  if (moving?.slot === i) {
                    const pins = (slot.pins ?? []).map((p, k) => (k === moving.pin ? { ...p, ...at } : p));
                    setMoving(null);
                    submit(slots.map((s, k) => (k === i && s ? { ...s, pins } : s)));
                  } else if ((slot.pins?.length ?? 0) < MAX_PINS) {
                    setMoving(null);
                    setTarget({ slot: i, pin: "new", at });
                    setQuery("");
                    setFound(null);
                  }
                }}
                onMove={(pin) => { setTarget(null); setMoving(moving?.slot === i && moving.pin === pin ? null : { slot: i, pin }); }}
                onReplace={(pin) => { setMoving(null); setTarget({ slot: i, pin }); setQuery(""); setFound(null); }}
                onRemove={(pin) => { setMoving(null); setTarget(null); submit(slots.map((s, k) => (k === i && s ? { ...s, pins: (s.pins ?? []).filter((_, j) => j !== pin) } : s))); }}
                onMarkOwn={() => {
                  if (!target?.at) return;
                  const own: PinView = { value: slot.value, ...target.at, ok: slot.ok, reason: slot.reason, familyName: slot.familyName, cityName: slot.cityName, uf: slot.uf, imageUrl: slot.imageUrl };
                  setTarget(null);
                  submit(slots.map((s, k) => (k === i && s ? { ...s, pins: [...(s.pins ?? []), own] } : s)));
                }}
                onCancel={() => setTarget(null)}
              />
            )}
            {target?.slot === i && (target.pin !== undefined || openSlot === i) && (
              <div className="mt-3 border-t border-black/15 pt-3">
                {target.pin !== undefined && <p className="a-label">{target.pin === "new" ? "Qual produto está nessa marca?" : `Trocar o produto da marca ${(target.pin as number) + 1}`}</p>}
                <label className="a-label" htmlFor={`hero-search-${i}`}>{scope === "centro-oeste" ? "Buscar por cidade, Região Administrativa, UF, estilo, nome da peça ou ID do produto" : "Buscar por cidade, UF, estilo, nome da peça ou ID do produto"}</label>
                <input id={`hero-search-${i}`} className="a-input" value={query} onChange={(e) => run(e.target.value)} placeholder={scope === "centro-oeste" ? "Ex.: taguatinga · águas claras coordenadas · df · capivara · 123456" : "Ex.: belém coordenadas · pa · capivara · 123456"} autoComplete="off" />
                {pending && <p className="a-muted mt-2 text-[0.8125rem]">Buscando…</p>}
                {found?.error && <p className="a-flash err mt-2">{found.error}</p>}
                {found && !found.error && found.results.length === 0 && <p className="a-muted mt-2 text-[0.875rem]">Nenhum produto elegível encontrado na loja {regionName}.</p>}
                {found && found.results.length > 0 && (
                  <>
                    <p className="a-muted mt-2 text-[0.8125rem]">{found.total > found.results.length ? `Mostrando ${found.results.length} de ${found.total}. Refine a busca.` : `${found.total} resultado(s).`}</p>
                    <ul className="mt-2 grid gap-2 md:grid-cols-2" aria-label="Resultados">
                      {found.results.map((c) => {
                        const value = `${c.store}:${c.productId}`;
                        const forPin = target.pin !== undefined;
                        const already = forPin ? (slots[i]?.pins ?? []).some((p) => p.value === value) : slots.some((s) => s?.value === value);
                        return (
                          <li key={c.productId} className="flex items-start gap-3 border border-black/15 p-2">
                            <Thumb src={c.imageUrl} />
                            <div className="min-w-0 flex-1 text-[0.8125rem]">
                              <p className="font-bold">{c.familyName}{c.cityName ? ` · ${c.cityName} · ${c.uf}` : " · peça (sem cidade)"}{c.localityType === "administrative_region" ? " · Região Administrativa" : ""}</p>
                              <p className="a-muted">{c.price ?? "Sem preço"} · {c.primary ? "produto principal" : "outra versão"} · #{c.productId}</p>
                              <a href={c.buyUrl} target="_blank" rel="noreferrer" className="a-link">Ver na loja ↗</a>
                              <div className="mt-1"><button type="button" className="a-btn sm" disabled={already} onClick={() => {
                                if (forPin) {
                                  const chosen: PinView = { value, x: 0, y: 0, ok: true, reason: null, familyName: c.familyName, cityName: c.cityName, uf: c.uf, imageUrl: c.imageUrl };
                                  const current = slots[i]?.pins ?? [];
                                  const pins = target.pin === "new" ? [...current, { ...chosen, ...target.at! }] : current.map((p, k) => (k === target.pin ? { ...chosen, x: p.x, y: p.y } : p));
                                  setTarget(null);
                                  submit(slots.map((s, k) => (k === i && s ? { ...s, pins } : s)));
                                  return;
                                }
                                const next = [...slots];
                                next[i] = { ...fromCandidate(c), ...(slots[i]?.image ? { image: slots[i]!.image } : {}), ...(slots[i]?.pins ? { pins: slots[i]!.pins } : {}) };
                                setOpenSlot(null);
                                submit(next);
                              }}>{already ? (forPin ? "Já marcado nesta foto" : "Já escolhido") : forPin ? "Marcar este" : "Usar aqui"}</button></div>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </>
                )}
              </div>
            )}
          </li>
        ))}
      </ol>
      {scope === "sul" && <button type="button" className="a-btn ghost sm" onClick={() => submit(slots, "reset")}>Voltar aos três cards originais do código</button>}
    </fieldset>
  );
}

/**
 * The banner of one position with its marks ("compre o look"): the whole picture (uncropped, so a click lands where the shirt really is), a numbered
 * dot per marked product, and the list to move, change or remove each one. A click on the picture adds a mark there (then the search asks which
 * product it is) or, while one is being moved, puts it there.
 */
function PinsEditor({ slot, index, picture, thumb, target, moving, onPlace, onMove, onReplace, onRemove, onMarkOwn, onCancel }: {
  slot: FeaturedSlotView;
  index: number;
  picture?: MediaOption;
  thumb?: string;
  target: Target | null;
  moving: { slot: number; pin: number } | null;
  onPlace: (at: { x: number; y: number }) => void;
  onMove: (pin: number) => void;
  onReplace: (pin: number) => void;
  onRemove: (pin: number) => void;
  onMarkOwn: () => void;
  onCancel: () => void;
}) {
  const pins = slot.pins ?? [];
  const pending = target?.slot === index && target.pin === "new" ? target.at : undefined;
  const movingHere = moving?.slot === index ? moving.pin : null;
  const ownMarked = pins.some((p) => p.value === slot.value);
  if (!picture) return null;
  const pct = (n: number) => Math.round(Math.min(100, Math.max(0, n)) * 10) / 10;
  return (
    <div className="mt-3 border-t border-black/15 pt-3" data-testid={`pins-${index + 1}`}>
      <p className="a-label">Produtos marcados na foto (compre o look)</p>
      <p className="a-muted text-[0.8125rem]">
        Clique na foto, no meio da camiseta, para marcar o produto (até {MAX_PINS} por foto). Na loja, cada marca vira um “+” que abre o card do produto e a
        faixa embaixo da foto some. Sem marcas, fica a faixa de sempre, com o produto desta posição. Uma marca que cair fora do corte do celular não aparece
        nele: prefira marcas longe das bordas.
      </p>
      <div
        className={`relative mt-2 w-full max-w-[30rem] select-none overflow-hidden bg-neutral-200 ${pins.length < MAX_PINS || movingHere !== null ? "cursor-crosshair" : ""}`}
        style={{ aspectRatio: `${picture.width} / ${picture.height}` }}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          onPlace({ x: pct(((e.clientX - r.left) / r.width) * 100), y: pct(((e.clientY - r.top) / r.height) * 100) });
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- the media file itself, uncropped, so a click maps to the picture */}
        <img src={thumb ?? picture.src} alt="" className="absolute inset-0 h-full w-full object-cover" draggable={false} />
        {pins.map((p, k) => (
          <span key={p.value} aria-hidden="true" style={{ left: `${p.x}%`, top: `${p.y}%` }} className={`absolute grid h-7 w-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full text-[0.8125rem] font-bold shadow-[0_1px_6px_rgb(0_0_0/0.4)] ${movingHere === k ? "bg-black text-white" : p.ok ? "bg-white text-black" : "bg-[#b42318] text-white"}`}>
            {k + 1}
          </span>
        ))}
        {pending && <span aria-hidden="true" style={{ left: `${pending.x}%`, top: `${pending.y}%` }} className="absolute grid h-7 w-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-black text-[0.8125rem] font-bold text-white shadow-[0_1px_6px_rgb(0_0_0/0.4)]">?</span>}
      </div>
      {movingHere !== null && <p className="a-flash ok mt-2 text-[0.875rem]">Clique na foto onde a marca {movingHere + 1} deve ficar.</p>}
      {pending && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-[0.875rem]">Marca nova: escolha o produto abaixo{ownMarked ? "" : " ou"}</span>
          {!ownMarked && <button type="button" className="a-btn sm" onClick={onMarkOwn}>Marcar “{slot.familyName ?? "o produto desta posição"}{slot.cityName ? ` · ${slot.cityName}` : ""}”</button>}
          <button type="button" className="a-btn sm ghost" onClick={onCancel}>Cancelar</button>
        </div>
      )}
      {pins.length > 0 && (
        <ol className="mt-2 space-y-1.5">
          {pins.map((p, k) => (
            <li key={p.value} className="flex flex-wrap items-center gap-2 text-[0.875rem]">
              <span className="a-badge">{k + 1}</span>
              <span className="font-bold">{pinLine(p)}</span>
              {!p.ok && <span className="a-badge bad">Não aparece na loja: {p.reason}</span>}
              <span className="flex gap-1.5">
                <button type="button" className="a-btn sm ghost" onClick={() => onMove(k)} aria-pressed={movingHere === k}>{movingHere === k ? "Cancelar" : "Mover"}</button>
                <button type="button" className="a-btn sm ghost" onClick={() => onReplace(k)}>Trocar produto</button>
                <button type="button" className="a-btn sm ghost" onClick={() => onRemove(k)} aria-label={`Remover a marca ${k + 1}`}>Remover</button>
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
