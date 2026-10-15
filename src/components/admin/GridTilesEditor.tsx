"use client";

import { useRef, useState } from "react";
import type { ComboEntry } from "@/components/admin/CollectionCombobox";
import type { MediaOption } from "@/components/admin/SectionEditorForm";
import { MAX_GRID_TILES, MIN_GRID_TILES, type GridLayout, type GridTile } from "@/lib/site-config/schema";

type DestKind = "collection-page" | "ink-collection" | "page" | "route" | "anchor" | "external";
type Row = { key: number; label: string; caption: string; image: string; kind: DestKind; collection: string; page: string; route: string; url: string; anchor: string };

const emptyRow = (key: number, scope: string): Row => ({ key, label: "", caption: "", image: "", kind: "collection-page", collection: "", page: "", route: `/${scope}`, url: "", anchor: "" });

function toRow(t: GridTile, key: number, scope: string): Row {
  const d = t.dest;
  return {
    ...emptyRow(key, scope),
    label: t.label,
    caption: t.caption ?? "",
    image: t.image?.assetId ?? "",
    kind: d.kind,
    collection: d.kind === "ink-collection" || d.kind === "collection-page" ? `${d.store}:${d.collectionId}` : "",
    page: d.kind === "page" ? `${d.pageKind}/${d.slug}` : "",
    route: d.kind === "route" ? d.path : `/${scope}`,
    url: d.kind === "external" ? d.url : "",
    anchor: d.kind === "anchor" ? d.anchor : "",
  };
}

const ASPECT_CLASS: Record<GridLayout["aspect"], string> = { square: "aspect-square", portrait: "aspect-[4/5]", landscape: "aspect-[4/3]" };

/**
 * The image grid's tiles, edited as a list (add, remove, reorder). Every field is controlled, so reordering moves the values with their row; the
 * rows post as `tile_<i>_*` in their current order plus `tile_count`, parsed by `parseGridTiles` (src/lib/admin/section-form.ts).
 */
export function GridTilesEditor({
  scope, tiles, layout, media, thumbOf, collections, pages, anchors,
}: {
  scope: string;
  tiles: GridTile[];
  layout: GridLayout;
  media: MediaOption[];
  thumbOf: (assetId: string) => string | undefined;
  /** Public INK collections of this region with a verified page (the only ones a tile may open). */
  collections: ComboEntry[];
  pages: { value: string; label: string; live: boolean }[];
  anchors: { anchor: string; label: string }[];
}) {
  const nextKey = useRef(tiles.length);
  const [rows, setRows] = useState<Row[]>(() => tiles.map((t, i) => toRow(t, i, scope)));
  const [aspect, setAspect] = useState(layout.aspect);

  const patch = (key: number, change: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...change } : r)));
  const move = (index: number, by: -1 | 1) =>
    setRows((rs) => {
      const to = index + by;
      if (to < 0 || to >= rs.length) return rs;
      const next = [...rs];
      [next[index], next[to]] = [next[to], next[index]];
      return next;
    });
  const add = () => setRows((rs) => (rs.length >= MAX_GRID_TILES ? rs : [...rs, emptyRow(nextKey.current++, scope)]));
  const remove = (key: number) => setRows((rs) => rs.filter((r) => r.key !== key));

  const uploads = media.filter((m) => m.kind === "upload");
  const banners = media.filter((m) => m.kind === "banner");

  return (
    <>
      <fieldset className="space-y-4">
        <legend className="a-h2 mb-3">Layout da grade</legend>
        <input type="hidden" name="grid_present" value="1" />
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label className="a-label" htmlFor="grid_columns">Colunas no desktop</label>
            <select id="grid_columns" name="grid_columns" className="a-select" defaultValue={String(layout.columns)}>
              <option value="2">2</option>
              <option value="3">3</option>
              <option value="4">4</option>
            </select>
          </div>
          <div>
            <label className="a-label" htmlFor="grid_aspect">Formato das imagens</label>
            <select id="grid_aspect" name="grid_aspect" className="a-select" value={aspect} onChange={(e) => setAspect(e.target.value as GridLayout["aspect"])}>
              <option value="portrait">Retrato (4:5)</option>
              <option value="square">Quadrado (1:1)</option>
              <option value="landscape">Paisagem (4:3)</option>
            </select>
          </div>
          <div>
            <label className="a-label" htmlFor="grid_labels">Nome do bloco</label>
            <select id="grid_labels" name="grid_labels" className="a-select" defaultValue={layout.labels}>
              <option value="below">Embaixo da imagem</option>
              <option value="overlay">Sobre a imagem (texto branco)</option>
            </select>
          </div>
        </div>
        <p className="a-muted text-[0.8125rem]">No celular, a grade mostra sempre dois blocos lado a lado.</p>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="a-h2 mb-3">Blocos</legend>
        <input type="hidden" name="tile_count" value={rows.length} />
        <p className="a-muted text-[0.875rem]">De {MIN_GRID_TILES} a {MAX_GRID_TILES} blocos, na ordem da lista. As imagens vêm de Mídia (envie lá as fotos de cada peça ou coleção). Sem imagem, o bloco vira uma placa na cor da região.</p>
        <ol className="space-y-4">
          {rows.map((r, i) => {
            const id = (field: string) => `tile_${i}_${field}`;
            const thumb = r.image ? thumbOf(r.image) : undefined;
            return (
              <li key={r.key} className="border border-black/15 bg-white p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-extrabold">Bloco {i + 1}{r.label ? ` · ${r.label}` : ""}</p>
                  <div className="flex gap-2">
                    <button type="button" className="a-btn ghost sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Subir o bloco ${i + 1}`}>↑</button>
                    <button type="button" className="a-btn ghost sm" onClick={() => move(i, 1)} disabled={i === rows.length - 1} aria-label={`Descer o bloco ${i + 1}`}>↓</button>
                    <button type="button" className="a-btn ghost sm" onClick={() => remove(r.key)} disabled={rows.length <= MIN_GRID_TILES} aria-label={`Remover o bloco ${i + 1}`}>Remover</button>
                  </div>
                </div>
                <div className="mt-3 grid gap-4 md:grid-cols-[7rem_1fr]">
                  <div className={`relative w-28 overflow-hidden border border-black/20 ${thumb ? "bg-neutral-200" : "bg-[#4d543d]"} ${ASPECT_CLASS[aspect]}`} aria-hidden>
                    {thumb && (
                      // eslint-disable-next-line @next/next/no-img-element -- an admin thumbnail of the chosen media
                      <img src={thumb} alt="" className="absolute inset-0 h-full w-full object-cover" />
                    )}
                  </div>
                  <div className="space-y-3">
                    <div className="grid gap-3 md:grid-cols-2">
                      <div><label className="a-label" htmlFor={id("label")}>Nome</label><input id={id("label")} name={id("label")} value={r.label} onChange={(e) => patch(r.key, { label: e.target.value })} className="a-input" maxLength={40} placeholder="Camisetas" required /></div>
                      <div><label className="a-label" htmlFor={id("caption")}>Legenda (opcional)</label><input id={id("caption")} name={id("caption")} value={r.caption} onChange={(e) => patch(r.key, { caption: e.target.value })} className="a-input" maxLength={80} placeholder="Do mapa às coordenadas" /></div>
                    </div>
                    <div>
                      <label className="a-label" htmlFor={id("image")}>Imagem</label>
                      <select id={id("image")} name={id("image")} className="a-select" value={r.image} onChange={(e) => patch(r.key, { image: e.target.value })}>
                        <option value="">Sem imagem (placa na cor da região)</option>
                        {uploads.length > 0 && <optgroup label="Enviadas">{uploads.map((m) => <option key={m.assetId} value={m.assetId}>{m.label} ({m.width}×{m.height})</option>)}</optgroup>}
                        <optgroup label="Banners do projeto">{banners.map((m) => <option key={m.assetId} value={m.assetId}>{m.label} ({m.width}×{m.height})</option>)}</optgroup>
                      </select>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div>
                        <label className="a-label" htmlFor={id("kind")}>Leva para</label>
                        <select id={id("kind")} name={id("kind")} className="a-select" value={r.kind} onChange={(e) => patch(r.key, { kind: e.target.value as DestKind })}>
                          <option value="collection-page">Página da coleção (no site, com todos os produtos)</option>
                          <option value="ink-collection">Coleção da INK (página na loja da INK)</option>
                          <option value="page">Hotpage ou categoria-pai publicada</option>
                          <option value="route">Página desta loja (endereço)</option>
                          <option value="anchor">Uma seção desta página</option>
                          <option value="external">URL da loja Use (Sul, Norte ou Centro)</option>
                        </select>
                      </div>
                      {(r.kind === "ink-collection" || r.kind === "collection-page") && (
                        <div>
                          <label className="a-label" htmlFor={id("collection")}>Coleção</label>
                          <select id={id("collection")} name={id("collection")} className="a-select" value={r.collection} onChange={(e) => patch(r.key, { collection: e.target.value })} required>
                            <option value="" disabled>Escolha…</option>
                            {/* INK has a page only for its public collections; ours exists for every one the region can use. */}
                            {collections.filter((c) => r.kind === "collection-page" || c.visibility === "public").map((c) => <option key={c.value} value={c.value}>{c.name} · {c.matchedCount} produtos{c.visibility === "internal" ? " · interna" : ""}</option>)}
                          </select>
                        </div>
                      )}
                      {r.kind === "page" && (
                        <div>
                          <label className="a-label" htmlFor={id("page")}>Página</label>
                          <select id={id("page")} name={id("page")} className="a-select" value={r.page} onChange={(e) => patch(r.key, { page: e.target.value })} required>
                            <option value="" disabled>Escolha…</option>
                            {pages.map((p) => <option key={p.value} value={p.value}>{p.label}{p.live ? "" : " (ainda não publicada)"}</option>)}
                          </select>
                        </div>
                      )}
                      {r.kind === "route" && <div><label className="a-label" htmlFor={id("route")}>Caminho (dentro de /{scope})</label><input id={id("route")} name={id("route")} value={r.route} onChange={(e) => patch(r.key, { route: e.target.value })} className="a-input" placeholder={`/${scope}/outros-artigos`} required /></div>}
                      {r.kind === "anchor" && (
                        <div>
                          <label className="a-label" htmlFor={id("anchor")}>Seção</label>
                          <select id={id("anchor")} name={id("anchor")} className="a-select" value={r.anchor} onChange={(e) => patch(r.key, { anchor: e.target.value })} required>
                            <option value="" disabled>Escolha…</option>
                            {anchors.map((a) => <option key={a.anchor} value={a.anchor}>{a.label}</option>)}
                          </select>
                        </div>
                      )}
                      {r.kind === "external" && <div><label className="a-label" htmlFor={id("url")}>URL (https, hosts Use Sul/Norte/Centro)</label><input id={id("url")} name={id("url")} value={r.url} onChange={(e) => patch(r.key, { url: e.target.value })} className="a-input" placeholder="https://www.usesul.com.br/usesul/collections/…" required /></div>}
                    </div>
                    {r.kind === "page" && <p className="a-muted text-[0.8125rem]">Só é possível publicar quando a página escolhida já estiver publicada e ativa.</p>}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
        <button type="button" className="a-btn ghost" onClick={add} disabled={rows.length >= MAX_GRID_TILES}>Adicionar bloco ({rows.length}/{MAX_GRID_TILES})</button>
      </fieldset>
    </>
  );
}
