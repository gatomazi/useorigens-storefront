import { saveInkThemeAction } from "@/app/admin/actions";
import { Flash } from "@/components/admin/Flash";
import { requireAdmin } from "@/lib/admin/auth/guard";
import { currentScope, scopeName } from "@/lib/admin/scope";
import { canEdit } from "@/lib/admin/store/ports";
import { loadWorkspace } from "@/lib/admin/workspace";
import { REGIONS } from "@/lib/geo/regions";
import { INK_INCENTIVE_CHECKLIST, INK_INCENTIVE_LIMITS, INK_PRESET_LABEL, INK_SURFACE_LABEL, INK_THEME_SURFACES, inkIncentiveText, inkThemeOf, inkThemeTokens, type InkThemeConfig, type InkThemeTokens } from "@/lib/site-config/ink-theme";
import { readPublished } from "@/lib/site-config/published";

const SURFACE_HELP: Record<(typeof INK_THEME_SURFACES)[number], string> = {
  pdp: "Título, preço, seletores de modelo/cor/tamanho, botão de compra e a barra fixa do celular, com a fonte, as cores e os botões do site.",
  cart: "O carrinho lateral (itens, cupom, CEP, totais, “Finalizar compra”) e a confirmação depois de adicionar.",
  checkout: "As telas de contato/entrega e de pagamento: campos, opções de frete e pagamento, resumo e botões. Só aparência; nada da INK é mudado.",
};

/** A small, static sample of the purchase area in the draft's tokens (the real check is the preview on the INK pages: see the note below). */
function Sample({ t }: { t: InkThemeTokens }) {
  const font = t.font === "origens" ? "var(--font-body-stack)" : "Poppins, system-ui, sans-serif";
  const r = `${t.radius}px`;
  const chip = (label: string, state: "on" | "off" | "out") => (
    <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minHeight: 44, minWidth: 48, padding: "0 12px", border: `2px solid ${state === "on" ? t.selected : state === "out" ? t.line : t.ink}`, borderRadius: r, background: state === "on" ? t.selected : "transparent", color: state === "on" ? t.onSelected : state === "out" ? t.inkMute : t.ink, fontWeight: 600, textDecoration: state === "out" ? "line-through" : "none" }}>{label}</span>
  );
  return (
    <div aria-hidden="true" style={{ background: t.ground, color: t.ink, fontFamily: font, padding: 20, border: "1px solid rgb(0 0 0 / 0.12)" }} data-testid="ink-theme-sample">
      <p style={{ fontWeight: 800, fontSize: 28, lineHeight: 1.05, letterSpacing: "-0.02em" }}>Florianópolis | Legado SC</p>
      <p style={{ fontWeight: 800, fontSize: 34, marginTop: 10, letterSpacing: "-0.028em" }}>R$ 109,90</p>
      <p style={{ color: t.inkSoft, marginTop: 2 }}>ou <strong style={{ color: t.ink }}>5x de R$ 21,98 sem juros</strong> <span style={{ color: t.inkMute }}>(texto da INK)</span></p>
      <p style={{ fontWeight: 700, marginTop: 14 }}>Tamanho</p>
      <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>{chip("PP", "out")}{chip("P", "off")}{chip("M", "on")}{chip("G", "off")}</div>
      <span style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 52, marginTop: 16, maxWidth: 420, background: t.action, color: t.onAction, borderRadius: r, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", fontSize: 15 }}>Adicionar ao carrinho</span>
      <div style={{ marginTop: 16, background: t.surface, border: `1px solid ${t.line}`, borderRadius: r, padding: "10px 12px", maxWidth: 420, color: t.inkMute }}>CEP</div>
    </div>
  );
}

export default async function InkThemePage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const actor = await requireAdmin();
  const scope = await currentScope(actor);
  const sp = await searchParams;
  const ws = await loadWorkspace(scope);
  const draft = inkThemeOf(ws.doc);
  const state = readPublished();
  const live = inkThemeOf(state.source === "published" ? state.bundle.docs[scope] : undefined);
  const { tokens, warnings } = inkThemeTokens(scope, draft);
  const readOnly = !canEdit(actor, scope);
  const radios = <K extends "action" | "ground" | "corners" | "font">(key: K, title: string) => (
    <fieldset className="mt-4">
      <legend className="a-label">{title}</legend>
      <div className="mt-1 flex flex-wrap gap-x-6 gap-y-2">
        {(Object.entries(INK_PRESET_LABEL[key]) as [InkThemeConfig[K], string][]).map(([value, label]) => (
          <label key={value} className="flex items-center gap-2 text-[0.9375rem]">
            <input type="radio" name={key} value={value} defaultChecked={draft[key] === value} disabled={readOnly} data-testid={`ink-${key}-${value}`} /> {label}
          </label>
        ))}
      </div>
    </fieldset>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="a-h1">Tema da INK <span className="a-muted">· {scopeName(scope)}</span></h1>
        <p className="a-muted mt-2 max-w-3xl">
          Leva a cara da página de produto do site para as páginas da INK que fecham a compra, para o cliente reconhecer a mesma loja do começo ao fim.
          É só aparência: preço, descontos, frete, estoque, variantes, carrinho, pagamento e pedido continuam sendo da INK, com os mesmos botões e as mesmas
          validações. Cada parte liga e desliga sozinha; desligada, a INK volta ao visual dela. Salvar guarda um <strong>rascunho</strong>: a INK só muda
          depois de publicar em <em>Publicar</em> (e leva até um minuto).
        </p>
      </div>
      <Flash ok={sp.ok} err={sp.err} />
      <form action={saveInkThemeAction} className="a-card p-5">
        <input type="hidden" name="scope" value={scope} />
        <input type="hidden" name="rev" value={String(ws.record?.rev ?? "null")} />
        <div id="ink-onde-aplicar" className="scroll-mt-4">
          <h2 className="a-h2">Onde aplicar</h2>
          <ul className="mt-3 space-y-3">
            {INK_THEME_SURFACES.map((s) => (
              <li key={s}>
                <label className="flex items-start gap-3">
                  <input type="checkbox" name={s} defaultChecked={draft.surfaces[s]} disabled={readOnly} className="mt-1" data-testid={`ink-surface-${s}`} />
                  <span>
                    <strong>{INK_SURFACE_LABEL[s]}</strong>{" "}
                    {live.surfaces[s] ? <span className="a-badge ok">No ar</span> : <span className="a-badge">Desligado na INK</span>}
                    {live.surfaces[s] !== draft.surfaces[s] && <span className="a-badge warn ml-1">No rascunho: {draft.surfaces[s] ? "ligado" : "desligado"}</span>}
                    <span className="a-muted block text-[0.875rem]">{SURFACE_HELP[s]}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </div>
        <div id="ink-aparencia" className="scroll-mt-4">
          <h2 className="a-h2 mt-6">Aparência</h2>
          <p className="a-muted mt-1 text-[0.875rem]">O padrão reproduz a página de produto do site. As cores vêm da paleta do site e da região; nenhuma cor ou texto é digitado aqui.</p>
          {radios("action", "Botão principal (Adicionar ao carrinho, Finalizar compra)")}
          {radios("ground", "Fundo da página de produto")}
          {radios("corners", "Cantos de botões, seletores e campos")}
          {radios("font", "Fonte")}
          {warnings.map((w) => <p key={w} className="a-flash err mt-3">{w}</p>)}
        </div>
        <div id="ink-incentivo" className="scroll-mt-4">
          <h2 className="a-h2 mt-6">Incentivo de frete no carrinho</h2>
          <p className="a-muted mt-1 max-w-3xl text-[0.875rem]">
            Mostra no carrinho quantas peças faltam para o frete grátis (“Falta 1 peça para o frete grátis”) e, ao chegar lá, pede o CEP para conferir. Isto só
            <strong> representa</strong> uma regra que a INK já aplica: não cria promoção nem muda frete ou total, que continuam sendo calculados pela INK. Só por
            quantidade de peças (uma regra por valor a INK mostra sozinha, com a régua dela).
          </p>
          <p className="mt-3 text-[0.875rem]"><strong>Antes de ligar, confira na INK:</strong></p>
          <ul className="a-muted mt-1 list-disc pl-5 text-[0.875rem]">{INK_INCENTIVE_CHECKLIST.map((item) => <li key={item}>{item};</li>)}</ul>
          <div className="mt-4 flex flex-wrap items-end gap-x-8 gap-y-4">
            <label className="block">
              <span className="a-label">Mínimo de peças</span>
              <input type="number" name="incentiveThreshold" min={INK_INCENTIVE_LIMITS.min} max={INK_INCENTIVE_LIMITS.max} step={1} defaultValue={draft.incentive?.threshold ?? ""} disabled={readOnly} className="a-input mt-1 w-28" data-testid="ink-incentive-threshold" />
            </label>
            <fieldset>
              <legend className="a-label">Estados em que vale</legend>
              <div className="mt-1 flex flex-wrap gap-x-5 gap-y-2">
                {REGIONS[scope].ufs.map((uf) => (
                  <label key={uf} className="flex items-center gap-2 text-[0.9375rem]">
                    <input type="checkbox" name="incentiveUfs" value={uf} defaultChecked={draft.incentive?.ufs.includes(uf) ?? false} disabled={readOnly} data-testid={`ink-incentive-uf-${uf}`} /> {uf}
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
          <label className="mt-4 flex items-start gap-3">
            <input type="checkbox" name="incentiveConfirmed" defaultChecked={draft.incentive?.confirmed ?? false} disabled={readOnly} className="mt-1" data-testid="ink-incentive-confirmed" />
            <span>Confirmo que essa regra está cadastrada e ativa na INK, para todos os produtos da loja.</span>
          </label>
          <label className="mt-3 flex items-start gap-3">
            <input type="checkbox" name="incentiveEnabled" defaultChecked={draft.incentive?.enabled ?? false} disabled={readOnly} className="mt-1" data-testid="ink-incentive-enabled" />
            <span>
              <strong>Mostrar o incentivo no carrinho</strong>{" "}
              {live.incentive?.enabled && live.incentive.confirmed ? <span className="a-badge ok">No ar</span> : <span className="a-badge">Desligado na INK</span>}
              {inkIncentiveText(live.incentive) !== inkIncentiveText(draft.incentive) && <span className="a-badge warn ml-1">No rascunho: {inkIncentiveText(draft.incentive)}</span>}
              <span className="a-muted block text-[0.875rem]">Também depende do carrinho ligado acima e da opção <code>cart-incentive</code> no Worker da loja.</span>
            </span>
          </label>
        </div>
        {!readOnly && <button type="submit" className="a-btn mt-6" data-testid="ink-theme-save">Salvar rascunho</button>}
      </form>
      <section className="a-card p-5" aria-labelledby="ink-amostra">
        <h2 id="ink-amostra" className="a-h2">Amostra do rascunho</h2>
        <p className="a-muted mt-1 text-[0.875rem]">Uma amostra estática das cores e formas. A conferência de verdade é a prévia nas páginas reais da INK (computador e celular), feita antes de publicar.</p>
        <div className="mt-4 max-w-xl"><Sample t={tokens} /></div>
      </section>
      <section className="a-card p-5">
        <h2 className="a-h2">O que este painel não muda</h2>
        <p className="a-muted mt-1 text-[0.875rem]">
          Regras de preço, desconto, frete, parcelas, pagamento e validação dos campos (são da INK). O Worker da loja também tem um interruptor por parte
          (<code>theme-pdp</code>, <code>theme-cart</code>, <code>theme-checkout</code>): o que estiver desligado lá não aparece, mesmo ligado aqui. O checkout ainda
          depende de uma rota do Worker nas duas telas do checkout (ver <code>docs/tema-fluxo-ink.md</code> no repositório do Worker).
        </p>
      </section>
    </div>
  );
}
