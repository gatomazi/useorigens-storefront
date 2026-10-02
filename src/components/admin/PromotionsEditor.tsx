"use client";

import { useMemo, useState } from "react";
import { PromoWidget } from "@/components/promotions/PromoWidget";
import type { PromotionRow } from "@/lib/admin/promotions-form";
import { REGIONS, type RegionSlug } from "@/lib/geo/regions";
import { activePromotions, couponBadgeText, fromBrasiliaInput, MAX_PROMOTIONS, PROMO_CODE, PROMO_LIMITS, promotionStatus, toBrasiliaInput, toPublicPromotion, type PromoTheme, type PromotionItem, type PromotionStatus } from "@/lib/site-config/promotions";

const STATUS: Record<PromotionStatus, { text: string; cls: string }> = {
  live: { text: "No ar ao publicar", cls: "ok" },
  scheduled: { text: "Agendado", cls: "warn" },
  ended: { text: "Encerrado", cls: "bad" },
  disabled: { text: "Desativado", cls: "" },
};

const toRow = (p: PromotionItem): PromotionRow => ({
  id: p.id,
  type: p.type,
  enabled: p.enabled,
  title: p.title,
  code: p.code ?? "",
  description: p.description,
  callout: p.callout ?? "",
  badgeLabel: p.badgeLabel ?? "",
  startsAt: toBrasiliaInput(p.startsAt),
  endsAt: toBrasiliaInput(p.endsAt),
});

const blank = (type: PromotionRow["type"]): PromotionRow => ({ id: "", type, enabled: true, title: "", code: "", description: "", callout: "", badgeLabel: "", startsAt: "", endsAt: "" });

/** The rows as items, as far as they are usable (for status and preview only; the server re-validates everything on save). */
function asItem(r: PromotionRow, i: number): PromotionItem | null {
  const title = r.title.trim();
  const description = r.description.trim();
  const code = r.code.replace(/\s+/g, "");
  if (!title || !description || (r.type === "coupon" && !PROMO_CODE.test(code))) return null;
  const item: PromotionItem = { id: r.id || `novo-${i}`, type: r.type, enabled: r.enabled, title: title.slice(0, PROMO_LIMITS.title), description: description.slice(0, PROMO_LIMITS.description), order: i + 1 };
  if (r.callout.trim()) item.callout = r.callout.trim().slice(0, PROMO_LIMITS.callout);
  if (r.type === "coupon") {
    item.code = code;
    if (r.badgeLabel.trim()) item.badgeLabel = r.badgeLabel.trim().slice(0, PROMO_LIMITS.badgeLabel);
  }
  const s = fromBrasiliaInput(r.startsAt);
  const e = fromBrasiliaInput(r.endsAt);
  if (s) item.startsAt = s;
  if (e) item.endsAt = e;
  return item;
}

export function PromotionsEditor({ region, items, theme, now, readOnly, action, rev }: { region: RegionSlug; items: PromotionItem[]; theme: PromoTheme; now: number; readOnly: boolean; action: (fd: FormData) => Promise<void>; rev: string }) {
  const [rows, setRows] = useState<PromotionRow[]>(() => items.map(toRow));
  const [nudge, setNudge] = useState(0);
  const [showPanel, setShowPanel] = useState(true);
  const set = (i: number, patch: Partial<PromotionRow>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const move = (i: number, d: -1 | 1) => setRows((rs) => {
    const j = i + d;
    if (j < 0 || j >= rs.length) return rs;
    const next = [...rs];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });
  const remove = (i: number) => setRows((rs) => rs.filter((_, j) => j !== i));
  const add = (type: PromotionRow["type"]) => setRows((rs) => (rs.length >= MAX_PROMOTIONS ? rs : [...rs, blank(type)]));

  const parsed = useMemo(() => rows.map(asItem), [rows]);
  const live = useMemo(() => activePromotions({ items: parsed.filter((p): p is PromotionItem => p !== null) }, now).map((p, i) => toPublicPromotion(p, i + 1)), [parsed, now]);
  const badge = couponBadgeText(live);

  const field = (i: number, key: keyof PromotionRow, label: string, opts: { max?: number; hint?: string; placeholder?: string; mono?: boolean; area?: boolean } = {}) => {
    const id = `p${i}_${key}`;
    const value = rows[i][key] as string;
    return (
      <div>
        <label className="a-label" htmlFor={id}>{label}</label>
        {opts.area ? (
          <textarea id={id} className="a-textarea" rows={2} value={value} maxLength={opts.max} placeholder={opts.placeholder} disabled={readOnly} onChange={(e) => set(i, { [key]: e.target.value.replace(/\n/g, " ") })} data-testid={`promo-${key}-${i}`} />
        ) : (
          <input id={id} className={`a-input${opts.mono ? " font-mono" : ""}`} value={value} maxLength={opts.max} placeholder={opts.placeholder} disabled={readOnly} onChange={(e) => set(i, { [key]: e.target.value })} data-testid={`promo-${key}-${i}`} />
        )}
        {opts.hint && <p className="a-muted mt-1 text-[0.8125rem]">{opts.hint}</p>}
      </div>
    );
  };

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_26rem] xl:items-start">
      <form action={action} className="space-y-5" aria-label={`Cupons e promoções de ${REGIONS[region].name}`}>
        <input type="hidden" name="scope" value={region} />
        <input type="hidden" name="rev" value={rev} />
        <input type="hidden" name="items" value={JSON.stringify(rows)} />

        {rows.length === 0 && (
          <div className="a-card p-5" data-testid="promo-empty">
            <p className="font-semibold">Nenhum cupom ou promoção nesta região.</p>
            <p className="a-muted mt-1 text-[0.9375rem]">Sem itens, nem a loja nem as páginas da INK mostram o botão de cupons. Isso é válido.</p>
          </div>
        )}

        {rows.map((r, i) => {
          const item = parsed[i];
          const status = item ? STATUS[promotionStatus(item, now)] : { text: "Incompleto", cls: "warn" };
          return (
            <fieldset key={i} className="a-card space-y-4 p-5" data-testid={`promo-row-${i}`}>
              <legend className="sr-only">Item {i + 1}</legend>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[1rem] font-extrabold">{i + 1}. {r.type === "coupon" ? "Cupom" : "Promoção sem código"}</span>
                  <span className={`a-badge ${status.cls}`} data-testid={`promo-status-${i}`}>{status.text}</span>
                </div>
                {!readOnly && (
                  <div className="flex flex-wrap gap-1.5">
                    <button type="button" className="a-btn ghost sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Subir o item ${i + 1}`} data-testid={`promo-up-${i}`}>↑</button>
                    <button type="button" className="a-btn ghost sm" onClick={() => move(i, 1)} disabled={i === rows.length - 1} aria-label={`Descer o item ${i + 1}`} data-testid={`promo-down-${i}`}>↓</button>
                    <button type="button" className="a-btn danger sm" onClick={() => remove(i)} data-testid={`promo-remove-${i}`}>Remover</button>
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-x-6 gap-y-2">
                <label className="flex min-h-10 items-center gap-2 text-[0.9375rem] font-semibold">
                  <input type="checkbox" checked={r.enabled} disabled={readOnly} onChange={(e) => set(i, { enabled: e.target.checked })} data-testid={`promo-enabled-${i}`} />
                  Habilitado
                </label>
                <label className="flex min-h-10 items-center gap-2 text-[0.9375rem]">
                  Tipo
                  <select className="a-input w-auto" value={r.type} disabled={readOnly} onChange={(e) => set(i, { type: e.target.value === "promotion" ? "promotion" : "coupon" })} data-testid={`promo-type-${i}`}>
                    <option value="coupon">Cupom copiável</option>
                    <option value="promotion">Promoção sem código</option>
                  </select>
                </label>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {field(i, "title", "Título", { max: PROMO_LIMITS.title, placeholder: r.type === "coupon" ? "LEVE MAIS" : "Semana do Frete Grátis" })}
                {r.type === "coupon" && field(i, "code", "Código do cupom", { max: PROMO_LIMITS.code, mono: true, placeholder: "LEVEMAIS", hint: "Exatamente como está cadastrado na INK. É o que o botão Copiar copia." })}
              </div>
              {field(i, "description", "Descrição", { max: PROMO_LIMITS.description, area: true, placeholder: r.type === "coupon" ? "3 peças: R$ 30 OFF · 4 peças: R$ 50 OFF · 5 ou mais: R$ 75 OFF" : "1 peça RJ ou 2 peças demais estados" })}
              <div className="grid gap-4 sm:grid-cols-2">
                {field(i, "callout", "Chamada abaixo (opcional)", { max: PROMO_LIMITS.callout, placeholder: "Um cupom por pedido.", hint: "Vazia: a linha não aparece." })}
                {r.type === "coupon" && field(i, "badgeLabel", "Selo (opcional)", { max: PROMO_LIMITS.badgeLabel, placeholder: "Novo" })}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="a-label" htmlFor={`p${i}_startsAt`}>Início (horário de Brasília, opcional)</label>
                  <input id={`p${i}_startsAt`} type="datetime-local" className="a-input" value={r.startsAt} disabled={readOnly} onChange={(e) => set(i, { startsAt: e.target.value })} data-testid={`promo-startsAt-${i}`} />
                </div>
                <div>
                  <label className="a-label" htmlFor={`p${i}_endsAt`}>Fim (horário de Brasília, opcional)</label>
                  <input id={`p${i}_endsAt`} type="datetime-local" className="a-input" value={r.endsAt} disabled={readOnly} onChange={(e) => set(i, { endsAt: e.target.value })} data-testid={`promo-endsAt-${i}`} />
                </div>
              </div>
            </fieldset>
          );
        })}

        {readOnly ? <p className="a-muted">Somente leitura para o seu perfil.</p> : (
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="a-btn ghost" onClick={() => add("coupon")} disabled={rows.length >= MAX_PROMOTIONS} data-testid="promo-add-coupon">+ Cupom</button>
            <button type="button" className="a-btn ghost" onClick={() => add("promotion")} disabled={rows.length >= MAX_PROMOTIONS} data-testid="promo-add-promotion">+ Promoção sem código</button>
            <button type="submit" className="a-btn" data-testid="save-promotions">Salvar rascunho</button>
          </div>
        )}
      </form>

      <section className="a-card p-5 xl:sticky xl:top-6" aria-labelledby="promo-preview">
        <h2 id="promo-preview" className="a-h2">Prévia</h2>
        <p className="a-muted mt-1 text-[0.9375rem]">Os itens que estariam no ar agora, se você publicasse este rascunho, como aparecem na loja e nas páginas da INK. {badge ? `Selo do botão: ${badge}.` : "Sem cupons copiáveis: o botão aparece sem número."}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className="a-btn ghost sm" onClick={() => setShowPanel((v) => !v)} data-testid="promo-preview-toggle">{showPanel ? "Fechar o painel" : "Abrir o painel"}</button>
          <button type="button" className="a-btn ghost sm" onClick={() => setNudge((n) => n + 1)} data-testid="promo-preview-nudge">Ver a animação</button>
        </div>
        <div className="relative mt-4 h-[36rem] overflow-hidden border border-black/20 bg-[#e5e5e5]" data-testid="promo-preview-frame">
          {live.length === 0 ? (
            <p className="a-muted p-4 text-[0.9375rem]" data-testid="promo-preview-empty">Nada no ar: o botão não aparece (nenhum espaço reservado).</p>
          ) : (
            <PromoWidget key={showPanel ? "open" : "closed"} region={region} items={live} theme={theme} mode="preview" defaultOpen={showPanel} nudgeKey={nudge} />
          )}
        </div>
      </section>
    </div>
  );
}
