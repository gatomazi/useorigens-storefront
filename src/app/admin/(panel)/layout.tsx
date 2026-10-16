import Link from "next/link";
import { logoutAction, setScopeAction } from "@/app/admin/actions";
import { requireAdmin } from "@/lib/admin/auth/guard";
import { pendingPublishes } from "@/lib/admin/pending";
import { platform } from "@/lib/admin/platform";
import { currentScope, editableScopes, scopeName } from "@/lib/admin/scope";
import { seedForEnv } from "@/lib/admin/publishing";
import { siteUrl } from "@/lib/config/env";
import { regionThemeStyle } from "@/lib/theme/region-theme";
import { SidebarNav } from "@/components/admin/SidebarNav";

/**
 * The CMS shell. Requires the admin surface (see the root layout) AND a signed-in person: without a session the visitor is sent to the
 * login page before anything of the panel is drawn. No tracking scripts, no consent banner, no storefront chrome.
 */
export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireAdmin();
  const prod = platform().mode === "prod";
  const scope = await currentScope(actor);
  const editable = editableScopes(actor);
  const published = await platform().files.read();
  // Requests still waiting for someone, in the regions this person may act on. A missing table (migration not applied yet) must never break the panel.
  const openRequests = await platform().requests.countOpen(editable).catch(() => 0);
  // What is waiting to be published here (region, pages, models and, for the owner, the global document): the count on the "Publicar" shortcut.
  const pending = await pendingPublishes(scope, actor).catch(() => null);
  const pendingTitle = pending
    ? [pending.region.pending ? `${scopeName(scope)}: rascunho com alterações` : null, pending.pages.length ? `${pending.pages.length} página(s)` : null, pending.models.length ? `${pending.models.length} modelo(s) de personalização` : null, pending.global?.pending ? "configuração global" : null].filter(Boolean).join(" · ")
    : "";
  const launchedIn = (r: string) => r === "sul" || (published?.docs[r as "norte"]?.launched ?? seedForEnv().docs[r as "norte"]?.launched) === true;
  return (
    <div className="lg:grid lg:grid-cols-[15rem_1fr]" style={regionThemeStyle(scope)}>
      <aside className="on-ink flex flex-col gap-6 bg-region-primary px-5 py-5 lg:min-h-dvh lg:sticky lg:top-0 lg:h-dvh lg:overflow-y-auto" style={{ background: "var(--region-primary)" }}>
        <Link href="/admin" className="block">
          <span className="block text-[1.6rem] font-extrabold uppercase leading-none tracking-wide [font-family:var(--font-display-stack)]">Use Origens</span>
          <span className="mt-1 block text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-white/70">{prod ? "Painel" : "Painel · local"}</span>
        </Link>
        <SidebarNav pendingRequests={openRequests} owner={prod && actor.role === "owner"} regionName={scopeName(scope)} storeHref={launchedIn(scope) ? (prod ? `${siteUrl().replace(/\/$/, "")}/${scope}` : `/${scope}`) : null} storeLabel={prod ? "Abrir a loja ↗" : "Abrir a loja local ↗"} />
        <div className="mt-auto hidden text-[0.75rem] leading-snug text-white/70 lg:block">
          {prod ? (
            <>
              <p className="font-bold text-white">{actor.email}</p>
              <p className="mt-1">{actor.role === "owner" ? "Owner" : "Editor"}</p>
              <form action={logoutAction} className="mt-2"><button type="submit" className="a-btn ghost sm !text-white">Sair</button></form>
            </>
          ) : (
            <>
              <p className="font-bold text-white">Ambiente de desenvolvimento</p>
              <p className="mt-1">Nada aqui altera a loja em produção. Rascunhos e publicações ficam em <code className="text-white">data/admin-dev/</code>.</p>
            </>
          )}
        </div>
      </aside>
      <div className="min-w-0">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-black/15 bg-white px-5 py-3 lg:px-8">
          <form action={setScopeAction} className="flex flex-wrap items-center gap-2" aria-label="Região em edição">
            <span className="a-label !mb-0">Região</span>
            {editable.map((r) => (
              <button key={r} type="submit" name="scope" value={r} aria-pressed={r === scope} className={`a-btn sm ${r === scope ? "" : "ghost"}`} title={launchedIn(r) ? "Pública na loja" : "Em preparação: ainda não é pública"}>
                {scopeName(r)}
                <span className={`ml-2 a-badge ${launchedIn(r) ? "ok" : ""}`}>{launchedIn(r) ? "Pública" : "Prévia"}</span>
              </button>
            ))}
          </form>
          <div className="flex flex-wrap items-center gap-3">
            {!prod && <span className="a-badge dev">Desenvolvimento local</span>}
            <Link href="/admin/publicar" className="a-btn sm" data-testid="publish-shortcut" title={pendingTitle ? `Esperando publicação: ${pendingTitle}` : "Nada esperando publicação"}>
              Publicar
              {pending && pending.count > 0 ? <span className="a-badge warn" data-testid="publish-pending-count">{pending.count}<span className="sr-only"> {pending.count === 1 ? "item esperando publicação" : "itens esperando publicação"}</span></span> : null}
            </Link>
            {prod && <form action={logoutAction} className="lg:hidden"><button type="submit" className="a-btn ghost sm">Sair</button></form>}
          </div>
        </header>
        <main className="px-5 py-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
