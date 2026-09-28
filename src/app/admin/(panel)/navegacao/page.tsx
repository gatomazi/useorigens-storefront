import { resetNavigationAction, saveNavigationAction } from "@/app/admin/actions";
import { Flash } from "@/components/admin/Flash";
import { NavigationEditor } from "@/components/admin/NavigationEditor";
import { requireAdmin } from "@/lib/admin/auth/guard";
import { currentScope, scopeName } from "@/lib/admin/scope";
import { canEdit } from "@/lib/admin/store/ports";
import { loadWorkspace } from "@/lib/admin/workspace";
import { launchedRegions } from "@/lib/regions/launched";
import { coveredUfs } from "@/lib/site-config/chrome";
import { navData, resolveTheme } from "@/lib/site-config/navigation";

export default async function NavigationPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const actor = await requireAdmin();
  const scope = await currentScope(actor);
  const sp = await searchParams;
  const [ws, global] = await Promise.all([loadWorkspace(scope), loadWorkspace("global")]);
  // The real data the menu is made of, today: the home's own sections (the draft), the launched regions, the states that have products.
  const data = navData({ region: scope, doc: ws.doc, launched: launchedRegions(), coveredUfs: coveredUfs(scope) });
  const colors = resolveTheme(scope, ws.doc, global.doc).effective;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="a-h1">Navegação <span className="a-muted">· {scopeName(scope)}</span></h1>
        <p className="a-muted mt-2 max-w-3xl">O menu do celular tem três blocos: <strong>Comprar</strong>, <strong>Estados da região</strong> e <strong>Outras regiões</strong>. Você controla rótulos, posição e visibilidade; os estados e as regiões vêm automaticamente do que já foi lançado. Salvar guarda só um <strong>rascunho</strong>: a loja só muda depois de publicar em <em>Publicar</em>.</p>
      </div>
      <Flash ok={sp.ok} err={sp.err} />
      <NavigationEditor region={scope} config={ws.doc.navigation} data={data} colors={colors} readOnly={!canEdit(actor, scope)} action={saveNavigationAction} resetAction={resetNavigationAction} rev={String(ws.record?.rev ?? "null")} />
    </div>
  );
}
