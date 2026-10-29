import Link from "next/link";
import { setFollowAction, setScopeAction } from "@/app/admin/actions";
import { canEdit, type Actor } from "@/lib/admin/store/ports";
import { REGION_SCOPES, scopeName } from "@/lib/admin/scope";
import { loadWorkspace } from "@/lib/admin/workspace";
import type { CommerceStoreKey, RegionSlug } from "@/lib/geo/regions";
import { categoryProps } from "@/lib/catalog/collection-source";
import { MIN_USABLE_PRODUCTS } from "@/lib/catalog/collections";
import { findCollection } from "@/lib/catalog/collections-file";
import { getCatalog } from "@/lib/catalog/repository";
import { campaignLeadsNowhere, destinationHref } from "@/lib/site-config/sources";
import { canFollowSul } from "@/lib/site-config/published";
import { FOLLOW_SOURCE, REGION_TOKEN, followsPart, type FollowPart } from "@/lib/site-config/follow-schema";
import type { ScopeDoc, Section } from "@/lib/site-config/schema";
import { followedDoc, regionalOf } from "@/lib/site-config/follow";
import { HOME_THEME_LABEL } from "@/lib/site-config/home-themes";
import { homeThemeOf } from "@/lib/site-config/schema";

/** The part with its article, inside a sentence ("Norte segue a home da Sul"). */
const THE: Record<FollowPart, string> = { home: "a home", menu: "o menu", statePage: "a página do estado", pages: "as páginas" };

/** What comes along when the part follows Sul, in the words of the panel. */
const WHAT: Record<FollowPart, string> = {
  home: "seções, ordem, textos, imagens e o tema em uso",
  menu: "navegação e menu de coleções, no site e na barra que aparece na INK",
  statePage: "seções ligadas, categorias, subcategorias e grades",
  pages: "as páginas da Sul passam a existir aqui também; uma página desta região com o mesmo endereço vence a da Sul",
};

/**
 * "Seguir a Sul" on the screen of one part. On Norte / Centro-Oeste: the switch (saved in the draft) and, while it follows, where to edit. On Sul: which
 * regions follow this part, so the owner knows a publish here changes them too. `to`: the screen it sits on (the action returns there).
 */
export async function FollowCard({ actor, scope, part, doc, baseDoc, rev, to }: { actor: Actor; scope: RegionSlug; part: FollowPart; doc: ScopeDoc; baseDoc: ScopeDoc; rev: number | null; to: string }) {
  if (scope === FOLLOW_SOURCE) {
    const others = REGION_SCOPES.filter((r) => r !== FOLLOW_SOURCE);
    const followers = (await Promise.all(others.map(async (r) => ({ r, ws: await loadWorkspace(r) })))).filter(({ ws }) => followsPart(ws.baseDoc, part) || followsPart(ws.doc, part));
    if (followers.length === 0) return null;
    return (
      <section id="seguir-sul" className="a-card scroll-mt-4 p-4" aria-label="Regiões que seguem a Sul" data-testid="follow-sources">
        <p className="text-[0.9375rem]">
          <strong>{followers.map(({ r }) => scopeName(r)).join(" e ")}</strong> {followers.length === 1 ? "segue" : "seguem"} {THE[part]} da Sul: o que você publicar aqui passa a valer lá também, adaptado à região (links, estados e <code>{REGION_TOKEN}</code> nos textos).
          {followers.some(({ ws }) => !followsPart(ws.baseDoc, part)) && <span className="a-badge warn ml-2">Em {followers.filter(({ ws }) => !followsPart(ws.baseDoc, part)).map(({ r }) => scopeName(r)).join(" e ")}, ainda só no rascunho</span>}
        </p>
        {(part === "home" || part === "pages") && <p className="a-muted mt-1 text-[0.8125rem]">Para mudar só uma região, abra a seção e escolha em “Aparece em” onde ela entra: uma seção só da Sul, ou uma só do Norte no lugar dela.</p>}
      </section>
    );
  }
  const following = followsPart(doc, part);
  const live = followsPart(baseDoc, part);
  const editable = canEdit(actor, scope);
  return (
    <section id="seguir-sul" className="a-card scroll-mt-4 p-5" aria-labelledby="seguir-sul-titulo" data-testid={`follow-${part}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-3xl">
          <h2 id="seguir-sul-titulo" className="a-h2">{following ? "Seguindo a Sul" : `Configuração própria do ${scopeName(scope)}`}</h2>
          <p className="a-muted mt-1 text-[0.875rem]">
            {following
              ? <>O que está publicado na Sul vale aqui ({WHAT[part]}), adaptado ao {scopeName(scope)}: links da Sul passam a apontar para cá, estados que não são daqui saem e <code>{REGION_TOKEN}</code> vira “{scopeName(scope)}”. Mude na Sul e publique por lá.{part === "home" && <> As imagens e os produtos podem ser os do {scopeName(scope)}: veja “Imagens e produtos”, abaixo.</>} A configuração própria do {scopeName(scope)} fica guardada, fora da loja.</>
              : <>Seguindo a Sul, você monta {THE[part]} uma vez só, na Sul ({WHAT[part]}), e o {scopeName(scope)} acompanha. A configuração de agora fica guardada para quando quiser voltar.</>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {following && canEdit(actor, FOLLOW_SOURCE) && (
            <form action={setScopeAction}>
              <input type="hidden" name="scope" value={FOLLOW_SOURCE} />
              <input type="hidden" name="from" value={to} />
              <button type="submit" className="a-btn sm ghost">Editar na Sul</button>
            </form>
          )}
          {editable && (
            <form action={setFollowAction}>
              <input type="hidden" name="rev" value={rev ?? "null"} />
              <input type="hidden" name="scope" value={scope} />
              <input type="hidden" name="part" value={part} />
              <input type="hidden" name="to" value={to} />
              <input type="hidden" name="on" value={String(!following)} />
              <button type="submit" className="a-btn sm">{following ? `Usar configuração própria` : "Seguir a Sul"}</button>
            </form>
          )}
        </div>
      </div>
      <p className="mt-3 flex flex-wrap items-center gap-2 text-[0.9375rem]">
        Na loja: {live ? <span className="a-badge ok">Segue a Sul</span> : <span className="a-badge">Própria</span>}
        {following !== live && <span className="a-badge warn">No rascunho: {following ? "segue a Sul" : "própria"} (falta publicar)</span>}
      </p>
      {following && !canFollowSul(scope) && <p className="a-flash err mt-3">O {scopeName(scope)} não vende na mesma loja da INK que a Sul agora (loja única desligada): enquanto isso, a loja mostra a configuração própria do {scopeName(scope)}.</p>}
    </section>
  );
}

/** While the part follows Sul, the region's own editor stays reachable but folded away: it is not what the store shows. */
export function FollowFold({ following, scope, children }: { following: boolean; scope: RegionSlug; children: React.ReactNode }) {
  if (!following) return <>{children}</>;
  return (
    <details className="a-card p-4" data-testid="follow-fold">
      <summary className="cursor-pointer font-semibold">Configuração própria do {scopeName(scope)} <span className="a-muted font-normal">(guardada, fora da loja enquanto segue a Sul)</span></summary>
      <div className="mt-4 space-y-6">{children}</div>
    </details>
  );
}

const REGIONAL_WHAT: Partial<Record<Section["template"], string>> = { hero: "foto, produtos e banners da abertura", states: "capa de cada estado", "image-grid": "blocos da grade (imagem, texto e link)" };

const collectionName = (store: CommerceStoreKey, collectionId: number) => findCollection(store, collectionId)?.name ?? `coleção ${collectionId}`;

/**
 * What of one of Sul's sections the region leaves out today, in the panel's words (null: it shows whole). Same rules as the store: a campaign whose button
 * has nowhere to go, a showcase without the region's products, a grid block leading to a collection the region does not have. All of it comes back by
 * itself once the region has the products.
 */
function regionGap(s: Section, sulActive: boolean, props: ReturnType<typeof categoryProps>, region: RegionSlug): string | null {
  const name = scopeName(region);
  if (sulActive && !s.active) return `Não aparece no ${name}: o botão leva a um modelo ou uma página que o ${name} não tem.`;
  if (!s.active) return null;
  const dest = s.cta?.dest;
  if (campaignLeadsNowhere(s, props.links, region)) {
    return dest && (dest.kind === "collection-page" || dest.kind === "ink-collection")
      ? `Não aparece no ${name}: a coleção ${collectionName(dest.store, dest.collectionId)} ainda não tem produtos do ${name} (mínimo ${MIN_USABLE_PRODUCTS}).`
      : `Não aparece no ${name}: o botão não tem para onde levar aqui.`;
  }
  if (s.template === "product-carousel" && s.source?.kind === "ink-category") {
    const found = props.categories(s.source);
    if (found.status !== "ok" || found.items.length === 0) return `Não aparece no ${name}: a coleção ${collectionName(s.source.store, s.source.collectionId)} não tem produtos do ${name}.`;
  }
  if (s.template === "image-grid") {
    const out = (s.tiles ?? []).filter((t) => !destinationHref(t.dest, props.links, region)).map((t) => `“${t.label}”`);
    if (out.length) return `No ${name}, sai${out.length > 1 ? "em" : ""} da grade: ${out.join(", ")} (a coleção ainda não tem produtos do ${name}).`;
  }
  return null;
}

/**
 * On a region that follows Sul's home: Sul's sections as this region shows them, each with a link to its own pictures and products (`regional`). The
 * structure stays Sul's; the banners and the products are the region's when it chooses them.
 */
export async function RegionalSectionsList({ scope, doc }: { scope: RegionSlug; doc: ScopeDoc }) {
  if (scope === FOLLOW_SOURCE || !followsPart(doc, "home")) return null;
  const sul = await loadWorkspace(FOLLOW_SOURCE);
  const followed = followedDoc(doc, sul.baseDoc, true);
  const sections = (followed.home?.sections ?? []).filter((s) => s.template !== "footer");
  const own = new Set(regionalOf(doc, sul.baseDoc).map((e) => e.sectionId));
  const catalog = getCatalog();
  const props = categoryProps((store) => catalog.productsOfStore(store), followed);
  const sulActive = new Set((sul.baseDoc.home?.sections ?? []).filter((s) => s.active).map((s) => s.id));
  const theme = homeThemeOf(sul.baseDoc);
  return (
    <section id="imagens-regiao" className="a-card scroll-mt-4 overflow-x-auto" aria-labelledby="imagens-regiao-titulo" data-testid="regional-sections">
      <div className="p-4">
        <h2 id="imagens-regiao-titulo" className="a-h2">Imagens e produtos do {scopeName(scope)} <span className="a-muted">· tema {HOME_THEME_LABEL[theme]}</span></h2>
        <p className="a-muted mt-1 text-[0.875rem]">A estrutura é a da Sul publicada. Em cada seção, você pode trocar a foto (e, na abertura, os produtos e os banners de cada um) pelas do {scopeName(scope)}. O que não trocar segue a Sul. Cada tema da home da Sul (Original, Black Friday, Natal…) tem as próprias imagens e produtos do {scopeName(scope)}: quando a Sul troca de tema, esta lista passa a ser a do tema novo.</p>
      </div>
      <table className="a-table a-stack">
        <thead><tr><th scope="col">Seção da Sul</th><th scope="col">Imagens e produtos</th><th scope="col"><span className="sr-only">Editar</span></th></tr></thead>
        <tbody>
          {sections.map((s) => {
            const gap = regionGap(s, sulActive.has(s.id), props, scope);
            return (
            <tr key={s.id} className={s.active ? "" : "opacity-60"}>
              <td data-label="Seção da Sul">
                <span className="font-bold">{s.title?.replace(/\n/g, " ") ?? s.anchor}</span>{!sulActive.has(s.id) && <span className="a-badge ml-2">Oculta na Sul</span>}
                <p className="a-muted text-[0.8125rem]">{REGIONAL_WHAT[s.template] ?? "foto da seção"}</p>
                {gap && <p className="mt-1 text-[0.8125rem]" data-testid="regional-gap"><span className="a-badge warn mr-1">Fora do {scopeName(scope)}</span>{gap}</p>}
              </td>
              <td data-label="Imagens e produtos">{own.has(s.id) ? <span className="a-badge ok">Próprias do {scopeName(scope)}</span> : <span className="a-badge">As da Sul</span>}</td>
              <td className="text-right"><Link href={`/admin/home/regional/${s.id}`} className="a-btn sm ghost">Editar</Link></td>
            </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
