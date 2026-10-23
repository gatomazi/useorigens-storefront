import Link from "next/link";
import { resetNavigationAction, saveNavigationAction } from "@/app/admin/actions";
import { CollectionMenuCard } from "@/components/admin/CollectionMenuCard";
import { CollectionHighlightsCard } from "@/components/admin/CollectionHighlightsCard";
import { CollectionNotesCard } from "@/components/admin/CollectionNotesCard";
import { Flash } from "@/components/admin/Flash";
import { HeaderActionsCard } from "@/components/admin/HeaderActionsCard";
import { RegionCopyPanel } from "@/components/admin/RegionCopyPanel";
import { NavigationEditor } from "@/components/admin/NavigationEditor";
import { requireAdmin } from "@/lib/admin/auth/guard";
import { currentScope, scopeName } from "@/lib/admin/scope";
import { canEdit } from "@/lib/admin/store/ports";
import { loadWorkspace } from "@/lib/admin/workspace";
import { launchedRegions } from "@/lib/regions/launched";
import { siteCollectionMenu } from "@/lib/catalog/collection-menu";
import { getCollections } from "@/lib/catalog/collections-file";
import { storeForRegion } from "@/lib/catalog/commerce-mode";
import { coveredUfs } from "@/lib/site-config/chrome";
import { navData, resolveTheme } from "@/lib/site-config/navigation";

/**
 * "Menu": everything that makes up the store's menu, in one place. The header's icons, the collections on the bar and in "Categorias" (also the INK
 * navbar), the home sections that are links on the bar, and the phone menu's blocks. All of it is draft until Publicar.
 */
export default async function NavigationPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const actor = await requireAdmin();
  const scope = await currentScope(actor);
  const sp = await searchParams;
  const [ws, global] = await Promise.all([loadWorkspace(scope), loadWorkspace("global")]);
  // The real data the menu is made of, today: the home's own sections (the draft), the launched regions, the states that have products.
  const data = navData({ region: scope, doc: ws.doc, launched: launchedRegions(), coveredUfs: coveredUfs(scope), collections: siteCollectionMenu(scope, ws.doc) });
  const colors = resolveTheme(scope, ws.doc, global.doc).effective;
  const synced = Boolean(getCollections().stores[storeForRegion(scope)]);
  const sectionLinks = (ws.doc.home?.sections ?? []).filter((s) => s.nav);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="a-h1">Menu <span className="a-muted">· {scopeName(scope)}</span></h1>
        <p className="a-muted mt-2 max-w-3xl">O menu da loja em um lugar só: as <strong>coleções</strong> da barra do topo e de “Categorias” (que também vão para a navbar da INK), as <strong>seções da home</strong> que viram link na barra e os <strong>blocos do menu do celular</strong>. Tudo é rascunho: a loja só muda depois de <Link href="/admin/publicar" className="a-link">Publicar</Link>.</p>
      </div>
      <Flash ok={sp.ok} err={sp.err} />
      <RegionCopyPanel actor={actor} scope={scope} part="navigation" rev={ws.record?.rev ?? null} />

      <HeaderActionsCard scope={scope} navigation={ws.doc.navigation} rev={ws.record?.rev ?? null} readOnly={!canEdit(actor, scope)} />

      {synced ? <CollectionMenuCard region={scope} doc={ws.doc} rev={ws.record?.rev ?? null} /> : <p className="a-flash err">As coleções desta loja ainda não foram sincronizadas: sem elas não há menu de coleções. Sincronize em <Link href="/admin/sincronizacao" className="a-link">Sincronização</Link>.</p>}

      {synced && <CollectionHighlightsCard region={scope} doc={ws.doc} rev={ws.record?.rev ?? null} readOnly={!canEdit(actor, scope)} colors={colors} />}

      {synced && <CollectionNotesCard region={scope} doc={ws.doc} rev={ws.record?.rev ?? null} readOnly={!canEdit(actor, scope)} />}

      <section className="a-card p-5" aria-labelledby="links-secoes" data-testid="menu-section-links">
        <h2 id="links-secoes" className="a-h2">Seções da home na barra do topo</h2>
        <p className="a-muted mt-1 max-w-3xl text-[0.9375rem]">Uma seção da home pode virar um link da barra (com um apelido curto). Isso se liga no editor da própria seção, em “Menu do topo”.</p>
        {sectionLinks.length === 0 ? (
          <p className="a-muted mt-3 text-[0.875rem]">Nenhuma seção da home está na barra. Para pôr uma, edite a seção em <Link href="/admin/home" className="a-link">Home</Link> e marque “Mostrar esta seção no menu do topo da loja”.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {sectionLinks.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">“{s.nav!.label}”</span>
                <span className="a-muted text-[0.875rem]">leva à seção {s.title?.replace(/\n/g, " ") ?? s.anchor}</span>
                {!s.active && <span className="a-badge" title="Seção oculta: o link não aparece.">seção oculta</span>}
                <Link href={`/admin/home/${s.id}`} className="a-btn sm ghost ml-auto">Editar seção</Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div>
        <h2 className="a-h2">Menu do celular</h2>
        <p className="a-muted mt-1 max-w-3xl text-[0.9375rem]">Quatro blocos: <strong>Comprar</strong>, <strong>Categorias</strong>, <strong>Estados da região</strong> e <strong>Outras regiões</strong>. Você controla rótulos, posição e visibilidade; as categorias vêm das coleções acima e os estados e as regiões, do que já foi lançado.</p>
      </div>
      <NavigationEditor key={`${scope}-${ws.record?.rev ?? "null"}`} region={scope} config={ws.doc.navigation} data={data} colors={colors} readOnly={!canEdit(actor, scope)} action={saveNavigationAction} resetAction={resetNavigationAction} rev={String(ws.record?.rev ?? "null")} />
    </div>
  );
}
