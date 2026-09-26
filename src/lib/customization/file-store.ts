import "server-only";
import path from "node:path";
import { adminDevDir, readJson, withLock } from "../admin/local-store";
import { ulid } from "../admin/ids";
import { writeJsonAtomic } from "../admin/local-store";
import { canLinkOrder, nextStatuses, ORDER_NUMBER, type RequestFilter, type RequestRecord, type RequestStatus, type RequestStore } from "./requests";
import { REGIONS, type CommerceStoreKey } from "../geo/regions";
import { summaryOf } from "./validate";

/** The local sandbox stand-in for the Postgres request table (`data/admin-dev/requests.json`, gitignored). Same interface, same rules. */
export function fileRequestStore(file: string = path.join(adminDevDir(), "requests.json")): RequestStore {
  type Db = { requests: RequestRecord[] };
  const read = async (): Promise<Db> => (await readJson<Db>(file)) ?? { requests: [] };
  const write = (db: Db) => writeJsonAtomic(file, db);
  const now = () => new Date().toISOString();
  const matches = (r: RequestRecord, f: RequestFilter): boolean => {
    if (f.region && r.region !== f.region) return false;
    if (f.status && r.status !== f.status) return false;
    if (f.customizerId && r.customizerId !== f.customizerId) return false;
    if (f.q) {
      const q = f.q.toLowerCase();
      const hay = [r.id, r.order?.number ?? "", r.customizerName, ...summaryOf(r.snapshot, r.values).map((s) => s.value)].join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  };
  return {
    create: (input) =>
      withLock(async () => {
        const db = await read();
        const existing = db.requests.find((r) => r.region === input.region && r.idempotencyKey === input.idempotencyKey);
        if (existing) return { record: existing, duplicate: true };
        const at = now();
        const record: RequestRecord = {
          id: ulid(), tokenHash: input.tokenHash, region: input.region, customizerId: input.snapshot.id, customizerSlug: input.snapshot.slug, customizerName: input.snapshot.name,
          customizerVersion: input.snapshot.version, snapshot: input.snapshot, values: input.values, status: "submitted", order: null, idempotencyKey: input.idempotencyKey,
          createdAt: at, updatedAt: at, expiresAt: input.expiresAt, events: [{ at, actor: "customer", action: "created" }],
        };
        if (input.replacesTokenHash) {
          const old = db.requests.find((r) => r.tokenHash === input.replacesTokenHash && r.region === input.region && r.status === "submitted");
          if (old) {
            old.status = "cancelled";
            old.updatedAt = at;
            old.events.push({ at, actor: "customer", action: "replaced", detail: `substituída por ${record.id.slice(-8)}` });
          }
        }
        db.requests.push(record);
        await write(db);
        return { record, duplicate: false };
      }),
    async get(id) {
      return (await read()).requests.find((r) => r.id === id) ?? null;
    },
    async findByTokenHash(hash) {
      return (await read()).requests.find((r) => r.tokenHash === hash) ?? null;
    },
    async list(filter, limit, offset) {
      const all = (await read()).requests.filter((r) => matches(r, filter)).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      return { rows: all.slice(offset, offset + limit), total: all.length };
    },
    setStatus: (id, to: RequestStatus, actor, note) =>
      withLock(async () => {
        const db = await read();
        const r = db.requests.find((x) => x.id === id);
        if (!r) return { ok: false as const, error: "solicitação não encontrada" };
        if (!nextStatuses(r.status).includes(to)) return { ok: false as const, error: `não é possível passar de "${r.status}" para "${to}"` };
        r.status = to;
        r.updatedAt = now();
        r.events.push({ at: r.updatedAt, actor, action: "status", detail: `${to}${note ? `: ${note.slice(0, 200)}` : ""}` });
        await write(db);
        return { ok: true as const, record: r };
      }),
    linkOrder: (id, order: { store: CommerceStoreKey; number: string }, actor) =>
      withLock(async () => {
        const db = await read();
        const r = db.requests.find((x) => x.id === id);
        if (!r) return { ok: false as const, error: "solicitação não encontrada" };
        if (!canLinkOrder(r.status)) return { ok: false as const, error: "esta solicitação não pode receber um pedido no estado atual" };
        if (order.store !== REGIONS[r.region].storeKey) return { ok: false as const, error: "o pedido precisa ser da loja INK desta região" };
        if (!ORDER_NUMBER.test(order.number)) return { ok: false as const, error: "número de pedido inválido (3 a 40 letras, números ou hífen)" };
        if (db.requests.some((x) => x.id !== id && x.order?.number === order.number && x.order.store === order.store)) return { ok: false as const, error: "este pedido já está vinculado a outra solicitação" };
        r.order = { store: order.store, number: order.number, linkedBy: actor, linkedAt: now() };
        r.status = "linkedToInkOrder";
        r.updatedAt = r.order.linkedAt;
        r.events.push({ at: r.updatedAt, actor, action: "linked", detail: order.number });
        await write(db);
        return { ok: true as const, record: r };
      }),
    purgeExpired: (at) =>
      withLock(async () => {
        const db = await read();
        const keep = db.requests.filter((r) => new Date(r.expiresAt) > at || r.status === "linkedToInkOrder" || r.status === "inReview" || r.status === "awaitingOrderLink");
        const removed = db.requests.length - keep.length;
        if (removed > 0) await write({ requests: keep });
        return removed;
      }),
  };
}
