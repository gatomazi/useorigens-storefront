import { saveTopBarAction } from "@/app/admin/actions";
import { Flash } from "@/components/admin/Flash";
import { TopBarEditor } from "@/components/admin/TopBarEditor";
import { requireAdmin } from "@/lib/admin/auth/guard";
import { currentScope, scopeName } from "@/lib/admin/scope";
import { canEdit } from "@/lib/admin/store/ports";
import { loadWorkspace } from "@/lib/admin/workspace";
import { readPublished } from "@/lib/site-config/published";
import { liveTopBarMessages } from "@/lib/site-config/top-bar";

/** The instant of this request (statuses and "no ar agora" are computed against it). */
const requestTime = (): number => Date.now();

export default async function TopBarPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const actor = await requireAdmin();
  const scope = await currentScope(actor);
  const sp = await searchParams;
  const ws = await loadWorkspace(scope);
  const now = requestTime();
  const state = readPublished();
  const published = state.source === "published" ? state.bundle.docs[scope]?.topBar : undefined;
  const liveNow = liveTopBarMessages(published, now).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="a-h1">Faixa do topo <span className="a-muted">· {scopeName(scope)}</span></h1>
        <p className="a-muted mt-2 max-w-3xl">
          A faixa preta acima do cabeçalho, na loja e nas páginas da INK desta região. Cada mensagem pode ter início e fim (Black Friday, prazo de Natal) e,
          com mais de uma no ar, elas se revezam. Sem mensagem no ar, a loja mostra a faixa padrão e a INK, a dela. Salvar guarda um <strong>rascunho</strong>:
          a loja e a INK só mudam depois de publicar em <em>Publicar</em>.
        </p>
        <p className="mt-2 text-[0.9375rem]" data-testid="top-bar-published-now"><strong>Publicado e no ar agora:</strong> {liveNow === 0 ? "nenhuma mensagem (faixa padrão)" : `${liveNow} ${liveNow === 1 ? "mensagem" : "mensagens"}`}.</p>
      </div>
      <Flash ok={sp.ok} err={sp.err} />
      <TopBarEditor region={scope} productionDays={ws.doc.topBar?.productionDays} messages={ws.doc.topBar?.messages ?? []} now={now} readOnly={!canEdit(actor, scope)} action={saveTopBarAction} rev={String(ws.record?.rev ?? "null")} />
    </div>
  );
}
