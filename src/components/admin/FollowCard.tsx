import { setFollowAction, setScopeAction } from "@/app/admin/actions";
import { canEdit, type Actor } from "@/lib/admin/store/ports";
import { REGION_SCOPES, scopeName } from "@/lib/admin/scope";
import { loadWorkspace } from "@/lib/admin/workspace";
import type { RegionSlug } from "@/lib/geo/regions";
import { canFollowSul } from "@/lib/site-config/published";
import { FOLLOW_SOURCE, REGION_TOKEN, followsPart, type FollowPart } from "@/lib/site-config/follow-schema";
import type { ScopeDoc } from "@/lib/site-config/schema";

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
              ? <>O que está publicado na Sul vale aqui ({WHAT[part]}), adaptado ao {scopeName(scope)}: links da Sul passam a apontar para cá, estados que não são daqui saem e <code>{REGION_TOKEN}</code> vira “{scopeName(scope)}”. Mude na Sul e publique por lá. A configuração própria do {scopeName(scope)} fica guardada, fora da loja.</>
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
