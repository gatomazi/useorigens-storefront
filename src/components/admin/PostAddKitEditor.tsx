"use client";

import { useState } from "react";
import { PostAddKitPreview } from "@/components/admin/PostAddKitPreview";
import { KIT_TEXT_LABEL } from "@/lib/admin/post-add-kit-form";
import { REGIONS, type RegionSlug } from "@/lib/geo/regions";
import { kitTiersSummary, kitUnsupportedReason, MAX_KIT_TIERS, type InkProgressivePromotion } from "@/lib/ink/progressive-promotions";
import { POST_ADD_KIT_DEFAULTS, POST_ADD_KIT_LIMITS, POST_ADD_KIT_TEXTS, type PostAddKitConfig, type PostAddKitText } from "@/lib/site-config/post-add-kit-schema";
import { formatBrasilia } from "@/lib/site-config/promotions";

/** "109,90" / "109.90" / "R$ 109,90" → cents, or null. */
function centsOf(raw: string): number | null {
  const m = /^\s*(?:R\$\s*)?(\d{1,5})(?:[.,](\d{1,2}))?\s*$/.exec(raw);
  if (!m) return null;
  const cents = Number(m[1]) * 100 + Number((m[2] ?? "0").padEnd(2, "0"));
  return cents > 0 ? cents : null;
}

export function PostAddKitEditor({ region, config, promotions, inkError, now, readOnly, action, rev, accent }: { region: RegionSlug; config?: PostAddKitConfig; promotions: InkProgressivePromotion[] | null; inkError: string | null; now: number; readOnly: boolean; action: (fd: FormData) => Promise<void>; rev: string; accent: string }) {
  const [enabled, setEnabled] = useState(config?.enabled ?? false);
  const [chosen, setChosen] = useState<number | null>(config?.promotionId ?? null);
  const [texts, setTexts] = useState<Record<PostAddKitText, string>>({ eyebrow: config?.eyebrow ?? "", title: config?.title ?? "", lead: config?.lead ?? "" });
  const [price, setPrice] = useState("109,90");

  const list = promotions ?? [];
  const picked = list.find((p) => p.id === chosen) ?? null;
  const pickedReason = picked ? kitUnsupportedReason(picked, now) : null;
  const savedMissing = promotions !== null && config?.promotionId !== undefined && !list.some((p) => p.id === config.promotionId);
  const codeLabel = picked?.code ?? (chosen === config?.promotionId ? config?.promotionCode : undefined) ?? "";
  const shownText = (key: PostAddKitText) => texts[key].trim() || POST_ADD_KIT_DEFAULTS[key];

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_26rem] xl:items-start">
      <form action={action} className="space-y-5" aria-label={`Monte seu kit de ${REGIONS[region].name}`}>
        <input type="hidden" name="scope" value={region} />
        <input type="hidden" name="rev" value={rev} />
        <input type="hidden" name="promotionId" value={chosen ?? ""} />
        <input type="hidden" name="promotionCode" value={codeLabel} />

        <fieldset className="a-card space-y-3 p-5">
          <legend className="a-label">No ar</legend>
          <label className="flex min-h-10 items-start gap-2 text-[0.9375rem]">
            <input type="checkbox" name="enabled" className="mt-1" checked={enabled} disabled={readOnly} onChange={(e) => setEnabled(e.target.checked)} data-testid="kit-enabled" />
            <span>
              <strong>Mostrar o kit depois de adicionar ao carrinho</strong>
              <span className="a-muted block text-[0.8125rem]">
                No modal “Produto adicionado ao carrinho” da INK, acima do botão, com as faixas da promoção escolhida abaixo. “Ver carrinho” passa a se chamar
                “Finalizar compra” (continua sendo o da INK) e o “Continuar comprando” sai: a busca de estampas logo abaixo faz esse papel, e o × fecha o
                modal. Desligado: o modal volta a ser como a INK desenha.
              </span>
            </span>
          </label>
        </fieldset>

        <fieldset className="a-card space-y-3 p-5" data-testid="kit-promotions">
          <legend className="a-label">Promoção progressiva da INK</legend>
          <p className="a-muted text-[0.8125rem]">
            A lista vem da INK agora. As faixas, o código e as datas são os da INK: mudou lá, muda no modal em poucos minutos, sem salvar nada aqui. Para criar ou
            mudar uma promoção, use o painel da INK. Mostramos até {MAX_KIT_TIERS} faixas.
          </p>
          {inkError && <p className="a-badge warn" data-testid="kit-ink-error">{inkError}</p>}
          {savedMissing && <p className="a-badge bad" data-testid="kit-missing">A promoção escolhida antes ({config?.promotionCode ?? `#${config?.promotionId}`}) não aparece mais na INK. Escolha outra.</p>}
          {promotions !== null && list.length === 0 && <p className="text-[0.9375rem]" data-testid="kit-none">A loja não tem nenhuma promoção progressiva na INK.</p>}
          {list.map((p) => {
            const reason = kitUnsupportedReason(p, now);
            const scheduled = !reason && p.startsAt !== null && Date.parse(p.startsAt) > now;
            return (
              <label key={p.id} className={`flex items-start gap-3 border p-3 ${chosen === p.id ? "border-black" : "border-black/15"} ${reason ? "opacity-70" : "cursor-pointer"}`} data-testid={`kit-promotion-${p.code}`}>
                <input type="radio" name="promotion_choice" className="mt-1" checked={chosen === p.id} disabled={readOnly || (reason !== null && chosen !== p.id)} onChange={() => setChosen(p.id)} />
                <span className="min-w-0 space-y-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <strong className="text-[1rem]">{p.code}</strong>
                    {reason ? <span className="a-badge bad">Não dá para usar</span> : scheduled ? <span className="a-badge warn">Começa {formatBrasilia(p.startsAt as string)}</span> : <span className="a-badge ok">Pode ser o kit</span>}
                    <span className="a-badge">{p.applyAutomatically ? "Aplicada sozinha" : "Cliente digita o cupom"}</span>
                    <span className="a-badge" title={p.showInCart ? undefined : "Na INK, a promoção não aparece no carrinho nem na página do produto: confira se ela é para todo mundo antes de ligar."}>{p.showInCart ? "A INK também mostra no carrinho" : "A INK não mostra no carrinho"}</span>
                  </span>
                  <span className="block text-[0.875rem]">{p.tiers.length > 0 ? kitTiersSummary(p) : "Sem faixas por quantidade"}</span>
                  {p.tiers.length > MAX_KIT_TIERS && <span className="a-muted block text-[0.8125rem]">O modal mostra só as {MAX_KIT_TIERS} primeiras faixas.</span>}
                  {p.expiresAt && <span className="a-muted block text-[0.8125rem]">Termina {formatBrasilia(p.expiresAt)}</span>}
                  {p.usageLimit !== null && <span className="a-muted block text-[0.8125rem]">Limite de {p.usageLimit} usos na INK.</span>}
                  {reason && <span className="block text-[0.8125rem] text-[#6f1712]">{reason}</span>}
                </span>
              </label>
            );
          })}
          {enabled && chosen === null && <p className="text-[0.8125rem] text-[#6b4a0c]">Escolha uma promoção para ligar o kit.</p>}
          {enabled && pickedReason && <p className="text-[0.8125rem] text-[#6f1712]">Essa promoção não pode ser mostrada no kit: {pickedReason}</p>}
        </fieldset>

        <fieldset className="a-card space-y-4 p-5">
          <legend className="a-label">Textos (opcionais)</legend>
          {POST_ADD_KIT_TEXTS.map((key) => (
            <div key={key}>
              <label className="a-label" htmlFor={`kit_${key}`}>{KIT_TEXT_LABEL[key]}</label>
              <input id={`kit_${key}`} name={key} className="a-input" value={texts[key]} maxLength={POST_ADD_KIT_LIMITS[key]} placeholder={POST_ADD_KIT_DEFAULTS[key]} disabled={readOnly} onChange={(e) => setTexts((t) => ({ ...t, [key]: e.target.value }))} data-testid={`kit-${key}`} />
              <p className="a-muted mt-1 text-[0.8125rem]">{texts[key].length}/{POST_ADD_KIT_LIMITS[key]}. Vazio: usa o texto padrão (em cinza).</p>
            </div>
          ))}
          <p className="a-muted text-[0.8125rem]">Logo abaixo das faixas vem sempre o aviso “Em peças com preços diferentes, o total do kit pode variar.”: os valores usam o preço da peça que acabou de ser adicionada.</p>
        </fieldset>

        {!readOnly && <button type="submit" className="a-btn" data-testid="kit-save">Salvar rascunho</button>}
      </form>

      <aside className="space-y-3 xl:sticky xl:top-4" aria-label="Prévia do kit">
        <p className="a-label">Prévia no celular</p>
        {picked && picked.tiers.length > 0 ? (
          <PostAddKitPreview eyebrow={shownText("eyebrow")} title={shownText("title")} lead={shownText("lead")} code={picked.code} auto={picked.applyAutomatically} kind={picked.kind} tiers={picked.tiers} unitCents={centsOf(price)} accent={accent} />
        ) : (
          <p className="a-card a-muted p-4 text-[0.875rem]">Escolha uma promoção para ver a prévia.</p>
        )}
        <div>
          <label className="a-label" htmlFor="kit_price">Preço da peça na prévia</label>
          <input id="kit_price" className="a-input w-32" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} data-testid="kit-price" />
          <p className="a-muted mt-1 text-[0.8125rem]">Só para a prévia. Na INK vale o preço da peça adicionada; sem preço legível, o modal mostra só o desconto de cada faixa (apague o preço para ver).</p>
        </div>
      </aside>
    </div>
  );
}
