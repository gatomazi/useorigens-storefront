import { discardGlobalThemeAction, publishGlobalThemeAction, saveThemeAction } from "@/app/admin/actions";
import { Flash } from "@/components/admin/Flash";
import { ThemeEditor } from "@/components/admin/ThemeEditor";
import { requireAdmin } from "@/lib/admin/auth/guard";
import { currentScope, REGION_SCOPES, scopeName } from "@/lib/admin/scope";
import { canEdit } from "@/lib/admin/store/ports";
import { loadWorkspace } from "@/lib/admin/workspace";
import type { RegionSlug } from "@/lib/geo/regions";
import { launchedRegions } from "@/lib/regions/launched";
import { coveredUfs } from "@/lib/site-config/chrome";
import { navData, type NavData } from "@/lib/site-config/navigation";

export default async function AppearancePage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const actor = await requireAdmin();
  const scope = await currentScope(actor);
  const sp = await searchParams;
  const owner = actor.role === "owner";
  const [ws, global] = await Promise.all([loadWorkspace(scope), loadWorkspace("global")]);
  const launched = launchedRegions();
  // Real menu data per region for the previews (the home's own sections, launched regions, states that have products).
  const navByRegion = Object.fromEntries(
    await Promise.all(REGION_SCOPES.map(async (r) => [r, navData({ region: r, doc: (r === scope ? ws : await loadWorkspace(r)).doc, launched, coveredUfs: coveredUfs(r) })] as const)),
  ) as Record<RegionSlug, NavData>;
  const inherits = ws.doc.theme?.mode === "inherit";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="a-h1">Aparência <span className="a-muted">· {scopeName(scope)}</span></h1>
        <p className="a-muted mt-2 max-w-3xl">Cores do header, do menu mobile e da página. A paleta <strong>Use Origens</strong> vale para toda região que escolher <em>Herdar</em>; cada região pode manter a <em>Paleta própria</em>. Sem configuração, a região continua exatamente como está hoje. Salvar guarda só um <strong>rascunho</strong>; a região é publicada em <em>Publicar</em>.</p>
      </div>
      <Flash ok={sp.ok} err={sp.err} />

      <ThemeEditor
        key={`region-${scope}-${ws.record?.rev ?? "null"}`}
        scope={scope}
        region={scope}
        theme={ws.doc.theme}
        globalTheme={global.doc.theme}
        navigation={ws.doc.navigation}
        navData={navByRegion}
        readOnly={!canEdit(actor, scope)}
        action={saveThemeAction}
        rev={String(ws.record?.rev ?? "null")}
        title={`Identidade visual de ${scopeName(scope)}`}
        note={inherits ? "Esta região herda a paleta da Use Origens." : "Escolha manter o visual atual, herdar a paleta global ou definir cores próprias."}
      />

      <ThemeEditor
        key={`global-${global.record?.rev ?? "null"}`}
        scope="global"
        region={scope}
        theme={global.doc.theme}
        globalTheme={global.doc.theme}
        navigation={undefined}
        navData={navByRegion}
        readOnly={!owner}
        action={saveThemeAction}
        rev={String(global.record?.rev ?? "null")}
        title="Paleta global · Use Origens"
        note="Os padrões da marca. Só o owner altera. Ao publicar, todas as regiões que herdam esta paleta mudam juntas, sem deploy; as que mantêm paleta própria ou o visual atual não mudam."
      />

      {owner && (
        <section className="a-card p-5" aria-label="Publicar a paleta global">
          <form action={publishGlobalThemeAction} className="space-y-3">
            <p className="a-muted text-[0.875rem]">Publica o documento global (a paleta e, se houver rascunho, o tracking global). Para o tracking, a confirmação dos IDs efetivos continua na tela Tracking.</p>
            <button type="submit" className="a-btn" disabled={!global.dirty} data-testid="publish-global-theme">Publicar paleta global</button>
            {!global.dirty && <span className="a-muted ml-3 text-[0.875rem]">Nada a publicar: o rascunho é igual ao publicado.</span>}
          </form>
          <form action={discardGlobalThemeAction} className="mt-3"><button type="submit" className="a-btn ghost sm" disabled={!global.record}>Descartar rascunho do global</button></form>
        </section>
      )}
    </div>
  );
}
