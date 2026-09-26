import Link from "next/link";
import { notFound } from "next/navigation";
import { linkRequestOrderAction, setRequestStatusAction } from "@/app/admin/actions";
import { Flash } from "@/components/admin/Flash";
import { requireAdmin } from "@/lib/admin/auth/guard";
import { platform } from "@/lib/admin/platform";
import { scopeName } from "@/lib/admin/scope";
import { canLinkOrder, nextStatuses, shortRef, STATUS_LABEL } from "@/lib/customization/requests";
import { summaryOf } from "@/lib/customization/validate";
import { canEdit } from "@/lib/admin/store/ports";

/** One request in full. Only an operator of the request's region (or the owner) may open it; anyone else gets a 404, whatever the URL. */
export default async function RequestDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const actor = await requireAdmin();
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const record = await platform().requests.get(id);
  if (!record || !canEdit(actor, record.region)) notFound();
  const lines = summaryOf(record.snapshot, record.values);
  const transitions = nextStatuses(record.status);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/personalizacao/solicitacoes" className="a-link text-[0.875rem]">← Solicitações</Link>
        <h1 className="a-h1 mt-2">Solicitação <code>{shortRef(record.id)}</code></h1>
        <p className="mt-2 flex flex-wrap items-center gap-2"><span className="a-badge warn">{STATUS_LABEL[record.status]}</span><span>{record.customizerName}</span><span className="a-muted">modelo v{record.customizerVersion} · {scopeName(record.region)}</span></p>
      </div>
      <Flash ok={sp.ok} err={sp.err} />

      <div className="a-flash ok"><p className="font-extrabold">Fronteira com a INK</p><p className="mt-1">O texto abaixo está <strong>só aqui</strong>. A INK não o recebeu e ele não acompanha a compra por conta própria. O vínculo com um pedido é manual: confira o pedido no painel da INK e digite o número.</p></div>

      <section className="a-card p-5" aria-labelledby="dados">
        <h2 id="dados" className="a-h2">O que o cliente pediu</h2>
        <dl className="mt-3 max-w-xl divide-y divide-black/10" data-testid="request-values">
          {lines.map((l) => <div key={l.label} className="flex justify-between gap-4 py-2"><dt className="a-muted">{l.label}</dt><dd className="font-bold">{l.value}</dd></div>)}
        </dl>
        <p className="a-muted mt-3 text-[0.8125rem]">Rótulos e limites são os do modelo na versão {record.customizerVersion} (guardados com a solicitação). Enviada em {new Date(record.createdAt).toLocaleString("pt-BR")}; guardada até {new Date(record.expiresAt).toLocaleDateString("pt-BR")} (retenção).</p>
      </section>

      <section className="a-card p-5" aria-labelledby="pedido">
        <h2 id="pedido" className="a-h2">Pedido da INK</h2>
        {record.order ? (
          <p className="mt-2">Vinculada ao pedido <code data-testid="linked-order">{record.order.number}</code> ({record.order.store}) por {record.order.linkedBy} em {new Date(record.order.linkedAt).toLocaleString("pt-BR")}.</p>
        ) : canLinkOrder(record.status) ? (
          <form action={linkRequestOrderAction} className="mt-3 space-y-3">
            <input type="hidden" name="id" value={record.id} />
            <div className="max-w-sm"><label className="a-label" htmlFor="order">Número do pedido na loja INK de {scopeName(record.region)}</label><input id="order" name="order" className="a-input" maxLength={40} required placeholder="INK-12345" /></div>
            <label className="flex items-start gap-2"><input type="checkbox" name="confirm" className="mt-1" /> <span>Conferi este número no painel da INK e ele pertence a esta solicitação.</span></label>
            <button type="submit" className="a-btn">Vincular pedido</button>
          </form>
        ) : <p className="a-muted mt-2">Nenhum pedido vinculado; neste estado não é possível vincular.</p>}
      </section>

      {transitions.length > 0 && (
        <section className="a-card p-5" aria-labelledby="estado">
          <h2 id="estado" className="a-h2">Mudar o estado</h2>
          <form action={setRequestStatusAction} className="mt-3 flex flex-wrap items-end gap-3">
            <input type="hidden" name="id" value={record.id} />
            <div><label className="a-label" htmlFor="status">Novo estado</label><select id="status" name="status" className="a-select">{transitions.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</select></div>
            <div className="grow"><label className="a-label" htmlFor="note">Nota interna (opcional)</label><input id="note" name="note" className="a-input" maxLength={200} /></div>
            <button type="submit" className="a-btn ghost">Atualizar estado</button>
          </form>
        </section>
      )}

      <section className="a-card p-5" aria-labelledby="historico">
        <h2 id="historico" className="a-h2">Histórico</h2>
        <ol className="mt-3 space-y-1 text-[0.9375rem]">{record.events.map((e, i) => <li key={i}><span className="a-muted">{new Date(e.at).toLocaleString("pt-BR")}</span> · {e.actor} · {e.action}{e.detail ? ` · ${e.detail}` : ""}</li>)}</ol>
      </section>
    </div>
  );
}
