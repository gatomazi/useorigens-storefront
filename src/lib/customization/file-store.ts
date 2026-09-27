import "server-only";
import path from "node:path";
import { adminDevDir, readJson, withLock, writeJsonAtomic } from "../admin/local-store";
import { ulid } from "../admin/ids";
import type { RegionSlug } from "../geo/regions";
import { nextStatuses, normalizeStatus, OPEN_STATUSES, type RequestFilter, type RequestRecord, type RequestStatus, type RequestStore } from "./requests";
import { summaryOf } from "./validate";

/** Fields a record written before the manual-contact flow may still carry. They are ignored, never shown and never rewritten by a new action's read. */
type StoredRecord = Omit<RequestRecord, "status" | "contact" | "contactedAt" | "productLink"> & Partial<Pick<RequestRecord, "contact" | "contactedAt" | "productLink">> & { status: string };

/** The local sandbox stand-in for the Postgres request table (`data/admin-dev/requests.json`, gitignored). Same interface, same rules. */
export function fileRequestStore(file: string = path.join(adminDevDir(), "requests.json")): RequestStore {
  type Db = { requests: StoredRecord[] };
  const read = async (): Promise<Db> => (await readJson<Db>(file)) ?? { requests: [] };
  const write = (db: Db) => writeJsonAtomic(file, db);
  const now = () => new Date().toISOString();
  /** The public shape of a stored record: legacy status names mapped, absent contact fields explicit. */
  const view = (stored: StoredRecord): RequestRecord => {
    const { order: legacyOrder, ...r } = stored as StoredRecord & { order?: unknown };
    void legacyOrder; // an order linked under the old flow stays in the file for the record, but is never part of what the product reads
    return { ...r, status: normalizeStatus(r.status), contact: r.contact ?? null, contactedAt: r.contactedAt ?? null, productLink: r.productLink ?? null };
  };
  const matches = (r: RequestRecord, f: RequestFilter): boolean => {
    if (f.region && r.region !== f.region) return false;
    if (f.status && r.status !== f.status) return false;
    if (f.customizerId && r.customizerId !== f.customizerId) return false;
    if (f.q) {
      const q = f.q.toLowerCase();
      const hay = [r.id, r.contact?.name ?? "", r.customizerName, ...summaryOf(r.snapshot, r.values).map((s) => s.value)].join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  };
  const change = (id: string, apply: (r: StoredRecord, at: string) => string | null) =>
    withLock(async () => {
      const db = await read();
      const r = db.requests.find((x) => x.id === id);
      if (!r) return { ok: false as const, error: "solicitação não encontrada" };
      const at = now();
      const error = apply(r, at);
      if (error) return { ok: false as const, error };
      r.updatedAt = at;
      await write(db);
      return { ok: true as const, record: view(r) };
    });
  return {
    create: (input) =>
      withLock(async () => {
        const db = await read();
        const existing = db.requests.find((r) => r.region === input.region && r.idempotencyKey === input.idempotencyKey);
        if (existing) return { record: view(existing), duplicate: true };
        const at = now();
        const record: StoredRecord = {
          id: ulid(), tokenHash: input.tokenHash, region: input.region, customizerId: input.snapshot.id, customizerSlug: input.snapshot.slug, customizerName: input.snapshot.name,
          customizerVersion: input.snapshot.version, snapshot: input.snapshot, values: input.values, status: "received", contact: input.contact, contactedAt: null, productLink: null,
          idempotencyKey: input.idempotencyKey, createdAt: at, updatedAt: at, expiresAt: input.expiresAt, events: [{ at, actor: "customer", action: "created" }],
        };
        if (input.replacesTokenHash) {
          const old = db.requests.find((r) => r.tokenHash === input.replacesTokenHash && r.region === input.region && normalizeStatus(r.status) === "received");
          if (old) {
            old.status = "cancelled";
            old.updatedAt = at;
            old.events.push({ at, actor: "customer", action: "replaced", detail: `substituída por ${record.id.slice(-8)}` });
          }
        }
        db.requests.push(record);
        await write(db);
        return { record: view(record), duplicate: false };
      }),
    async get(id) {
      const r = (await read()).requests.find((x) => x.id === id);
      return r ? view(r) : null;
    },
    async findByTokenHash(hash) {
      const r = (await read()).requests.find((x) => x.tokenHash === hash);
      return r ? view(r) : null;
    },
    async list(filter, limit, offset) {
      const all = (await read()).requests.map(view).filter((r) => matches(r, filter)).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      return { rows: all.slice(offset, offset + limit), total: all.length };
    },
    async count(regions: readonly RegionSlug[]) {
      return (await read()).requests.filter((r) => regions.includes(r.region)).length;
    },
    async countOpen(regions: readonly RegionSlug[]) {
      return (await read()).requests.filter((r) => regions.includes(r.region) && OPEN_STATUSES.includes(normalizeStatus(r.status))).length;
    },
    setStatus: (id, to: RequestStatus, actor, note) =>
      change(id, (r, at) => {
        const from = normalizeStatus(r.status);
        if (!nextStatuses(from).includes(to)) return `não é possível passar de "${from}" para "${to}"`;
        r.status = to;
        if (to === "customerContacted") r.contactedAt = at;
        r.events.push({ at, actor, action: "status", detail: `${to}${note ? `: ${note.slice(0, 200)}` : ""}` });
        return null;
      }),
    addNote: (id, actor, note) =>
      change(id, (r, at) => {
        if (note.trim() === "") return "escreva a observação";
        r.events.push({ at, actor, action: "note", detail: note.trim().slice(0, 500) });
        return null;
      }),
    setProductLink: (id, url, actor) =>
      change(id, (r, at) => {
        r.productLink = url ? { url, setBy: actor, setAt: at } : null;
        r.events.push({ at, actor, action: "product-link", detail: url ? "definido" : "removido" });
        return null;
      }),
    purgeExpired: (at) =>
      withLock(async () => {
        const db = await read();
        // Requests someone is still working on (being made, or ready and not yet told to the customer) are kept whatever their age.
        const keep = db.requests.filter((r) => new Date(r.expiresAt) > at || ["inCreation", "artReady"].includes(normalizeStatus(r.status)));
        const removed = db.requests.length - keep.length;
        if (removed > 0) await write({ requests: keep });
        return removed;
      }),
  };
}
