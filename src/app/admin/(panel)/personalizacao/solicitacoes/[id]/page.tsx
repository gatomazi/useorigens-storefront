import Link from "next/link";
import { notFound } from "next/navigation";
import { addRequestNoteAction, setRequestProductLinkAction, setRequestStatusAction } from "@/app/admin/actions";
import { ContactActions } from "@/components/admin/ContactActions";
import { Flash } from "@/components/admin/Flash";
import { requireAdmin } from "@/lib/admin/auth/guard";
import { platform } from "@/lib/admin/platform";
import { scopeName } from "@/lib/admin/scope";
import { canEdit } from "@/lib/admin/store/ports";
import { CONTACT_NOTICE_VERSION, suggestedMessage } from "@/lib/customization/contact";
import { nextStatuses, normalizeStatus, shortRef, STATUS_LABEL, type RequestEvent } from "@/lib/customization/requests";
import { summaryOf } from "@/lib/customization/validate";

const when = (iso: string) => new Date(iso).toLocaleString("pt-BR");

/** One line of the history. Events written before the manual-contact flow keep their meaning without exposing what is no longer part of it (an order number). */
function describe(e: RequestEvent): string {
  switch (e.action) {
    case "created": return "Solicitação recebida";
    case "replaced": return `Substituída pelo cliente${e.detail ? ` (${e.detail})` : ""}`;
    case "note": return `Observação: ${e.detail ?? ""}`;
    case "product-link": return `Link do produto ${e.detail ?? "alterado"}`;
    case "linked": return "Registro de um vínculo de pedido feito antes da mudança de fluxo (o número não é mais usado)";
    case "status": {
      const [token, ...rest] = (e.detail ?? "").split(": ");
      return `Estado: ${STATUS_LABEL[normalizeStatus(token)]}${rest.length ? ` · ${rest.join(": ")}` : ""}`;
    }
  }
}

/** One request in full. Only an operator of the request's region (or the owner) may open it; anyone else gets a 404, whatever the URL. The contact is shown here and nowhere public. */
export default async function RequestDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const actor = await requireAdmin();
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const record = await platform().requests.get(id);
  if (!record || !canEdit(actor, record.region)) notFound();
  const lines = summaryOf(record.snapshot, record.values);
  const transitions = nextStatuses(record.status);
  const ref = shortRef(record.id);
  const umaPenca = record.snapshot.store === "umapenca";
  const shop = umaPenca ? "loja da Uma Penca" : "loja da INK";
  const published = await platform().files.read();
  const model = published?.docs[record.region]?.customizers?.find((m) => m.id === record.customizerId);
  const mockup = model?.pageMockup ? published?.media[model.pageMockup.assetId] : undefined;
  const contact = record.contact;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/personalizacao/solicitacoes" className="a-link text-[0.875rem]">← Solicitações</Link>
        <h1 className="a-h1 mt-2">Solicitação <code data-testid="request-ref">{ref}</code></h1>
        <p className="mt-2 flex flex-wrap items-center gap-2"><span className="a-badge warn" data-testid="request-status">{STATUS_LABEL[record.status]}</span><span>{record.customizerName}</span><span className="a-muted">modelo v{record.customizerVersion} · {scopeName(record.region)}</span></p>
      </div>
      <Flash ok={sp.ok} err={sp.err} />

      <div className="a-flash ok">
        <p className="font-extrabold">Como esta fila funciona</p>
        <p className="mt-1">Você cria a estampa <strong>manualmente</strong>, fala com o cliente pelo contato abaixo quando ela estiver pronta e o orienta a comprar na {shop}. O CMS acompanha a <strong>solicitação e o contato</strong>: não recebe pedido, pagamento nem envia nada à loja ou ao cliente.</p>
      </div>

      <section className="a-card p-5" aria-labelledby="contato">
        <h2 id="contato" className="a-h2">Contato do cliente</h2>
        {contact ? (
          <>
            <dl className="mt-3 max-w-xl divide-y divide-black/10" data-testid="request-contact">
              <div className="flex justify-between gap-4 py-2"><dt className="a-muted">Nome</dt><dd className="font-bold" data-testid="contact-name">{contact.name}</dd></div>
              <div className="flex justify-between gap-4 py-2"><dt className="a-muted">WhatsApp</dt><dd className="font-bold" data-testid="contact-whatsapp">{contact.whatsapp ?? "não informado"}</dd></div>
              <div className="flex justify-between gap-4 py-2"><dt className="a-muted">E-mail</dt><dd className="font-bold" data-testid="contact-email">{contact.email ?? "não informado"}</dd></div>
              <div className="flex justify-between gap-4 py-2"><dt className="a-muted">Autorização de contato</dt><dd className="font-bold">{when(contact.confirmedAt)} · aviso {contact.noticeVersion || CONTACT_NOTICE_VERSION}</dd></div>
              <div className="flex justify-between gap-4 py-2"><dt className="a-muted">Contato registrado pela equipe</dt><dd className="font-bold">{record.contactedAt ? when(record.contactedAt) : "ainda não"}</dd></div>
            </dl>
            <p className="a-muted mt-2 text-[0.8125rem]">Visível só para quem edita {scopeName(record.region)}. O cliente autorizou o uso deste contato apenas para esta solicitação.</p>
            <ContactActions
              key={record.productLink?.url ?? "no-link"}
              whatsapp={contact.whatsapp}
              email={contact.email}
              reference={ref}
              initialMessage={suggestedMessage({ name: contact.name, modelName: record.customizerName, reference: ref, productLink: record.productLink?.url })}
            />
          </>
        ) : (
          <p className="a-muted mt-2">Esta solicitação é de antes do formulário de contato: não há nome nem canal registrados. Se a equipe já falou com o cliente por outro meio, registre uma observação.</p>
        )}
      </section>

      <section className="a-card p-5" aria-labelledby="dados">
        <h2 id="dados" className="a-h2">O que o cliente pediu</h2>
        <div className="mt-3 grid gap-5 md:grid-cols-[minmax(0,14rem)_1fr]">
          {mockup ? (
            <figure>
              {/* eslint-disable-next-line @next/next/no-img-element -- a CMS upload served pre-sized from the media origin */}
              <img src={mockup.variants?.[0]?.src ?? mockup.src} width={mockup.width} height={mockup.height} alt={`Mockup ilustrativo: ${record.customizerName}`} className="h-auto w-full bg-black/5 object-contain" data-testid="request-mockup" />
              <figcaption className="a-muted mt-1 text-[0.75rem]">Imagem ilustrativa do modelo: o texto do cliente não está desenhado nela.</figcaption>
            </figure>
          ) : <p className="a-muted text-[0.875rem]">O modelo não está publicado agora: sem mockup para mostrar.</p>}
          <div>
            <dl className="max-w-xl divide-y divide-black/10" data-testid="request-values">
              {lines.map((l) => <div key={l.label} className="flex justify-between gap-4 py-2"><dt className="a-muted">{l.label}</dt><dd className="font-bold">{l.value}</dd></div>)}
            </dl>
            <p className="a-muted mt-3 text-[0.8125rem]">Rótulos e limites são os do modelo na versão {record.customizerVersion} (guardados com a solicitação). Enviada em {when(record.createdAt)}; guardada até {new Date(record.expiresAt).toLocaleDateString("pt-BR")} (retenção).</p>
          </div>
        </div>
      </section>

      <section className="a-card p-5" aria-labelledby="produto">
        <h2 id="produto" className="a-h2">Link do produto pronto para compra</h2>
        <p className="a-muted mt-1 max-w-3xl text-[0.875rem]">Opcional. Depois de preparar a estampa e o produto na {umaPenca ? "loja da Uma Penca" : `loja INK de ${scopeName(record.region)}`}, cole aqui o endereço da página. Ele entra na mensagem sugerida. É uma <strong>orientação de compra</strong>, não um vínculo com pedido: nada é verificado na loja. {umaPenca ? "Só aceitamos https da loja da Uma Penca (artigos.useorigens.com.br), porque este modelo é da Uma Penca." : "Só aceitamos https da loja desta região."}</p>
        <form action={setRequestProductLinkAction} className="mt-3 flex flex-wrap items-end gap-3">
          <input type="hidden" name="id" value={record.id} />
          <div className="grow"><label className="a-label" htmlFor="product_link">Endereço da página do produto</label><input id="product_link" name="product_link" type="url" defaultValue={record.productLink?.url ?? ""} className="a-input" maxLength={500} placeholder={umaPenca ? "https://artigos.useorigens.com.br/caneca/…" : "https://www.usesul.com.br/usesul/product/…"} /></div>
          <button type="submit" className="a-btn ghost">{record.productLink ? "Atualizar link" : "Salvar link"}</button>
        </form>
        {record.productLink && <p className="a-muted mt-2 text-[0.8125rem]" data-testid="product-link-saved">Salvo por {record.productLink.setBy} em {when(record.productLink.setAt)}. Deixe o campo vazio e salve para remover.</p>}
      </section>

      {transitions.length > 0 && (
        <section className="a-card p-5" aria-labelledby="estado">
          <h2 id="estado" className="a-h2">Andamento da estampa</h2>
          <p className="a-muted mt-1 text-[0.875rem]">Recebida → Em criação → Arte pronta → Cliente contatado. <strong>Encerrada</strong> e <strong>Cancelada</strong> são fechamentos administrativos: não dizem nada sobre compra ou pagamento.</p>
          <form action={setRequestStatusAction} className="mt-3 space-y-3">
            <input type="hidden" name="id" value={record.id} />
            <div className="flex flex-wrap items-end gap-3">
              <div><label className="a-label" htmlFor="status">Novo estado</label><select id="status" name="status" className="a-select">{transitions.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</select></div>
              <div className="grow"><label className="a-label" htmlFor="note">Observação interna (opcional)</label><input id="note" name="note" className="a-input" maxLength={200} /></div>
              <button type="submit" className="a-btn">Atualizar estado</button>
            </div>
            <label className="flex items-start gap-2"><input type="checkbox" name="confirm" className="mt-1" data-testid="confirm-contacted" /> <span>Para <strong>Cliente contatado</strong>: confirmo que eu mesmo(a) falei com o cliente pelo WhatsApp ou e-mail informado.</span></label>
          </form>
        </section>
      )}

      <section className="a-card p-5" aria-labelledby="nota">
        <h2 id="nota" className="a-h2">Observação interna</h2>
        <form action={addRequestNoteAction} className="mt-3 flex flex-wrap items-end gap-3">
          <input type="hidden" name="id" value={record.id} />
          <div className="grow"><label className="a-label" htmlFor="note-only">O que foi combinado com o cliente</label><input id="note-only" name="note" className="a-input" maxLength={500} placeholder="Ex.: pedi a grafia correta da cidade" /></div>
          <button type="submit" className="a-btn ghost">Registrar observação</button>
        </form>
      </section>

      <section className="a-card p-5" aria-labelledby="historico">
        <h2 id="historico" className="a-h2">Histórico</h2>
        <ol className="mt-3 space-y-1 text-[0.9375rem]" data-testid="request-history">{record.events.map((e, i) => <li key={i}><span className="a-muted">{when(e.at)}</span> · {e.actor} · {describe(e)}</li>)}</ol>
      </section>
    </div>
  );
}
