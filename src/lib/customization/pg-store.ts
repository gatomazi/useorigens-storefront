import type { Db, Queryable } from "../admin/db/db";
import { sqlState } from "../admin/db/db";
import { ulid } from "../admin/ids";
import type { RegionSlug } from "../geo/regions";
import { nextStatuses, normalizeStatus, OPEN_STATUSES, type RequestContact, type RequestEvent, type RequestFilter, type RequestRecord, type RequestStatus, type RequestStore } from "./requests";
import { summaryOf, type ModelSnapshot, type Values } from "./validate";

type Row = {
  id: string; token_hash: string; region: RegionSlug; customizer_id: string; customizer_slug: string; customizer_name: string; customizer_version: number;
  snapshot: ModelSnapshot; request_values: Values; status: string; idempotency_key: string; created_at: unknown; updated_at: unknown; expires_at: unknown;
  customer_name: string | null; customer_whatsapp: string | null; customer_email: string | null; contact_confirmed_at: unknown; contact_notice_version: string | null;
  contacted_at: unknown; product_link: string | null; product_link_by: string | null; product_link_at: unknown;
};
const iso = (v: unknown): string => (v instanceof Date ? v.toISOString() : new Date(String(v)).toISOString());
// The legacy order columns (order_store, order_number, order_linked_*) stay in the table for history but are never read or written by the product.
const COLUMNS = `id, token_hash, region, customizer_id, customizer_slug, customizer_name, customizer_version, snapshot, request_values, status, idempotency_key, created_at, updated_at, expires_at,
  customer_name, customer_whatsapp, customer_email, contact_confirmed_at, contact_notice_version, contacted_at, product_link, product_link_by, product_link_at`;

const toRecord = (r: Row, events: RequestEvent[]): RequestRecord => {
  const contact: RequestContact | null = r.customer_name
    ? { name: r.customer_name, ...(r.customer_whatsapp ? { whatsapp: r.customer_whatsapp } : {}), ...(r.customer_email ? { email: r.customer_email } : {}), confirmedAt: iso(r.contact_confirmed_at), noticeVersion: r.contact_notice_version ?? "" }
    : null;
  return {
    id: r.id, tokenHash: r.token_hash, region: r.region, customizerId: r.customizer_id, customizerSlug: r.customizer_slug, customizerName: r.customizer_name, customizerVersion: r.customizer_version,
    snapshot: r.snapshot, values: r.request_values, status: normalizeStatus(r.status), contact, contactedAt: r.contacted_at ? iso(r.contacted_at) : null,
    productLink: r.product_link ? { url: r.product_link, setBy: r.product_link_by ?? "", setAt: iso(r.product_link_at) } : null,
    idempotencyKey: r.idempotency_key, createdAt: iso(r.created_at), updatedAt: iso(r.updated_at), expiresAt: iso(r.expires_at), events,
  };
};

/** The Postgres store of personalization requests (tables `customization_request*`, migrations 0004 + 0005). All SQL is parameterised; nothing typed by a customer is ever concatenated. */
export function pgRequestStore(db: Db): RequestStore {
  const eventsOf = async (id: string, q: Queryable = db): Promise<RequestEvent[]> =>
    (await q.query<{ at: unknown; actor: string; action: RequestEvent["action"]; detail: string | null }>(`select at, actor, action, detail from customization_request_event where request_id = $1 order by id`, [id])).rows.map((e) => ({ at: iso(e.at), actor: e.actor, action: e.action, ...(e.detail ? { detail: e.detail } : {}) }));
  const load = async (where: string, params: unknown[], q: Queryable = db): Promise<RequestRecord | null> => {
    const r = await q.query<Row>(`select ${COLUMNS} from customization_request where ${where}`, params);
    return r.rows[0] ? toRecord(r.rows[0], await eventsOf(r.rows[0].id, q)) : null;
  };
  const event = (q: Queryable, id: string, actor: string, action: RequestEvent["action"], detail: string | null) =>
    q.query(`insert into customization_request_event (request_id, actor, action, detail) values ($1,$2,$3,$4)`, [id, actor, action, detail]);
  /** Runs `apply` on the locked row and returns the reloaded record (or the reason). */
  const change = (id: string, apply: (q: Queryable, current: { status: RequestStatus; region: RegionSlug }) => Promise<string | null>) =>
    db.tx(async (q) => {
      const cur = await q.query<{ status: string; region: RegionSlug }>(`select status, region from customization_request where id = $1 for update`, [id]);
      if (!cur.rows[0]) return { ok: false as const, error: "solicitação não encontrada" };
      const error = await apply(q, { status: normalizeStatus(cur.rows[0].status), region: cur.rows[0].region });
      if (error) return { ok: false as const, error };
      await q.query(`update customization_request set updated_at = now() where id = $1`, [id]);
      return { ok: true as const, record: (await load(`id = $1`, [id], q))! };
    });
  return {
    async create(input) {
      const c = input.contact;
      try {
        return await db.tx(async (q) => {
          const id = ulid();
          const inserted = await q.query<Row>(
            `insert into customization_request (id, token_hash, region, customizer_id, customizer_slug, customizer_name, customizer_version, snapshot, request_values, idempotency_key, expires_at,
               customer_name, customer_whatsapp, customer_email, contact_confirmed_at, contact_notice_version)
             values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10,$11,$12,$13,$14,$15,$16)
             on conflict (region, idempotency_key) do nothing returning ${COLUMNS}`,
            [id, input.tokenHash, input.region, input.snapshot.id, input.snapshot.slug, input.snapshot.name, input.snapshot.version, JSON.stringify(input.snapshot), JSON.stringify(input.values), input.idempotencyKey, input.expiresAt,
              c.name, c.whatsapp ?? null, c.email ?? null, c.confirmedAt, c.noticeVersion],
          );
          if (!inserted.rows[0]) {
            const existing = await q.query<Row>(`select ${COLUMNS} from customization_request where region = $1 and idempotency_key = $2`, [input.region, input.idempotencyKey]);
            return { record: toRecord(existing.rows[0], []), duplicate: true };
          }
          await event(q, id, "customer", "created", null);
          if (input.replacesTokenHash) {
            const old = await q.query<{ id: string }>(`update customization_request set status = 'cancelled', updated_at = now() where token_hash = $1 and region = $2 and status = 'received' returning id`, [input.replacesTokenHash, input.region]);
            if (old.rows[0]) await event(q, old.rows[0].id, "customer", "replaced", `substituída por ${id.slice(-8)}`);
          }
          return { record: toRecord(inserted.rows[0], [{ at: iso(inserted.rows[0].created_at), actor: "customer", action: "created" }]), duplicate: false };
        });
      } catch (error) {
        // Two identical submissions racing past the ON CONFLICT: the loser reads the winner.
        if (sqlState(error) === "23505") {
          const existing = await load(`region = $1 and idempotency_key = $2`, [input.region, input.idempotencyKey]);
          if (existing) return { record: existing, duplicate: true };
        }
        throw error;
      }
    },
    get: (id) => (/^[0-9A-HJKMNP-TV-Z]{26}$/.test(id) ? load(`id = $1`, [id]) : Promise.resolve(null)),
    findByTokenHash: (hash) => load(`token_hash = $1`, [hash]),
    async list(f: RequestFilter, limit, offset) {
      const where: string[] = [];
      const params: unknown[] = [];
      const add = (sql: string, v: unknown) => { params.push(v); where.push(sql.replaceAll("?", `$${params.length}`)); };
      if (f.region) add("region = ?", f.region);
      if (f.status) add("status = ?", f.status); // migration 0005 renamed the legacy statuses in place
      if (f.customizerId) add("customizer_id = ?", f.customizerId);
      if (f.q) add("(id ilike ? or customer_name ilike ? or customizer_name ilike ? or request_values::text ilike ?)", `%${f.q.replace(/[%_\\]/g, "\\$&")}%`);
      const w = where.length ? `where ${where.join(" and ")}` : "";
      const total = Number((await db.query<{ n: string }>(`select count(*)::text as n from customization_request ${w}`, params)).rows[0].n);
      const rows = await db.query<Row>(`select ${COLUMNS} from customization_request ${w} order by created_at desc, id desc limit ${Math.max(1, Math.min(200, limit))} offset ${Math.max(0, offset)}`, params);
      return { rows: rows.rows.map((r) => toRecord(r, [])), total };
    },
    async count(regions) {
      if (regions.length === 0) return 0;
      const r = await db.query<{ n: string }>(`select count(*)::text as n from customization_request where region = any($1::text[])`, [[...regions]]);
      return Number(r.rows[0].n);
    },
    async countOpen(regions) {
      if (regions.length === 0) return 0;
      const r = await db.query<{ n: string }>(`select count(*)::text as n from customization_request where region = any($1::text[]) and status = any($2::text[])`, [[...regions], [...OPEN_STATUSES]]);
      return Number(r.rows[0].n);
    },
    setStatus: (id, to, actor, note) =>
      change(id, async (q, cur) => {
        if (!nextStatuses(cur.status).includes(to)) return `não é possível passar de "${cur.status}" para "${to}"`;
        await q.query(`update customization_request set status = $2, contacted_at = case when $2 = 'customerContacted' then now() else contacted_at end where id = $1`, [id, to]);
        await event(q, id, actor, "status", `${to}${note ? `: ${note.slice(0, 200)}` : ""}`);
        return null;
      }),
    addNote: (id, actor, note) =>
      change(id, async (q) => {
        if (note.trim() === "") return "escreva a observação";
        await event(q, id, actor, "note", note.trim().slice(0, 500));
        return null;
      }),
    setProductLink: (id, url, actor) =>
      change(id, async (q) => {
        await q.query(`update customization_request set product_link = $2, product_link_by = $3, product_link_at = case when $2::text is null then null else now() end where id = $1`, [id, url, url ? actor : null]);
        await event(q, id, actor, "product-link", url ? "definido" : "removido");
        return null;
      }),
    async purgeExpired(now) {
      // Being made, or ready and not yet told to the customer: kept whatever the age.
      const r = await db.query(`delete from customization_request where expires_at < $1 and status not in ('inCreation', 'artReady')`, [now.toISOString()]);
      return r.rowCount;
    },
  };
}

export { summaryOf };
