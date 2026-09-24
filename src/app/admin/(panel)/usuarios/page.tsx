import { deactivateUserAction, saveUserAction } from "@/app/admin/actions";
import { Flash } from "@/components/admin/Flash";
import { requireAdmin } from "@/lib/admin/auth/guard";
import { platform } from "@/lib/admin/platform";
import { notFound } from "next/navigation";

const SCOPE_LABEL = { sul: "Sul", norte: "Norte", "centro-oeste": "Centro-Oeste" } as const;
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR") : "nunca");

/** Owner-only: who may sign in, and for which regions. There is no public sign-up; this list is the allowlist. */
export default async function PeoplePage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  await requireAdmin({ owner: true });
  const { users, audit } = platform();
  if (!users) notFound();
  const sp = await searchParams;
  const [people, recent] = await Promise.all([users.list(), audit.recent(60)]);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="a-h1">Pessoas</h1>
        <p className="a-muted mt-2 max-w-2xl">Só quem está nesta lista consegue entrar (com uma conta Railway cujo e-mail verificado seja esse; entrar não dá acesso ao projeto Railway). Editores só veem e publicam as regiões marcadas. O owner é definido pelo ambiente e tem acesso a tudo.</p>
      </div>
      <Flash ok={sp.ok} err={sp.err} />

      <form action={saveUserAction} className="a-card grid gap-4 p-5 md:grid-cols-[2fr_2fr_auto] md:items-end">
        <div><label className="a-label" htmlFor="email">E-mail do editor</label><input id="email" name="email" type="email" required className="a-input" autoComplete="off" placeholder="pessoa@empresa.com.br" /></div>
        <fieldset>
          <legend className="a-label">Regiões</legend>
          <div className="flex flex-wrap gap-4">
            {(Object.keys(SCOPE_LABEL) as (keyof typeof SCOPE_LABEL)[]).map((sc) => (
              <label key={sc} className="flex items-center gap-2"><input type="checkbox" name="scopes" value={sc} defaultChecked={sc === "sul"} />{SCOPE_LABEL[sc]}</label>
            ))}
          </div>
        </fieldset>
        <button type="submit" className="a-btn">Cadastrar ou atualizar</button>
      </form>

      <section className="a-card overflow-x-auto" aria-label="Pessoas com acesso">
        <table className="a-table a-stack">
          <caption className="sr-only">Pessoas com acesso ao painel</caption>
          <thead><tr><th scope="col">E-mail</th><th scope="col">Papel</th><th scope="col">Regiões</th><th scope="col">Último acesso</th><th scope="col"><span className="sr-only">Ação</span></th></tr></thead>
          <tbody>
            {people.map((u) => (
              <tr key={u.id}>
                <td data-label="E-mail" className="font-bold">{u.email}{!u.active && <span className="a-badge bad ml-2">Sem acesso</span>}</td>
                <td data-label="Papel">{u.role === "owner" ? "Owner" : "Editor"}</td>
                <td data-label="Regiões">{u.role === "owner" ? "Todas" : u.scopes.map((s) => (SCOPE_LABEL as Record<string, string>)[s] ?? s).join(", ")}</td>
                <td data-label="Último acesso" className="a-muted">{when(u.lastLoginAt)}</td>
                <td className="text-right">
                  {u.role !== "owner" && u.active && (
                    <form action={deactivateUserAction}><input type="hidden" name="id" value={u.id} /><button type="submit" className="a-btn sm danger">Remover acesso</button></form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="a-card p-5" aria-label="Atividade recente">
        <p className="a-h2">Atividade recente</p>
        <ul className="mt-3 space-y-1 text-[0.875rem]">
          {recent.length === 0 && <li className="a-muted">Nada registrado ainda.</li>}
          {recent.map((r) => <li key={r.id}><span className="a-muted">{when(r.at)}</span> · <strong>{r.action}</strong>{r.target ? ` · ${r.target}` : ""}</li>)}
        </ul>
      </section>
    </div>
  );
}
