"use client";

import { useState } from "react";
import type { StudioArt } from "@/lib/site-config/schema";

type Row = { label: string; versions: { label: string; templateId: string; lightTemplateId: string }[] };
export type TemplateOption = { id: string; name: string };

const emptyVersion = () => ({ label: "", templateId: "", lightTemplateId: "" });
const toRows = (arts: StudioArt[]): Row[] => arts.map((a) => ({ label: a.label, versions: a.versions.map((v) => ({ label: v.label ?? "", templateId: v.templateId, lightTemplateId: v.lightTemplateId ?? "" })) }));

/**
 * The arts the customer picks from on a studio-based page: each art has one or more versions (e.g. Adulto / Infantil), and each version a base
 * for dark shirts and, optionally, one for light shirts. The list travels as JSON in one hidden input; `parseStudioArts` and the schema check it
 * again, so nothing here is trusted. With `disabled` (the bases could not be listed) nothing is posted and the saved arts are kept.
 */
export function StudioArtsEditor({ initial, templates, max, maxVersions, disabled = false }: { initial: StudioArt[]; templates: TemplateOption[]; max: number; maxVersions: number; disabled?: boolean }) {
  const [rows, setRows] = useState<Row[]>(() => toRows(initial));
  const known = new Set(templates.map((t) => t.id));
  const linked = initial.flatMap((a) => a.versions.flatMap((v) => [v.templateId, v.lightTemplateId ?? ""])).filter((id) => id && !known.has(id));
  const options = [...linked.map((id) => ({ id, name: `Base vinculada (${id})` })), ...templates];
  const setArt = (i: number, patch: Partial<Row>) => setRows((list) => list.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  const setVersion = (i: number, j: number, patch: Partial<Row["versions"][number]>) => setRows((list) => list.map((r, k) => (k === i ? { ...r, versions: r.versions.map((v, n) => (n === j ? { ...v, ...patch } : v)) } : r)));
  const move = (i: number, d: -1 | 1) => setRows((list) => {
    const j = i + d;
    if (j < 0 || j >= list.length) return list;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });
  const select = (id: string, value: string, onChange: (v: string) => void, empty: string) => (
    <select id={id} className="a-select" value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
      <option value="">{empty}</option>
      {options.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
    </select>
  );
  return (
    <div className="space-y-4">
      {!disabled && <input type="hidden" name="studio_arts_json" value={JSON.stringify(rows)} />}
      <ol className="space-y-4">
        {rows.map((r, i) => (
          <li key={i} className="border border-black/20 bg-white p-3" data-testid={`studio-art-${i}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="a-label !mb-0">Arte {i + 1}</p>
              <div className="flex gap-1.5">
                <button type="button" className="a-btn sm ghost" onClick={() => move(i, -1)} disabled={disabled || i === 0} aria-label={`Mover a arte ${i + 1} para cima`}>↑</button>
                <button type="button" className="a-btn sm ghost" onClick={() => move(i, 1)} disabled={disabled || i === rows.length - 1} aria-label={`Mover a arte ${i + 1} para baixo`}>↓</button>
                <button type="button" className="a-btn sm danger" onClick={() => setRows((l) => l.filter((_, k) => k !== i))} disabled={disabled} aria-label={`Remover a arte ${i + 1}`}>Remover</button>
              </div>
            </div>
            <label className="a-label mt-3" htmlFor={`art-label-${i}`}>Nome no seletor</label>
            <input id={`art-label-${i}`} className="a-input" value={r.label} maxLength={40} placeholder="Eu vim pela ceia" onChange={(e) => setArt(i, { label: e.target.value })} disabled={disabled} />
            {r.versions.map((v, j) => (
              <div key={j} className="mt-3 border-l-4 border-black/10 pl-3">
                <div className="flex flex-wrap items-end justify-between gap-2">
                  {r.versions.length > 1
                    ? <div className="min-w-0 flex-1"><label className="a-label" htmlFor={`art-${i}-v-${j}`}>Versão {j + 1}: nome</label><input id={`art-${i}-v-${j}`} className="a-input" value={v.label} maxLength={40} placeholder={j === 0 ? "Adulto" : "Infantil"} onChange={(e) => setVersion(i, j, { label: e.target.value })} disabled={disabled} /></div>
                    : <p className="a-muted text-[0.8125rem]">Uma versão. Adicione outra (por exemplo, Infantil) se a arte tiver.</p>}
                  {r.versions.length > 1 && <button type="button" className="a-btn sm danger" onClick={() => setArt(i, { versions: r.versions.filter((_, k) => k !== j) })} disabled={disabled}>Remover versão</button>}
                </div>
                <div className="mt-2 grid gap-3 md:grid-cols-2">
                  <div><label className="a-label" htmlFor={`art-${i}-v-${j}-dark`}>Base · camisetas escuras e coloridas</label>{select(`art-${i}-v-${j}-dark`, v.templateId, (value) => setVersion(i, j, { templateId: value }), "Escolha a base")}</div>
                  <div><label className="a-label" htmlFor={`art-${i}-v-${j}-light`}>Base · camisetas branca e cinza (opcional)</label>{select(`art-${i}-v-${j}-light`, v.lightTemplateId, (value) => setVersion(i, j, { lightTemplateId: value }), "Usar a mesma base")}</div>
                </div>
              </div>
            ))}
            {r.versions.length < maxVersions && <button type="button" className="a-btn sm ghost mt-3" onClick={() => setArt(i, { versions: [...r.versions, emptyVersion()] })} disabled={disabled}>Adicionar versão</button>}
          </li>
        ))}
      </ol>
      <button type="button" className="a-btn ghost" onClick={() => setRows((l) => (l.length < max ? [...l, { label: "", versions: [emptyVersion()] }] : l))} disabled={disabled || rows.length >= max}>Adicionar arte ({rows.length}/{max})</button>
    </div>
  );
}
