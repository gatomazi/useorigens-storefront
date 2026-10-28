import { savePostAddKitAction } from "@/app/admin/actions";
import { Flash } from "@/components/admin/Flash";
import { PostAddKitEditor } from "@/components/admin/PostAddKitEditor";
import { requireAdmin } from "@/lib/admin/auth/guard";
import { currentScope, scopeName, storeOf } from "@/lib/admin/scope";
import { canEdit } from "@/lib/admin/store/ports";
import { loadWorkspace } from "@/lib/admin/workspace";
import { kitPromotionLive, type InkProgressivePromotion } from "@/lib/ink/progressive-promotions";
import { listProgressivePromotions } from "@/lib/ink/promotions-client";
import { resolveTheme } from "@/lib/site-config/navigation";
import { readPublished } from "@/lib/site-config/published";

/** The instant of this request (statuses and "no ar agora" are computed against it). */
const requestTime = (): number => Date.now();

export default async function PostAddKitPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const actor = await requireAdmin();
  const scope = await currentScope(actor);
  const sp = await searchParams;
  const [ws, global] = await Promise.all([loadWorkspace(scope), loadWorkspace("global")]);
  const accent = resolveTheme(scope, ws.doc, global.doc).effective.headerBackground;
  const now = requestTime();
  let promotions: InkProgressivePromotion[] | null = null;
  let inkError: string | null = null;
  try {
    const read = await listProgressivePromotions(storeOf(scope));
    promotions = read.promotions;
    if (read.ignored > 0) inkError = `${read.ignored} ${read.ignored === 1 ? "promoção veio" : "promoções vieram"} da INK num formato que não conhecemos e ${read.ignored === 1 ? "ficou" : "ficaram"} de fora.`;
  } catch {
    inkError = "Não foi possível ler as promoções da INK agora. Recarregue em instantes; dá para desligar o kit mesmo assim.";
  }
  const state = readPublished();
  const published = state.source === "published" ? state.bundle.docs[scope]?.postAddKit : undefined;
  const live = published?.enabled ? promotions?.find((p) => p.id === published.promotionId) : undefined;
  const liveText = !published?.enabled ? "desligado (o modal da INK está como ela desenha)"
    : promotions === null ? `ligado com a promoção ${published.promotionCode ?? `#${published.promotionId}`} (a INK não respondeu para conferir se está valendo)`
    : live && kitPromotionLive(live, now) ? `ligado com a promoção ${live.code}`
    : `ligado, mas a promoção ${published.promotionCode ?? `#${published.promotionId}`} não está valendo na INK: o modal fica como a INK desenha`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="a-h1">Monte seu kit <span className="a-muted">· {scopeName(scope)}</span></h1>
        <p className="a-muted mt-2 max-w-3xl">
          Depois que a pessoa adiciona uma peça ao carrinho na INK, o modal “Produto adicionado ao carrinho” mostra as faixas de uma promoção progressiva da
          loja (3 peças, 4 peças…), já com o preço da peça adicionada: de quanto sai por quanto, quanto fica cada uma e quanto economiza. Quem aplica o desconto
          continua sendo a INK, no carrinho. Salvar guarda um <strong>rascunho</strong>: a INK só muda depois de publicar em <em>Publicar</em>.
        </p>
        <p className="mt-2 text-[0.9375rem]" data-testid="kit-published-now"><strong>Publicado agora:</strong> {liveText}.</p>
      </div>
      <Flash ok={sp.ok} err={sp.err} />
      <PostAddKitEditor key={`${scope}-${ws.record?.rev ?? "null"}`} region={scope} config={ws.doc.postAddKit} promotions={promotions} inkError={inkError} now={now} readOnly={!canEdit(actor, scope)} action={savePostAddKitAction} rev={String(ws.record?.rev ?? "null")} accent={accent} />
    </div>
  );
}
