import { formatKitMoney, kitDiscountLabel, kitTierPrices, shownKitTiers, type KitDiscountKind, type KitTier } from "@/lib/ink/progressive-promotions";

/**
 * Preview of the "Monte seu kit" block inside INK's "Produto adicionado ao carrinho" modal: the same parts, order and arithmetic as the Worker's block
 * (`use-origens-workers/src/loader/post-add-kit.js`), in the region's colour. Only the panel shows it; on INK the Worker draws its own.
 */
export function PostAddKitPreview({ eyebrow, title, lead, code, auto, kind, tiers, unitCents, accent }: { eyebrow: string; title: string; lead: string; code: string; auto: boolean; kind: KitDiscountKind; tiers: readonly KitTier[]; unitCents: number | null; accent: string }) {
  const shown = shownKitTiers(tiers);
  const prices = unitCents === null ? null : kitTierPrices(unitCents, kind, shown);
  return (
    <div className="mx-auto w-full max-w-[390px] border border-black/20 bg-white p-4 text-[#111827] shadow-sm" data-testid="kit-preview" style={{ fontFamily: "inherit" }}>
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-[1rem] font-semibold">
          <span aria-hidden="true" className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[0.75rem] text-white" style={{ background: accent }}>✓</span>
          Produto adicionado ao carrinho
        </p>
        <span aria-hidden="true" className="text-[1.25rem] leading-none">×</span>
      </div>

      <div className="mt-4">
        <p className="text-[0.6875rem] font-bold uppercase tracking-[0.08em]" style={{ color: accent }}>{eyebrow}</p>
        <p className="mt-1 text-[1.25rem] font-bold leading-tight">{title}</p>
        <p className="mt-1 text-[0.8125rem] leading-snug text-[#4b5563]">{lead}</p>
        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="inline-flex min-h-9 items-center rounded-[4px] px-3 text-[0.875rem] font-bold" style={{ background: `color-mix(in srgb, ${accent} 12%, #fff)`, color: accent }}>
            {auto ? "Desconto aplicado no carrinho" : <>Cupom {code}</>}
          </span>
          {!auto && <span className="text-[0.875rem] font-bold underline" style={{ color: accent }}>Copiar cupom</span>}
        </div>
        <ol className="mt-3 space-y-2" data-testid="kit-preview-tiers">
          {shown.map((t, i) => {
            const p = prices?.[i];
            const best = i === shown.length - 1;
            return (
              <li key={t.items} className="flex min-h-14 items-center gap-3 rounded-[6px] border px-3 py-2" style={best ? { borderColor: accent, background: `color-mix(in srgb, ${accent} 7%, #fff)` } : { borderColor: "rgb(0 0 0 / 0.14)" }}>
                <span className="w-[4.25rem] shrink-0 text-[0.9375rem] font-bold">{t.items} peças</span>
                {p ? (
                  <>
                    <span className="min-w-0 flex-1 leading-tight">
                      <s className="block text-[0.75rem] text-[#6b7280]">de {formatKitMoney(p.fullCents)}</s>
                      <span className="block text-[0.9375rem] font-bold">por {formatKitMoney(p.totalCents)}</span>
                    </span>
                    <span className="shrink-0 text-right leading-tight">
                      <span className="block text-[0.875rem] font-bold" style={{ color: accent }}>{formatKitMoney(p.eachCents)} cada</span>
                      <span className="block text-[0.6875rem] text-[#4b5563]">economize {formatKitMoney(p.savedCents)}</span>
                    </span>
                  </>
                ) : (
                  <span className="min-w-0 flex-1 text-right text-[0.9375rem] font-bold" style={{ color: accent }}>{kitDiscountLabel(kind, t.discount)} no total</span>
                )}
              </li>
            );
          })}
        </ol>
        <p className="mt-2 text-[0.6875rem] leading-snug text-[#6b7280]">Em peças com preços diferentes, o total do kit pode variar.</p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <span className="flex min-h-12 items-center justify-center border border-[#111827] px-2 text-center text-[0.875rem] font-semibold">Escolher mais produtos</span>
        <span className="flex min-h-12 items-center justify-center bg-[#111827] px-2 text-center text-[0.875rem] font-bold uppercase tracking-[0.04em] text-white">Finalizar compra</span>
      </div>
      <p className="a-muted mt-3 text-center text-[0.75rem]">Abaixo continuam a busca de estampas e “As mais vendidas”.</p>
    </div>
  );
}
