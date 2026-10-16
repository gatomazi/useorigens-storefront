import Link from "next/link";
import { adoptCollectionMenuAction, moveCollectionMenuAction, setCollectionMenuPositionAction } from "@/app/admin/actions";
import { collectionMenuEntries, offMenuEntries, type MenuEntry } from "@/lib/catalog/collection-menu";
import type { RegionSlug } from "@/lib/geo/regions";
import { effectiveMenu, type MenuPosition } from "@/lib/site-config/collection-menu";
import { effectiveNavbarGroups } from "@/lib/site-config/navbar-groups";
import type { ScopeDoc } from "@/lib/site-config/schema";

/** Where a collection of the menu can really show up: a page of ours (the site) and/or its INK page (the Worker's navbar). */
function reachBadge(e: Pick<MenuEntry, "pagePath" | "inkUrl"> | undefined) {
  if (!e || (!e.pagePath && !e.inkUrl)) return <span className="a-badge warn" title="Sem página no site nem na INK (interna não habilitada, poucos produtos ou fora do último sync). A escolha fica guardada.">não aparece</span>;
  if (!e.pagePath) return <span className="a-badge" title="Sem página no site: a página da coleção precisa de pelo menos 3 produtos. Aparece só na navbar da INK.">só na INK</span>;
  if (!e.inkUrl) return <span className="a-badge" title="Interna (oculta na INK): não tem página na INK, então aparece só no menu do site.">só no site</span>;
  return null;
}

const LABEL: Record<MenuPosition, string> = { none: "Não exibir", top: "Topo", more: "Categorias" };

/**
 * The region's collection menu, one for the storefront header ("Topo" and "Categorias") and the navbar the Worker draws on INK's product pages.
 * Every collection that can link somewhere sits in exactly one of three lists, each with the buttons that move it to the other two.
 */
export function CollectionMenuCard({ region, doc, rev }: { region: RegionSlug; doc: ScopeDoc; rev: number | null }) {
  const { menu, own } = effectiveMenu(doc);
  const entries = collectionMenuEntries(region, doc);
  // Categorias as the owner reads it: what really shows up, plus anything brought in by hand (so a choice that stopped working stays visible).
  const categories = entries.more.filter((e) => e.pagePath || e.inkUrl || menu.added.some((r) => r.collectionId === e.record.id));
  const off = offMenuEntries(region, doc);
  const reach = new Map(entries.top.map((e) => [e.record.id, e]));
  const inkBefore = effectiveNavbarGroups(doc).groups;
  const hidden = (ref: string) => (
    <>
      <input type="hidden" name="ref" value={ref} />
      <input type="hidden" name="rev" value={rev ?? "null"} />
      <input type="hidden" name="scope" value={region} />
    </>
  );
  const moveTo = (ref: string, name: string, to: MenuPosition[]) => (
    <form action={setCollectionMenuPositionAction} role="group" aria-label={`Posição de ${name} no menu`} className="flex flex-wrap gap-1">
      {hidden(ref)}
      {to.map((pos) => <button key={pos} type="submit" name="position" value={pos} className="a-btn sm ghost">{LABEL[pos]}</button>)}
    </form>
  );

  return (
    <section id="menu-colecoes" className="a-card scroll-mt-4 p-5" aria-labelledby="menu-colecoes-titulo" data-testid="collection-menu">
      <h2 id="menu-colecoes-titulo" className="a-h2">Coleções no menu: Topo e Categorias</h2>
      <p className="a-muted mt-2 max-w-3xl">Um menu só para o topo do site e para a navbar das páginas de produto da INK. <strong>Topo</strong>: direto na barra, na ordem abaixo. <strong>Categorias</strong>: o menu “Categorias” do site, com todas (as do topo primeiro), e “Demais categorias” na INK. Toda coleção <strong>pública</strong> entra sozinha em Categorias, na ordem do menu da INK; use <strong>Não exibir</strong> para tirar uma. Coleção interna só aparece no site, e só se você colocar (depois de habilitada em <Link href="/admin/colecoes" className="a-link">Coleções</Link>). No site, cada uma abre a página da coleção.</p>
      {!own && (
        <div className="a-flash mt-3 flex flex-wrap items-center justify-between gap-3" data-testid="menu-adopt">
          <p className="max-w-3xl">A navbar da INK ainda mostra a escolha antiga ({inkBefore.top.length} no topo, {inkBefore.more.length} em Demais categorias). Ela passa a seguir este menu na primeira mudança aqui, ou com o botão ao lado, depois de publicar. O site já mostra este menu.</p>
          <form action={adoptCollectionMenuAction}>
            <input type="hidden" name="rev" value={rev ?? "null"} />
            <input type="hidden" name="scope" value={region} />
            <button type="submit" className="a-btn sm">Usar este menu também na INK</button>
          </form>
        </div>
      )}
      <div className="mt-4 grid gap-6 xl:grid-cols-3">
        <div data-testid="menu-top">
          <p className="font-bold">Topo <span className="a-muted font-normal">({menu.top.length})</span></p>
          {menu.top.length === 0 ? <p className="a-muted mt-2 text-[0.875rem]">Nenhuma coleção no topo: a barra mostra só Regiões, Categorias e os links da home.</p> : (
            <ol className="mt-2 space-y-2">
              {menu.top.map((r, i) => {
                const entry = reach.get(r.collectionId);
                const name = entry?.record.name ?? `coleção #${r.collectionId}`;
                const ref = `${r.store}:${r.collectionId}`;
                return (
                  <li key={ref} className="flex flex-wrap items-center gap-2">
                    <span className="a-muted w-5 text-right">{i + 1}.</span>
                    <span className="font-semibold">{name}</span>
                    {reachBadge(entry)}
                    <span className="ml-auto flex flex-wrap gap-1">
                      <form action={moveCollectionMenuAction} className="flex gap-1">
                        {hidden(ref)}
                        <button type="submit" name="direction" value="up" className="a-btn sm ghost" disabled={i === 0} aria-label={`Subir ${name}`}>↑</button>
                        <button type="submit" name="direction" value="down" className="a-btn sm ghost" disabled={i === menu.top.length - 1} aria-label={`Descer ${name}`}>↓</button>
                      </form>
                      {moveTo(ref, name, ["more", "none"])}
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
        <div data-testid="menu-categories">
          <p className="font-bold">Categorias <span className="a-muted font-normal">({categories.length} além das do topo)</span></p>
          {categories.length === 0 ? <p className="a-muted mt-2 text-[0.875rem]">Nenhuma outra coleção: Categorias mostra só as do topo.</p> : (
            <ul className="mt-2 space-y-2">
              {categories.map((e) => (
                <li key={e.record.id} className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{e.record.name}</span>
                  {reachBadge(e)}
                  <span className="ml-auto">{moveTo(`${e.ref.store}:${e.record.id}`, e.record.name, ["top", "none"])}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="a-muted mt-2 text-[0.8125rem]">Na ordem do menu da INK.</p>
        </div>
        <div data-testid="menu-off">
          <p className="font-bold">Não exibidas <span className="a-muted font-normal">({off.length})</span></p>
          {off.length === 0 ? <p className="a-muted mt-2 text-[0.875rem]">Nenhuma: toda coleção que pode aparecer já está no menu.</p> : (
            <ul className="mt-2 space-y-2">
              {off.map((e) => (
                <li key={e.record.id} className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{e.record.name}</span>
                  {!e.record.isAvailable && <span className="a-badge" title="Oculta na INK: aparece só no menu do site.">interna</span>}
                  <span className="ml-auto">{moveTo(`${e.ref.store}:${e.record.id}`, e.record.name, ["top", "more"])}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="a-muted mt-2 text-[0.8125rem]">Públicas tiradas do menu e internas habilitadas que ainda não entraram.</p>
        </div>
      </div>
    </section>
  );
}
