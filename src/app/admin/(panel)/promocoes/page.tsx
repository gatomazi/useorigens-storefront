import { savePromotionsAction } from "@/app/admin/actions";
import { Flash } from "@/components/admin/Flash";
import { PromotionsEditor } from "@/components/admin/PromotionsEditor";
import { requireAdmin } from "@/lib/admin/auth/guard";
import { currentScope, scopeName } from "@/lib/admin/scope";
import { canEdit } from "@/lib/admin/store/ports";
import { loadWorkspace } from "@/lib/admin/workspace";
import { resolveTheme } from "@/lib/site-config/navigation";
import { activePromotions } from "@/lib/site-config/promotions";
import { readPublished } from "@/lib/site-config/published";

/** The instant of this request (statuses and "no ar agora" are computed against it). */
const requestTime = (): number => Date.now();

export default async function PromotionsPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const actor = await requireAdmin();
  const scope = await currentScope(actor);
  const sp = await searchParams;
  const [ws, global] = await Promise.all([loadWorkspace(scope), loadWorkspace("global")]);
  // The button wears the header pair of the region's palette (the draft's, so a palette change shows here too).
  const palette = resolveTheme(scope, ws.doc, global.doc).effective;
  const now = requestTime();
  const state = readPublished();
  const published = state.source === "published" ? state.bundle.docs[scope]?.promotions : undefined;
  const liveNow = activePromotions(published, now).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="a-h1">Cupons e promoções <span className="a-muted">· {scopeName(scope)}</span></h1>
        <p className="a-muted mt-2 max-w-3xl">
          O botão de cupons aparece no canto inferior esquerdo da loja e das páginas da INK desta região. Cada item tem os próprios textos: nada é escrito
          pelo código. <strong>Cupom</strong> tem um código que o cliente copia e aplica no carrinho da INK (a INK valida e calcula o desconto);
          <strong> promoção sem código</strong> é só um aviso. Salvar guarda um <strong>rascunho</strong>: a loja e a INK só mudam depois de publicar em <em>Publicar</em>.
        </p>
        <p className="mt-2 text-[0.9375rem]" data-testid="promo-published-now"><strong>Publicado e no ar agora:</strong> {liveNow === 0 ? "nenhum item (o botão não aparece)" : `${liveNow} ${liveNow === 1 ? "item" : "itens"}`}.</p>
      </div>
      <Flash ok={sp.ok} err={sp.err} />
      <PromotionsEditor region={scope} items={ws.doc.promotions?.items ?? []} theme={{ primary: palette.headerBackground, onPrimary: palette.headerText }} now={now} readOnly={!canEdit(actor, scope)} action={savePromotionsAction} rev={String(ws.record?.rev ?? "null")} />
    </div>
  );
}
