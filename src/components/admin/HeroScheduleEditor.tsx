"use client";

import { useRef, useState } from "react";
import type { ComboEntry } from "@/components/admin/CollectionCombobox";
import { periodLabel, todayInBrasilia } from "@/lib/site-config/checkpoints";
import { MAX_HERO_SCHEDULE, type Destination, type HeroScheduleEntry } from "@/lib/site-config/schema";

type DestKind = "page" | "collection-page" | "anchor" | "route";
type Row = { key: number; from: string; to: string; title: string; subtitle: string; label: string; kind: DestKind; page: string; collection: string; anchor: string; route: string };

const emptyRow = (key: number, scope: string): Row => ({ key, from: "", to: "", title: "", subtitle: "", label: "", kind: "page", page: "", collection: "", anchor: "", route: `/${scope}` });

function toRow(e: HeroScheduleEntry, key: number, scope: string): Row {
  const d: Destination | undefined = e.cta?.dest;
  return {
    ...emptyRow(key, scope),
    from: e.from,
    to: e.to,
    title: e.title ?? "",
    subtitle: e.subtitle ?? "",
    label: e.cta?.label ?? "",
    kind: d && (d.kind === "page" || d.kind === "collection-page" || d.kind === "anchor" || d.kind === "route") ? d.kind : "page",
    page: d?.kind === "page" ? `${d.pageKind}/${d.slug}` : "",
    collection: d?.kind === "collection-page" ? `${d.store}:${d.collectionId}` : "",
    anchor: d?.kind === "anchor" ? d.anchor : "",
    route: d?.kind === "route" ? d.path : `/${scope}`,
  };
}

/**
 * "Textos programados" of the opening (CMS `heroSchedule`): for each period, the title, text and button the opening shows instead of its own (the
 * Black Month calendar: the eve, each week, the day between two weeks). Posted as `hero_sched_<i>_*` in the list's order plus `hero_sched_count`,
 * parsed by `parseHeroSchedule` (src/lib/admin/section-form.ts). The row in force today is marked, so the calendar and the texts never drift unseen.
 */
export function HeroScheduleEditor({ scope, entries, pages, collections, anchors }: {
  scope: string;
  entries: HeroScheduleEntry[];
  pages: { value: string; label: string; live: boolean }[];
  /** The region's collections with a page on the site. */
  collections: ComboEntry[];
  anchors: { anchor: string; label: string }[];
}) {
  const nextKey = useRef(entries.length);
  const [rows, setRows] = useState<Row[]>(() => entries.map((e, i) => toRow(e, i, scope)));
  const today = todayInBrasilia();
  const patch = (key: number, change: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...change } : r)));
  const add = () => setRows((rs) => (rs.length >= MAX_HERO_SCHEDULE ? rs : [...rs, emptyRow(nextKey.current++, scope)]));
  const remove = (key: number) => setRows((rs) => rs.filter((r) => r.key !== key));

  return (
    <fieldset className="space-y-4" data-testid="hero-schedule">
      <legend className="a-h2 mb-2">Textos programados</legend>
      <input type="hidden" name="hero_sched_present" value="1" />
      <input type="hidden" name="hero_sched_count" value={rows.length} />
      <p className="a-muted max-w-3xl text-[0.875rem]">
        Para o calendário da Black: em cada período, a abertura troca o título, o texto e, se houver, mostra um botão no lugar da busca (a busca continua no topo da loja). Dias no horário de Brasília, os dois inclusive; um período não pode encostar em outro. Fora deles, valem o título e o subtítulo acima. Título vazio = o título acima. Para ver um dia futuro, abra a prévia com <code>&amp;data=2026-11-08</code>.
      </p>
      <ol className="space-y-3">
        {rows.map((r, i) => {
          const id = (k: string) => `hero_sched_${i}_${k}`;
          const live = r.from && r.from <= today && today <= (r.to || r.from);
          return (
            <li key={r.key} className="border border-black/15 bg-white p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-extrabold">
                  {periodLabel({ opensAt: r.from || undefined, closesAt: r.to || r.from || undefined }) ?? `Texto ${i + 1}`}
                  {live && <span className="a-badge ok ml-2">No ar hoje</span>}
                </p>
                <button type="button" className="a-btn ghost sm" onClick={() => remove(r.key)} aria-label={`Remover o texto programado ${i + 1}`}>Remover</button>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div><label className="a-label" htmlFor={id("from")}>Primeiro dia</label><input id={id("from")} name={id("from")} type="date" value={r.from} onChange={(e) => patch(r.key, { from: e.target.value })} className="a-input" required /></div>
                <div><label className="a-label" htmlFor={id("to")}>Último dia (inclusive)</label><input id={id("to")} name={id("to")} type="date" value={r.to} min={r.from || undefined} onChange={(e) => patch(r.key, { to: e.target.value })} className="a-input" placeholder="O mesmo dia" /></div>
                <div><label className="a-label" htmlFor={id("title")}>Título (uma linha por linha da abertura; vazio = o título acima)</label><textarea id={id("title")} name={id("title")} value={r.title} onChange={(e) => patch(r.key, { title: e.target.value })} className="a-textarea" rows={3} maxLength={120} placeholder={"Sua origem\nvai entrar na\nBlack."} /></div>
                <div><label className="a-label" htmlFor={id("subtitle")}>Texto (vazio = o subtítulo acima)</label><textarea id={id("subtitle")} name={id("subtitle")} value={r.subtitle} onChange={(e) => patch(r.key, { subtitle: e.target.value })} className="a-textarea" rows={3} maxLength={300} /></div>
                <div><label className="a-label" htmlFor={id("cta_label")}>Botão (vazio = a busca)</label><input id={id("cta_label")} name={id("cta_label")} value={r.label} onChange={(e) => patch(r.key, { label: e.target.value })} className="a-input" maxLength={32} placeholder="Ver calendário da Black" /></div>
                {r.label && (
                  <div className="grid gap-2">
                    <div>
                      <label className="a-label" htmlFor={id("cta_kind")}>O botão leva para</label>
                      <select id={id("cta_kind")} name={id("cta_kind")} className="a-select" value={r.kind} onChange={(e) => patch(r.key, { kind: e.target.value as DestKind })}>
                        <option value="page">Hotpage publicada</option>
                        <option value="collection-page">Página de uma coleção</option>
                        <option value="anchor">Uma seção desta página</option>
                        <option value="route">Página desta loja (endereço)</option>
                      </select>
                    </div>
                    {r.kind === "page" && (
                      <select aria-label="Hotpage" name={id("cta_page")} className="a-select" value={r.page} onChange={(e) => patch(r.key, { page: e.target.value })} required>
                        <option value="" disabled>Escolha…</option>
                        {pages.map((p) => <option key={p.value} value={p.value}>{p.label}{p.live ? "" : " (ainda não publicada)"}</option>)}
                      </select>
                    )}
                    {r.kind === "collection-page" && (
                      <select aria-label="Coleção" name={id("cta_collection")} className="a-select" value={r.collection} onChange={(e) => patch(r.key, { collection: e.target.value })} required>
                        <option value="" disabled>Escolha…</option>
                        {collections.map((c) => <option key={c.value} value={c.value}>{c.name} · {c.matchedCount} produtos{c.visibility === "internal" ? " · interna" : ""}</option>)}
                      </select>
                    )}
                    {r.kind === "anchor" && (
                      <select aria-label="Seção" name={id("cta_anchor")} className="a-select" value={r.anchor} onChange={(e) => patch(r.key, { anchor: e.target.value })} required>
                        <option value="" disabled>Escolha…</option>
                        {anchors.map((a) => <option key={a.anchor} value={a.anchor}>{a.label}</option>)}
                      </select>
                    )}
                    {r.kind === "route" && <input aria-label={`Caminho (dentro de /${scope})`} name={id("cta_route")} value={r.route} onChange={(e) => patch(r.key, { route: e.target.value })} className="a-input" required />}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      <button type="button" className="a-btn ghost" onClick={add} disabled={rows.length >= MAX_HERO_SCHEDULE}>Adicionar texto programado ({rows.length}/{MAX_HERO_SCHEDULE})</button>
    </fieldset>
  );
}
