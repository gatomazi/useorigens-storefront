import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth/guard";
import { editableScopes, scopeName } from "@/lib/admin/scope";
import { PRODUCT_STATUS_LABEL, PRODUCT_STATUSES, safeInkUrl, type ProductJob, type ProductStatus } from "@/lib/customization/ink-products";
import { missingProductTable, productStoreOrNull } from "@/lib/customization/products-server";

const LIMIT = 300;
const BADGE: Record<ProductStatus, string> = { queued: "", creating: "", photos: "", ready: "ok", failed: "err", check: "warn" };
const when = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
const isStatus = (v: unknown): v is ProductStatus => typeof v === "string" && (PRODUCT_STATUSES as readonly string[]).includes(v);

/**
 * Every product the direct purchase created at INK (db/migrations/0011), newest first. INK has no DELETE and the products are hidden but sold by
 * link, so this is where the owner finds one (an offensive name that slipped through, a duplicate) to hide or fix in the INK panel.
 */
export default async function CreatedProductsPage({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  const actor = await requireAdmin();
  const sp = await searchParams;
  const status = isStatus(sp.s) ? sp.s : undefined;
  const regions = editableScopes(actor);
  const store = productStoreOrNull();
  let rows: ProductJob[] = [];
  let total = 0;
  let unavailable: "no-store" | "no-table" | null = store ? null : "no-store";
  if (store) {
    try {
      ({ rows, total } = await store.list({ ...(regions.length === 1 ? { region: regions[0] } : {}), ...(status ? { status } : {}) }, LIMIT, 0));
      rows = rows.filter((r) => regions.includes(r.region));
    } catch (e) {
      unavailable = missingProductTable(e) ? "no-table" : "no-store";
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="a-muted text-[0.875rem]"><Link className="a-link" href="/admin/personalizacao">← Personalização</Link></p>
        <h1 className="a-h1 mt-2">Produtos criados na INK</h1>
        <p className="a-muted mt-2 max-w-3xl">
          Os produtos que a <strong>compra direta</strong> criou: um por nome e arte, <strong>ocultos</strong> na loja e vendidos pelo link. A INK não apaga produtos; para tirar um do ar,
          oculte ou edite no painel da INK pelo número. <strong>Conferir na INK</strong> quer dizer que a INK pode ter criado o produto sem confirmar: procure pelo nome antes de qualquer coisa.
        </p>
      </div>

      {unavailable && (
        <p className="a-flash err" role="status">
          {unavailable === "no-table" ? "Falta aplicar a migração 0011 do banco (npm run db:migrate no serviço). Enquanto isso, a página de personalização usa a solicitação para a equipe." : "Este ambiente não tem o banco do painel."}
        </p>
      )}

      <nav className="flex flex-wrap items-center gap-2" aria-label="Filtrar por estado">
        <span className="a-label mb-0">Estado</span>
        <Link href="/admin/personalizacao/produtos" className={`a-btn sm ${status ? "ghost" : ""}`} aria-current={status ? undefined : "page"}>Todos</Link>
        {PRODUCT_STATUSES.map((s) => (
          <Link key={s} href={`/admin/personalizacao/produtos?s=${s}`} className={`a-btn sm ${status === s ? "" : "ghost"}`} aria-current={status === s ? "page" : undefined}>{PRODUCT_STATUS_LABEL[s]}</Link>
        ))}
        <span className="a-muted text-[0.875rem]">{total} no total</span>
      </nav>

      <section className="a-card overflow-x-auto" aria-label="Produtos criados">
        <table className="a-table a-stack">
          <caption className="sr-only">Produtos criados na INK pela compra direta</caption>
          <thead><tr><th scope="col">Nome</th><th scope="col">Arte</th><th scope="col">Estado</th><th scope="col">Na INK</th><th scope="col">Criado</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={5} className="a-muted">{unavailable ? "—" : "Nenhum produto ainda."}</td></tr>}
            {rows.map((p) => {
              const url = safeInkUrl(p.inkUrl);
              return (
                <tr key={p.id} data-testid={`product-row-${p.id.slice(-8)}`}>
                  <td data-label="Nome"><strong>{Object.values(p.fields).join(" ")}</strong><span className="a-muted block text-[0.8125rem]">{p.name}</span></td>
                  <td data-label="Arte">{p.artLabel}<span className="a-muted block text-[0.8125rem]">{p.garment === "infantil" ? "Camiseta Infantil" : "Camiseta"} · R$ {p.price.replace(".", ",")}{regions.length > 1 ? ` · ${scopeName(p.region)}` : ""}</span></td>
                  <td data-label="Estado"><span className={`a-badge ${BADGE[p.status]}`}>{PRODUCT_STATUS_LABEL[p.status]}</span>{p.error && <span className="a-muted block max-w-[22rem] text-[0.8125rem] [overflow-wrap:anywhere]">{p.error}</span>}</td>
                  <td data-label="Na INK">{p.inkProductId ? <span className="tabular-nums">nº {p.inkProductId}</span> : <span className="a-muted">—</span>}{url && <a className="a-link block" href={url} target="_blank" rel="noreferrer">Abrir na loja</a>}</td>
                  <td data-label="Criado" className="tabular-nums">{when(p.createdAt)}{p.readyAt && <span className="a-muted block text-[0.8125rem]">pronto {when(p.readyAt)}</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
