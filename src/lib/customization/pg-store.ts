import type { Db, Queryable } from "../admin/db/db";
import { sqlState } from "../admin/db/db";
import { ulid } from "../admin/ids";
import { REGIONS, type CommerceStoreKey, type RegionSlug } from "../geo/regions";
import { canLinkOrder, nextStatuses, ORDER_NUMBER, type RequestEvent, type RequestFilter, type RequestRecord, type RequestStatus, type RequestStore } from "./requests";
import { summaryOf, type ModelSnapshot, type Values } from "./validate";

type Row = {
  id: string; token_hash: string; region: RegionSlug; customizer_id: string; customizer_slug: string; customizer_name: string; customizer_version: number;
  snapshot: ModelSnapshot; request_values: Values; status: RequestStatus; order_store: CommerceStoreKey | null; order_number: string | null; order_linked_by: string | null;
  order_linked_at: unknown; idempotency_key: string; created_at: unknown; updated_at: unknown; expires_at: unknown;
};
const iso = (v: unknown): string => (v instanceof Date ? v.toISOString() : new Date(String(v)).toISOString());
const COLUMNS = `id, token_hash, region, customizer_id, customizer_slug, customizer_name, customizer_version, snapshot, request_values, status, order_store, order_number, order_linked_by, order_linked_at, idempotency_key, created_at, updated_at, expires_at`;

const toRecord = (r: Row, events: RequestEvent[]): RequestRecord => ({
  id: r.id, tokenHash: r.token_hash, region: r.region, customizerId: r.customizer_id, customizerSlug: r.customizer_slug, customizerName: r.customizer_name, customizerVersion: r.customizer_version,
  snapshot: r.snapshot, values: r.request_values, status: r.status,
  order: r.order_number && r.order_store ? { store: r.order_store, number: r.order_number, linkedBy: r.order_linked_by ?? "", linkedAt: iso(r.order_linked_at) } : null,
  idempotencyKey: r.idempotency_key, createdAt: iso(r.created_at), updatedAt: iso(r.updated_at), expiresAt: iso(r.expires_at), events,
});

/** The Postgres store of personalization requests (table `customization_request`, migration 0004). All SQL is parameterised; nothing typed by a customer is ever concatenated. */
export function pgRequestStore(db: Db): RequestStore {
  const eventsOf = async (id: string, q: Queryable = db): Promise<RequestEvent[]> =>
    (await q.query<{ at: unknown; actor: string; action: RequestEvent["action"]; detail: string | null }>(`select at, actor, action, detail from customization_request_event where request_id = $1 order by id`, [id])).rows.map((e) => ({ at: iso(e.at), actor: e.actor, action: e.action, ...(e.detail ? { detail: e.detail } : {}) }));
  const load = async (where: string, params: unknown[], q: Queryable = db): Promise<RequestRecord | null> => {
    const r = await q.query<Row>(`select ${COLUMNS} from customization_request where ${where}`, params);
    return r.rows[0] ? toRecord(r.rows[0], await eventsOf(r.rows[0].id, q)) : null;
  };
  return {
    async create(input) {
      try {
        return await db.tx(async (q) => {
          const id = ulid();
          const inserted = await q.query<Row>(
            `insert into customization_request (id, token_hash, region, customizer_id, customizer_slug, customizer_name, customizer_version, snapshot, request_values, idempotency_key, expires_at)
             values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10,$11)
             on conflict (region, idempotency_key) do nothing returning ${COLUMNS}`,
            [id, input.tokenHash, input.region, input.snapshot.id, input.snapshot.slug, input.snapshot.name, input.snapshot.version, JSON.stringify(input.snapshot), JSON.stringify(input.values), input.idempotencyKey, input.expiresAt],
          );
          if (!inserted.rows[0]) {
            const existing = await q.query<Row>(`select ${COLUMNS} from customization_request where region = $1 and idempotency_key = $2`, [input.region, input.idempotencyKey]);
            return { record: toRecord(existing.rows[0], []), duplicate: true };
          }
          await q.query(`insert into customization_request_event (request_id, actor, action) values ($1, 'customer', 'created')`, [id]);
          if (input.replacesTokenHash) {
            const old = await q.query<{ id: string }>(`update customization_request set status = 'cancelled', updated_at = now() where token_hash = $1 and region = $2 and status = 'submitted' returning id`, [input.replacesTokenHash, input.region]);
            if (old.rows[0]) await q.query(`insert into customization_request_event (request_id, actor, action, detail) values ($1, 'customer', 'replaced', $2)`, [old.rows[0].id, `substituída por ${id.slice(-8)}`]);
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
      if (f.status) add("status = ?", f.status);
      if (f.customizerId) add("customizer_id = ?", f.customizerId);
      if (f.q) add("(id ilike ? or order_number ilike ? or customizer_name ilike ? or request_values::text ilike ?)", `%${f.q.replace(/[%_\\]/g, "\\$&")}%`);
      const w = where.length ? `where ${where.join(" and ")}` : "";
      const total = Number((await db.query<{ n: string }>(`select count(*)::text as n from customization_request ${w}`, params)).rows[0].n);
      const rows = await db.query<Row>(`select ${COLUMNS} from customization_request ${w} order by created_at desc, id desc limit ${Math.max(1, Math.min(200, limit))} offset ${Math.max(0, offset)}`, params);
      return { rows: rows.rows.map((r) => toRecord(r, [])), total };
    },
    async setStatus(id, to, actor, note) {
      return db.tx(async (q) => {
        const cur = await q.query<{ status: RequestStatus }>(`select status from customization_request where id = $1 for update`, [id]);
        if (!cur.rows[0]) return { ok: false as const, error: "solicitação não encontrada" };
        if (!nextStatuses(cur.rows[0].status).includes(to)) return { ok: false as const, error: `não é possível passar de "${cur.rows[0].status}" para "${to}"` };
        await q.query(`update customization_request set status = $2, updated_at = now() where id = $1`, [id, to]);
        await q.query(`insert into customization_request_event (request_id, actor, action, detail) values ($1,$2,'status',$3)`, [id, actor, `${to}${note ? `: ${note.slice(0, 200)}` : ""}`]);
        return { ok: true as const, record: (await load(`id = $1`, [id], q))! };
      });
    },
    async linkOrder(id, order, actor) {
      if (!ORDER_NUMBER.test(order.number)) return { ok: false as const, error: "número de pedido inválido (3 a 40 letras, números ou hífen)" };
      try {
        return await db.tx(async (q) => {
          const cur = await q.query<{ status: RequestStatus; region: RegionSlug }>(`select status, region from customization_request where id = $1 for update`, [id]);
          if (!cur.rows[0]) return { ok: false as const, error: "solicitação não encontrada" };
          if (!canLinkOrder(cur.rows[0].status)) return { ok: false as const, error: "esta solicitação não pode receber um pedido no estado atual" };
          if (order.store !== REGIONS[cur.rows[0].region].storeKey) return { ok: false as const, error: "o pedido precisa ser da loja INK desta região" };
          await q.query(`update customization_request set order_store = $2, order_number = $3, order_linked_by = $4, order_linked_at = now(), status = 'linkedToInkOrder', updated_at = now() where id = $1`, [id, order.store, order.number, actor]);
          await q.query(`insert into customization_request_event (request_id, actor, action, detail) values ($1,$2,'linked',$3)`, [id, actor, order.number]);
          return { ok: true as const, record: (await load(`id = $1`, [id], q))! };
        });
      } catch (error) {
        if (sqlState(error) === "23505") return { ok: false as const, error: "este pedido já está vinculado a outra solicitação" };
        throw error;
      }
    },
    async purgeExpired(now) {
      const r = await db.query(`delete from customization_request where expires_at < $1 and status in ('submitted', 'fulfilled', 'cancelled')`, [now.toISOString()]);
      return r.rowCount;
    },
  };
}

export { summaryOf };
