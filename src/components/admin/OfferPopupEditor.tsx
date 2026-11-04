"use client";

import { useState } from "react";
import { OfferPopup } from "@/components/promotions/OfferPopup";
import { OFFER_TEXT_LABEL } from "@/lib/admin/offer-popup-form";
import { REGIONS, type RegionSlug } from "@/lib/geo/regions";
import { kitTiersSummary, type InkProgressivePromotion } from "@/lib/ink/progressive-promotions";
import { MAX_OFFER_CARDS, offerDefaultTitle, offerUnsupportedReason, type OfferTheme, type PublicOffer } from "@/lib/site-config/offer-popup";
import { OFFER_HREF_MAX, OFFER_POPUP_DEFAULTS, OFFER_POPUP_LIMITS, OFFER_POPUP_TEXTS, type OfferPopupConfig, type OfferPopupText } from "@/lib/site-config/offer-popup-schema";
import { formatBrasilia } from "@/lib/site-config/promotions";

export function OfferPopupEditor({ region, config, promotions, inkError, now, readOnly, action, rev, theme }: { region: RegionSlug; config?: OfferPopupConfig; promotions: InkProgressivePromotion[] | null; inkError: string | null; now: number; readOnly: boolean; action: (fd: FormData) => Promise<void>; rev: string; theme: OfferTheme }) {
  const [enabled, setEnabled] = useState(config?.enabled ?? false);
  const [chosen, setChosen] = useState<number | null>(config?.promotionId ?? null);
  const [texts, setTexts] = useState<Record<OfferPopupText, string>>({ eyebrow: config?.eyebrow ?? "", title: config?.title ?? "", lead: config?.lead ?? "", cta: config?.cta ?? "" });
  const [href, setHref] = useState(config?.ctaHref ?? "");

  const list = promotions ?? [];
  const picked = list.find((p) => p.id === chosen) ?? null;
  const pickedReason = picked ? offerUnsupportedReason(picked, now) : null;
  const savedMissing = promotions !== null && config?.promotionId !== undefined && !list.some((p) => p.id === config.promotionId);
  const codeLabel = picked?.code ?? (chosen === config?.promotionId ? config?.promotionCode : undefined) ?? "";
  const placeholder = (key: OfferPopupText) => (key === "title" && picked && picked.tiers.length > 0 ? offerDefaultTitle(picked.kind, picked.tiers) : OFFER_POPUP_DEFAULTS[key]);
  const shown = (key: OfferPopupText) => texts[key].trim() || placeholder(key);
  const preview: PublicOffer | null = picked && picked.tiers.length > 0
    ? { id: picked.id, code: picked.code, auto: picked.applyAutomatically, kind: picked.kind, tiers: picked.tiers, eyebrow: shown("eyebrow"), title: shown("title"), lead: shown("lead"), cta: shown("cta"), ...(href.trim() ? { ctaHref: href.trim() } : {}) }
    : null;

  return (
    <div className="space-y-8">
      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_25rem] xl:items-start">
        <form action={action} className="space-y-5" aria-label={`Popup da oferta de ${REGIONS[region].name}`}>
          <input type="hidden" name="scope" value={region} />
          <input type="hidden" name="rev" value={rev} />
          <input type="hidden" name="promotionId" value={chosen ?? ""} />
          <input type="hidden" name="promotionCode" value={codeLabel} />

          <fieldset className="a-card space-y-3 p-5">
            <legend className="a-label">No ar</legend>
            <label className="flex min-h-10 items-start gap-2 text-[0.9375rem]">
              <input type="checkbox" name="enabled" className="mt-1" checked={enabled} disabled={readOnly} onChange={(e) => setEnabled(e.target.checked)} data-testid="offer-enabled" />
              <span>
                <strong>Abrir o popup da oferta na loja</strong>
                <span className="a-muted block text-[0.8125rem]">
                  Depois de 8 segundos ou de rolar metade da página, uma vez a cada 7 dias em cada navegador. No celular abre como uma folha embaixo; no
                  computador, no meio da tela. Desligado: nenhum popup abre.
                </span>
              </span>
            </label>
          </fieldset>

          <fieldset className="a-card space-y-3 p-5" data-testid="offer-promotions">
            <legend className="a-label">Promoção progressiva da INK</legend>
            <p className="a-muted text-[0.8125rem]">
              A lista vem da INK agora. As faixas, o código e as datas são os da INK: mudou lá, muda no popup em poucos minutos, sem salvar nada aqui. Para criar
              ou mudar uma promoção, use o painel da INK. Cabem {MAX_OFFER_CARDS} faixas lado a lado; com mais, o popup mostra as primeiras e a maior.
            </p>
            {inkError && <p className="a-badge warn" data-testid="offer-ink-error">{inkError}</p>}
            {savedMissing && <p className="a-badge bad" data-testid="offer-missing">A promoção escolhida antes ({config?.promotionCode ?? `#${config?.promotionId}`}) não aparece mais na INK. Escolha outra.</p>}
            {promotions !== null && list.length === 0 && <p className="text-[0.9375rem]" data-testid="offer-none">A loja não tem nenhuma promoção progressiva na INK.</p>}
            {list.map((p) => {
              const reason = offerUnsupportedReason(p, now);
              const scheduled = !reason && p.startsAt !== null && Date.parse(p.startsAt) > now;
              return (
                <label key={p.id} className={`flex items-start gap-3 border p-3 ${chosen === p.id ? "border-black" : "border-black/15"} ${reason ? "opacity-70" : "cursor-pointer"}`} data-testid={`offer-promotion-${p.code}`}>
                  <input type="radio" name="promotion_choice" className="mt-1" checked={chosen === p.id} disabled={readOnly || (reason !== null && chosen !== p.id)} onChange={() => setChosen(p.id)} />
                  <span className="min-w-0 space-y-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <strong className="text-[1rem]">{p.code}</strong>
                      {reason ? <span className="a-badge bad">Não dá para usar</span> : scheduled ? <span className="a-badge warn">Começa {formatBrasilia(p.startsAt as string)}</span> : <span className="a-badge ok">Pode ir no popup</span>}
                      <span className="a-badge">{p.applyAutomatically ? "Aplicada sozinha" : "Cliente digita o cupom"}</span>
                    </span>
                    <span className="block text-[0.875rem]">{p.tiers.length > 0 ? kitTiersSummary(p) : "Sem faixas por quantidade"}</span>
                    {p.expiresAt && <span className="a-muted block text-[0.8125rem]">Termina {formatBrasilia(p.expiresAt)}</span>}
                    {p.usageLimit !== null && <span className="a-muted block text-[0.8125rem]">Limite de {p.usageLimit} usos na INK.</span>}
                    {reason && <span className="block text-[0.8125rem] text-[#6f1712]">{reason}</span>}
                  </span>
                </label>
              );
            })}
            {enabled && chosen === null && <p className="text-[0.8125rem] text-[#6b4a0c]">Escolha uma promoção para ligar o popup.</p>}
            {enabled && pickedReason && <p className="text-[0.8125rem] text-[#6f1712]">Essa promoção não pode ser mostrada no popup: {pickedReason}</p>}
          </fieldset>

          <fieldset className="a-card space-y-4 p-5">
            <legend className="a-label">Textos (opcionais)</legend>
            {OFFER_POPUP_TEXTS.map((key) => (
              <div key={key}>
                <label className="a-label" htmlFor={`offer_${key}`}>{OFFER_TEXT_LABEL[key]}</label>
                <input id={`offer_${key}`} name={key} className="a-input" value={texts[key]} maxLength={OFFER_POPUP_LIMITS[key]} placeholder={placeholder(key)} disabled={readOnly} onChange={(e) => setTexts((t) => ({ ...t, [key]: e.target.value }))} data-testid={`offer-${key}`} />
                <p className="a-muted mt-1 text-[0.8125rem]">
                  {texts[key].length}/{OFFER_POPUP_LIMITS[key]}. Vazio: usa o texto padrão (em cinza){key === "title" ? ", que acompanha a maior faixa da promoção" : ""}.
                </p>
              </div>
            ))}
            <div>
              <label className="a-label" htmlFor="offer_ctaHref">Link do botão (opcional)</label>
              <input id="offer_ctaHref" name="ctaHref" className="a-input" value={href} maxLength={OFFER_HREF_MAX + 40} placeholder={`/${region}/colecoes/…`} disabled={readOnly} onChange={(e) => setHref(e.target.value)} data-testid="offer-ctaHref" />
              <p className="a-muted mt-1 text-[0.8125rem]">Um endereço deste site, como /{region}/colecoes/mais-vendidas. Vazio: o botão só fecha o popup e a pessoa continua na página.</p>
            </div>
            <p className="a-muted text-[0.8125rem]">Embaixo dos botões vem sempre uma linha pequena com como o desconto entra (“Cole o cupom no carrinho: vale a partir de 3 peças.”).</p>
          </fieldset>

          {!readOnly && <button type="submit" className="a-btn" data-testid="offer-save">Salvar rascunho</button>}
        </form>

        <aside className="space-y-3 xl:sticky xl:top-4" aria-label="Prévia do popup no celular">
          <p className="a-label">Prévia no celular</p>
          {preview ? (
            <div className="relative mx-auto h-[720px] w-full max-w-[390px] overflow-hidden border border-black/20 bg-[#e9e6df]" data-testid="offer-preview-phone">
              <OfferPopup region={region} offer={preview} theme={theme} mode="preview" />
            </div>
          ) : (
            <p className="a-card a-muted p-4 text-[0.875rem]">Escolha uma promoção para ver a prévia.</p>
          )}
        </aside>
      </div>

      {preview && (
        <section className="space-y-3" aria-label="Prévia do popup no computador">
          <p className="a-label">Prévia no computador</p>
          <div className="overflow-x-auto">
            <div className="relative h-[600px] w-[1040px] overflow-hidden border border-black/20 bg-[#e9e6df]" data-testid="offer-preview-desktop">
              <OfferPopup region={region} offer={preview} theme={theme} mode="preview" />
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
