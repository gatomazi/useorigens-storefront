import Link from "next/link";
import { Flash } from "@/components/admin/Flash";
import { setPartnerStatusAction } from "@/app/admin/partner-actions";
import { requireAdmin } from "@/lib/admin/auth/guard";
import { editableScopes, scopeName } from "@/lib/admin/scope";
import { mailtoUrl, whatsappUrl } from "@/lib/customization/contact";
import { numberPt } from "@/lib/format";
import { isPartnerProfile, isPartnerStatus, PARTNER_PROFILES, PARTNER_RETENTION_DAYS, PARTNER_STATUSES, partnerGreeting, PROFILE_LABEL, STATUS_LABEL, type PartnerApplication } from "@/lib/partners/application";
import { partnerStoreOrNull } from "@/lib/partners/server";

const LIMIT = 200;
const DAY = 86_400_000;
/** The instant of this request (the retention is counted back from it). */
const requestTime = (): number => Date.now();
const STATUS_BADGE: Record<PartnerApplication["status"], string> = { new: "warn", talking: "", partner: "ok", declined: "" };

const when = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
/** "+5548999990000" as "(48) 99999-0000"; other countries as typed. */
const phone = (n: string) => {
  const m = /^\+55(\d{2})(\d{4,5})(\d{4})$/.exec(n);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : n;
};

/**
 * Applications from the "Seja parceiro" page (db/migrations/0010_partner_applications), newest first, from every region this person may edit. The
 * team reads them here and answers on WhatsApp ("Chamar no WhatsApp" opens the chat with a greeting to edit; nothing is sent by the panel), then
 * moves the status. Applications older than PARTNER_RETENTION_DAYS go when the page opens, except agreed partnerships.
 */
export default async function PartnersPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string; s?: string; p?: string }> }) {
  const actor = await requireAdmin();
  const sp = await searchParams;
  const regions = editableScopes(actor);
  const status = isPartnerStatus(sp.s) ? sp.s : undefined;
  const profile = isPartnerProfile(sp.p) ? sp.p : undefined;
  const store = partnerStoreOrNull();
  let rows: PartnerApplication[] = [];
  let total = 0;
  let fresh = 0;
  let unavailable: "no-store" | "no-table" | null = store ? null : "no-store";
  if (store) {
    await store.purgeBefore(new Date(requestTime() - PARTNER_RETENTION_DAYS * DAY)).catch(() => 0);
    try {
      [{ rows, total }, fresh] = await Promise.all([store.list({ regions, status, profile }, LIMIT), store.countNew(regions)]);
    } catch {
      unavailable = "no-table";
    }
  }
  const from = new URLSearchParams({ ...(status ? { s: status } : {}), ...(profile ? { p: profile } : {}) }).toString();
  const filterHref = (next: { s?: string; p?: string }) => {
    const q = new URLSearchParams({ ...(status ? { s: status } : {}), ...(profile ? { p: profile } : {}), ...next });
    for (const [k, v] of [...q]) if (!v) q.delete(k);
    return `/admin/parceiros${q.size ? `?${q}` : ""}`;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="a-h1">Parceiros</h1>
        <p className="a-muted mt-2 max-w-3xl">
          Inscrições feitas na página <strong>Seja parceiro</strong> do site (embaixador, artista e collab). Chame a pessoa no WhatsApp, combine tudo por escrito e mude o estado aqui
          para a equipe saber em que pé está. As inscrições ficam guardadas por {PARTNER_RETENTION_DAYS} dias; as parcerias fechadas ficam até alguém mudar o estado.
        </p>
        <p className="mt-3" data-testid="partners-new-count">
          <span className={`a-badge ${fresh > 0 ? "warn" : "ok"}`}>{fresh} nova(s)</span> <span className="a-muted text-[0.875rem]">esperando a primeira conversa</span>
        </p>
      </div>
      <Flash ok={sp.ok} err={sp.err} />

      {unavailable && (
        <p className="a-flash err" role="status" data-testid="partners-unavailable">
          {unavailable === "no-table"
            ? "As inscrições ainda não estão sendo guardadas neste ambiente: falta aplicar a migração 0010 do banco (npm run db:migrate no serviço). Enquanto isso, o formulário do site responde que não foi possível enviar."
            : "Este ambiente não tem o banco do painel: as inscrições não são guardadas aqui."}
        </p>
      )}

      <nav className="flex flex-wrap items-center gap-2" aria-label="Filtrar por estado">
        <span className="a-label mb-0">Estado</span>
        <Link href={filterHref({ s: "" })} className={`a-btn sm ${status ? "ghost" : ""}`} aria-current={status ? undefined : "page"}>Todos</Link>
        {PARTNER_STATUSES.map((s) => (
          <Link key={s} href={filterHref({ s })} className={`a-btn sm ${status === s ? "" : "ghost"}`} aria-current={status === s ? "page" : undefined}>{STATUS_LABEL[s]}</Link>
        ))}
      </nav>
      <nav className="flex flex-wrap items-center gap-2" aria-label="Filtrar por perfil">
        <span className="a-label mb-0">Perfil</span>
        <Link href={filterHref({ p: "" })} className={`a-btn sm ${profile ? "ghost" : ""}`} aria-current={profile ? undefined : "page"}>Todos</Link>
        {PARTNER_PROFILES.map((p) => (
          <Link key={p} href={filterHref({ p })} className={`a-btn sm ${profile === p ? "" : "ghost"}`} aria-current={profile === p ? "page" : undefined}>{PROFILE_LABEL[p]}</Link>
        ))}
      </nav>

      <section className="a-card overflow-x-auto" aria-label="Inscrições">
        <table className="a-table a-stack">
          <caption className="sr-only">Inscrições de parceiros</caption>
          <thead>
            <tr><th scope="col">Pessoa</th><th scope="col">Perfil</th><th scope="col">Contato</th><th scope="col">Instagram</th><th scope="col">Mensagem</th><th scope="col">Recebida</th><th scope="col">Estado</th></tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={7} className="a-muted">{unavailable ? "—" : total === 0 && !status && !profile ? "Nenhuma inscrição ainda." : "Nenhuma inscrição com esses filtros."}</td></tr>
            )}
            {rows.map((a) => (
              <tr key={a.id} data-testid={`partner-row-${a.id.slice(-8)}`}>
                <td data-label="Pessoa">
                  <strong>{a.name}</strong>
                  <span className="a-muted block text-[0.8125rem]">{a.city}{regions.length > 1 ? ` · site ${scopeName(a.region)}` : ""}</span>
                </td>
                <td data-label="Perfil"><span className="a-badge">{PROFILE_LABEL[a.profile]}</span></td>
                <td data-label="Contato">
                  <a className="a-link font-semibold" href={whatsappUrl(a.whatsapp, partnerGreeting(a))} target="_blank" rel="noreferrer">{phone(a.whatsapp)}</a>
                  <span className="a-muted block text-[0.75rem]">abre o WhatsApp com uma saudação</span>
                  {a.email && <a className="a-link block text-[0.875rem] [overflow-wrap:anywhere]" href={mailtoUrl(a.email, "Programa de parceiros da Use Origens", partnerGreeting(a))}>{a.email}</a>}
                </td>
                <td data-label="Instagram">
                  {a.instagram ? <a className="a-link" href={`https://www.instagram.com/${a.instagram}/`} target="_blank" rel="noreferrer">@{a.instagram}</a> : <span className="a-muted">—</span>}
                  {a.followers !== null && <span className="a-muted block text-[0.8125rem] tabular-nums">{numberPt.format(a.followers)} seguidores</span>}
                </td>
                <td data-label="Mensagem" className="max-w-[22rem]">
                  {a.message ? (
                    a.message.length > 140 ? (
                      <details>
                        <summary className="cursor-pointer">{a.message.slice(0, 140).trimEnd()}…</summary>
                        <p className="mt-1 whitespace-pre-line">{a.message}</p>
                      </details>
                    ) : (
                      <p className="whitespace-pre-line">{a.message}</p>
                    )
                  ) : (
                    <span className="a-muted">—</span>
                  )}
                </td>
                <td data-label="Recebida" className="tabular-nums">{when(a.createdAt)}</td>
                <td data-label="Estado">
                  <form action={setPartnerStatusAction} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="id" value={a.id} />
                    <input type="hidden" name="from" value={from} />
                    <span className={`a-badge ${STATUS_BADGE[a.status]}`}>{STATUS_LABEL[a.status]}</span>
                    <label className="sr-only" htmlFor={`st-${a.id}`}>Novo estado de {a.name}</label>
                    <select id={`st-${a.id}`} name="status" className="a-select w-auto" defaultValue={a.status}>
                      {PARTNER_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                    </select>
                    <button type="submit" className="a-btn sm ghost">Salvar</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {total > rows.length && <p className="a-muted p-4 text-[0.875rem]">Mostrando as {rows.length} mais recentes de {total}. Use os filtros para achar as outras.</p>}
      </section>
    </div>
  );
}
