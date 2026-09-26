"use client";

import { useState } from "react";

export type EditableField = { key?: string; label: string; placeholder?: string; helperText?: string; required: boolean; maxLength: number; defaultValue?: string };

/**
 * The model's text fields as editable rows (add, remove, reorder). The list travels to the server as JSON in one hidden input; the server parses it
 * strictly (`parseCustomizerForm`) and the schema validates it again, so nothing here is trusted. Keys are kept once a field exists.
 */
export function CustomFieldsEditor({ initial, max = 10 }: { initial: EditableField[]; max?: number }) {
  const [rows, setRows] = useState<EditableField[]>(initial);
  const set = (i: number, patch: Partial<EditableField>) => setRows((list) => list.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  const move = (i: number, d: -1 | 1) => setRows((list) => {
    const j = i + d;
    if (j < 0 || j >= list.length) return list;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });
  return (
    <fieldset className="space-y-4">
      <legend className="a-h2 mb-3">Campos de texto</legend>
      <input type="hidden" name="fields_json" value={JSON.stringify(rows)} />
      <p className="a-muted text-[0.875rem]">Até {max} campos. Cidade, localidade, legenda, nome… o que o modelo pedir. Rótulo, ajuda, exemplo, valor inicial, obrigatoriedade e limite de caracteres são dados do modelo.</p>
      <ol className="space-y-4">
        {rows.map((r, i) => (
          <li key={i} className="border border-black/20 bg-white p-3" data-testid={`field-row-${i}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="a-label !mb-0">Campo {i + 1}{r.key ? <span className="a-muted font-normal"> · chave {r.key}</span> : null}</p>
              <div className="flex gap-1.5">
                <button type="button" className="a-btn sm ghost" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Mover o campo ${i + 1} para cima`}>↑</button>
                <button type="button" className="a-btn sm ghost" onClick={() => move(i, 1)} disabled={i === rows.length - 1} aria-label={`Mover o campo ${i + 1} para baixo`}>↓</button>
                <button type="button" className="a-btn sm danger" onClick={() => setRows((l) => l.filter((_, k) => k !== i))} aria-label={`Remover o campo ${i + 1}`}>Remover</button>
              </div>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div><label className="a-label" htmlFor={`f-label-${i}`}>Rótulo (o que o cliente vê)</label><input id={`f-label-${i}`} className="a-input" value={r.label} maxLength={60} onChange={(e) => set(i, { label: e.target.value })} /></div>
              <div><label className="a-label" htmlFor={`f-max-${i}`}>Máximo de caracteres</label><input id={`f-max-${i}`} type="number" min={1} max={200} className="a-input" value={r.maxLength} onChange={(e) => set(i, { maxLength: Number(e.target.value) || 30 })} /></div>
              <div><label className="a-label" htmlFor={`f-ph-${i}`}>Exemplo (placeholder)</label><input id={`f-ph-${i}`} className="a-input" value={r.placeholder ?? ""} maxLength={80} onChange={(e) => set(i, { placeholder: e.target.value })} /></div>
              <div><label className="a-label" htmlFor={`f-def-${i}`}>Valor inicial (opcional)</label><input id={`f-def-${i}`} className="a-input" value={r.defaultValue ?? ""} maxLength={120} onChange={(e) => set(i, { defaultValue: e.target.value })} /></div>
              <div className="md:col-span-2"><label className="a-label" htmlFor={`f-help-${i}`}>Texto de ajuda (opcional)</label><input id={`f-help-${i}`} className="a-input" value={r.helperText ?? ""} maxLength={200} onChange={(e) => set(i, { helperText: e.target.value })} /></div>
              <label className="flex items-center gap-2 font-bold"><input type="checkbox" checked={r.required} onChange={(e) => set(i, { required: e.target.checked })} /> Obrigatório</label>
            </div>
          </li>
        ))}
      </ol>
      <button type="button" className="a-btn ghost" onClick={() => setRows((l) => (l.length < max ? [...l, { label: "", required: false, maxLength: 30 }] : l))} disabled={rows.length >= max}>Adicionar campo ({rows.length}/{max})</button>
    </fieldset>
  );
}
