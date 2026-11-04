import { saveOfferPopupAction } from "@/app/admin/actions";
import { Flash } from "@/components/admin/Flash";
import { OfferPopupEditor } from "@/components/admin/OfferPopupEditor";
import { requireAdmin } from "@/lib/admin/auth/guard";
import { currentScope, scopeName, storeOf } from "@/lib/admin/scope";
import { canEdit } from "@/lib/admin/store/ports";
import { loadWorkspace } from "@/lib/admin/workspace";
import { kitPromotionLive, type InkProgressivePromotion } from "@/lib/ink/progressive-promotions";
import { listProgressivePromotions } from "@/lib/ink/promotions-client";
import { offerUnsupportedReason } from "@/lib/site-config/offer-popup";
import { resolveTheme } from "@/lib/site-config/navigation";
import { readPublished } from "@/lib/site-config/published";

/** The instant of this request (statuses and "no ar agora" are computed against it). */
const requestTime = (): number => Date.now();

export default async function OfferPopupPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const actor = await requireAdmin();
  const scope = await currentScope(actor);
  const sp = await searchParams;
  const [ws, global] = await Promise.all([loadWorkspace(scope), loadWorkspace("global")]);
  const colors = resolveTheme(scope, ws.doc, global.doc).effective;
  const now = requestTime();
  let promotions: InkProgressivePromotion[] | null = null;
  let inkError: string | null = null;
  try {
    const read = await listProgressivePromotions(storeOf(scope));
    promotions = read.promotions;
    if (read.ignored > 0) inkError = `${read.ignored} ${read.ignored === 1 ? "promoção veio" : "promoções vieram"} da INK num formato que não conhecemos e ${read.ignored === 1 ? "ficou" : "ficaram"} de fora.`;
  } catch {
    inkError = "Não foi possível ler as promoções da INK agora. Recarregue em instantes; dá para desligar o popup mesmo assim.";
  }
  const state = readPublished();
  const published = state.source === "published" ? state.bundle.docs[scope]?.offerPopup : undefined;
  const live = published?.enabled ? promotions?.find((p) => p.id === published.promotionId) : undefined;
  const liveText = !published?.enabled ? "desligado (nenhum popup abre na loja)"
    : promotions === null ? `ligado com a promoção ${published.promotionCode ?? `#${published.promotionId}`} (a INK não respondeu para conferir se está valendo)`
    : live && kitPromotionLive(live, now) && !offerUnsupportedReason(live, now) ? `ligado com a promoção ${live.code}`
    : `ligado, mas a promoção ${published.promotionCode ?? `#${published.promotionId}`} não está valendo na INK: nenhum popup abre`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="a-h1">Popup da oferta <span className="a-muted">· {scopeName(scope)}</span></h1>
        <p className="a-muted mt-2 max-w-3xl">
          Um popup na loja (site) com uma promoção progressiva da INK: as faixas (3 peças, 4 peças…), o cupom para copiar e um botão. Abre depois de
          8 segundos ou quando a pessoa rola metade da página, <strong>uma vez a cada 7 dias</strong> em cada navegador (uma promoção nova conta como nova),
          nunca por cima do menu, da busca ou de outra janela, e não abre no Estúdio, em Minhas Estampas, em Seja parceiro nem em Privacidade. Quem aplica o
          desconto continua sendo a INK, no carrinho. O botão de cupons continua onde está. Salvar guarda um <strong>rascunho</strong>: a loja só muda depois de
          publicar em <em>Publicar</em>.
        </p>
        <p className="mt-2 text-[0.9375rem]" data-testid="offer-published-now"><strong>Publicado agora:</strong> {liveText}.</p>
      </div>
      <Flash ok={sp.ok} err={sp.err} />
      <OfferPopupEditor key={`${scope}-${ws.record?.rev ?? "null"}`} region={scope} config={ws.doc.offerPopup} promotions={promotions} inkError={inkError} now={now} readOnly={!canEdit(actor, scope)} action={saveOfferPopupAction} rev={String(ws.record?.rev ?? "null")} theme={{ primary: colors.headerBackground, onPrimary: colors.headerText }} />
    </div>
  );
}
