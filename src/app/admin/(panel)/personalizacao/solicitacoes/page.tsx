import Link from "next/link";
import { Flash } from "@/components/admin/Flash";
import { requireAdmin } from "@/lib/admin/auth/guard";
import { platform } from "@/lib/admin/platform";
import { currentScope, editableScopes, scopeName } from "@/lib/admin/scope";
import { OPEN_STATUSES, REQUEST_STATUSES, shortRef, STATUS_LABEL, type RequestRecord, type RequestStatus } from "@/lib/customization/requests";
import { REGION_SLUGS, type RegionSlug } from "@/lib/geo/regions";

const PAGE = 20;

/** The queue of personalization requests: the one place the team works them. Operators see only the regions they may edit. It shows who asked and which channels exist, never the number or address itself (that is in the request, for authorised people). */
export default async function RequestsQueue({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string; r?: string; s?: string; q?: string; p?: string }> }) {
  const actor = await requireAdmin();
  const scope = await currentScope(actor);
  const sp = await searchParams;
  const allowed = editableScopes(actor);
  const region: RegionSlug | "all" = sp.r === "all" && actor.role === "owner" ? "all" : (REGION_SLUGS as readonly string[]).includes(sp.r ?? "") && allowed.includes(sp.r as RegionSlug) ? (sp.r as RegionSlug) : scope;
  const status = (REQUEST_STATUSES as readonly string[]).includes(sp.s ?? "") ? (sp.s as RequestStatus) : undefined;
  const q = (sp.q ?? "").trim().slice(0, 80) || undefined;
  const page = Math.max(1, Math.floor(Number(sp.p)) || 1);
  const { requests } = platform();
  await requests.purgeExpired(new Date()).catch(() => 0); // retention: expired requests nobody is working on are removed when the queue is opened
  // A missing table (migration not applied yet) is shown as such instead of breaking the panel.
  let unavailable = false;
  let rows: RequestRecord[] = [];
  let total = 0;
  try {
    ({ rows, total } = await requests.list({ ...(region === "all" ? {} : { region }), ...(status ? { status } : {}), ...(q ? { q } : {}) }, PAGE, (page - 1) * PAGE));
  } catch {
    unavailable = true;
  }
  const open = await requests.countOpen(region === "all" ? allowed : [region]).catch(() => 0);
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const link = (p: number) => `/admin/personalizacao/solicitacoes?r=${region}${status ? `&s=${status}` : ""}${q ? `&q=${encodeURIComponent(q)}` : ""}&p=${p}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="a-h1">Solicitações de personalização</h1>
        <p className="mt-2 flex gap-2"><Link href="/admin/personalizacao" className="a-btn sm ghost">Modelos</Link><Link href="/admin/personalizacao/solicitacoes" aria-current="page" className="a-btn sm">Solicitações</Link></p>
        <p className="a-muted mt-3 max-w-3xl">O que os clientes enviaram, com o contato para falar com eles. Fluxo: <strong>a equipe cria a estampa, entra em contato quando ela está pronta e orienta a compra na INK</strong>. Uma solicitação não é um pedido e o CMS não acompanha compra nem pagamento.</p>
        <p className="mt-3" data-testid="queue-open-count"><span className={`a-badge ${open > 0 ? "warn" : "ok"}`}>{open} pendente(s)</span> <span className="a-muted text-[0.875rem]">recebidas, em criação ou com a arte pronta e o cliente ainda sem contato</span></p>
      </div>
      <Flash ok={sp.ok} err={sp.err} />
      <form method="get" className="a-card flex flex-wrap items-end gap-4 p-5" aria-label="Filtros">
        <div><label className="a-label" htmlFor="r">Região</label><select id="r" name="r" className="a-select" defaultValue={region}>{actor.role === "owner" && <option value="all">Todas</option>}{allowed.map((r) => <option key={r} value={r}>{scopeName(r)}</option>)}</select></div>
        <div><label className="a-label" htmlFor="s">Estado</label><select id="s" name="s" className="a-select" defaultValue={status ?? ""}><option value="">Todos</option>{REQUEST_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</select></div>
        <div className="grow"><label className="a-label" htmlFor="q">Buscar (referência, nome, modelo, texto)</label><input id="q" name="q" defaultValue={sp.q ?? ""} className="a-input" /></div>
        <button type="submit" className="a-btn ghost">Filtrar</button>
      </form>
      <section className="a-card overflow-x-auto" aria-label="Solicitações">
        <table className="a-table a-stack">
          <caption className="sr-only">Solicitações de personalização</caption>
          <thead><tr><th scope="col">Referência</th><th scope="col">Cliente</th><th scope="col">Contato</th><th scope="col">Modelo</th><th scope="col">Região</th><th scope="col">Data</th><th scope="col">Estado</th><th scope="col"><span className="sr-only">Ação</span></th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={8} className="a-muted">{unavailable ? "As solicitações ainda não estão disponíveis neste ambiente (a migration do banco não foi aplicada)." : null}{!unavailable && <>Nenhuma solicitação {total === 0 && !status && !q ? "ainda" : "com esses filtros"}.</>}</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} data-testid={`request-row-${shortRef(r.id)}`}>
                <td data-label="Referência"><code>{shortRef(r.id)}</code></td>
                <td data-label="Cliente" data-testid="row-customer">{r.contact?.name ?? <span className="a-muted">sem contato (anterior ao formulário)</span>}</td>
                <td data-label="Contato">{r.contact ? <span className="flex flex-wrap gap-1">{r.contact.whatsapp && <span className="a-badge" data-testid="has-whatsapp">WhatsApp</span>}{r.contact.email && <span className="a-badge" data-testid="has-email">E-mail</span>}</span> : <span className="a-muted">—</span>}</td>
                <td data-label="Modelo">{r.customizerName} <span className="a-muted">v{r.customizerVersion}</span></td>
                <td data-label="Região">{scopeName(r.region)}</td>
                <td data-label="Data">{new Date(r.createdAt).toLocaleString("pt-BR")}</td>
                <td data-label="Estado"><span className={`a-badge ${r.status === "customerContacted" || r.status === "closed" ? "ok" : r.status === "cancelled" ? "" : OPEN_STATUSES.includes(r.status) ? "warn" : ""}`}>{STATUS_LABEL[r.status]}</span></td>
                <td><Link href={`/admin/personalizacao/solicitacoes/${r.id}`} className="a-btn sm">Abrir</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
        {pages > 1 && (
          <nav aria-label="Páginas" className="flex items-center justify-between gap-3 border-t border-black/15 p-4 text-[0.875rem]">
            <span className="a-muted">{total} solicitações · página {page} de {pages}</span>
            <span className="flex gap-2">{page > 1 && <Link className="a-btn sm ghost" href={link(page - 1)}>← Mais novas</Link>}{page < pages && <Link className="a-btn sm ghost" href={link(page + 1)}>Mais antigas →</Link>}</span>
          </nav>
        )}
      </section>
    </div>
  );
}
