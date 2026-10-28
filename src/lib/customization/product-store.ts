import "server-only";
import path from "node:path";
import type { Db } from "../admin/db/db";
import { adminDevDir, readJson, withLock, writeJsonAtomic } from "../admin/local-store";
import { ulid } from "../admin/ids";
import type { RegionSlug } from "../geo/regions";
import type { StudioGarment } from "../site-config/schema";
import { isTerminal, type NewProductJob, type ProductJob, type ProductJobPatch, type ProductJobStore, type ProductStatus } from "./ink-products";

type Row = {
  id: string; dedupe_key: string; region: RegionSlug; customizer_id: string; customizer_slug: string; name: string; art_label: string; field_values: Record<string, string>;
  template_id: string; light_template_id: string | null; garment: StudioGarment; product_type_id: number; price: string; status: ProductStatus;
  ink_product_id: string | null; ink_url: string | null; ink_image_url: string | null; error: string | null; attempts: number;
  lease_until: unknown; created_at: unknown; updated_at: unknown; ink_created_at: unknown; ready_at: unknown;
};
const iso = (v: unknown): string => (v instanceof Date ? v.toISOString() : new Date(String(v)).toISOString());
const isoOrNull = (v: unknown): string | null => (v == null ? null : iso(v));
const COLUMNS = `id, dedupe_key, region, customizer_id, customizer_slug, name, art_label, field_values, template_id, light_template_id, garment, product_type_id, price, status,
  ink_product_id, ink_url, ink_image_url, error, attempts, lease_until, created_at, updated_at, ink_created_at, ready_at`;
const toJob = (r: Row): ProductJob => ({
  id: r.id, dedupeKey: r.dedupe_key, region: r.region, customizerId: r.customizer_id, customizerSlug: r.customizer_slug, name: r.name, artLabel: r.art_label, fields: r.field_values,
  templateId: r.template_id, lightTemplateId: r.light_template_id, garment: r.garment, productTypeId: r.product_type_id, price: r.price, status: r.status,
  inkProductId: r.ink_product_id, inkUrl: r.ink_url, inkImageUrl: r.ink_image_url, error: r.error, attempts: r.attempts,
  leaseUntil: isoOrNull(r.lease_until), createdAt: iso(r.created_at), updatedAt: iso(r.updated_at), inkCreatedAt: isoOrNull(r.ink_created_at), readyAt: isoOrNull(r.ready_at),
});
const PATCH_COLUMN: Record<keyof ProductJobPatch, string> = { status: "status", inkProductId: "ink_product_id", inkUrl: "ink_url", inkImageUrl: "ink_image_url", error: "error", attempts: "attempts", inkCreatedAt: "ink_created_at", readyAt: "ready_at", leaseUntil: "lease_until" };

/** The Postgres store of products created at INK (table `customization_product`, migration 0011). All SQL is parameterised. */
export function pgProductJobStore(db: Db): ProductJobStore {
  const one = async (sql: string, params: unknown[]) => {
    const r = await db.query<Row>(sql, params);
    return r.rows[0] ? toJob(r.rows[0]) : null;
  };
  return {
    async findOrCreate(input) {
      const inserted = await one(
        `insert into customization_product (id, dedupe_key, region, customizer_id, customizer_slug, name, art_label, field_values, template_id, light_template_id, garment, product_type_id, price)
         values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12,$13) on conflict (dedupe_key) do nothing returning ${COLUMNS}`,
        [ulid(), input.dedupeKey, input.region, input.customizerId, input.customizerSlug, input.name, input.artLabel, JSON.stringify(input.fields), input.templateId, input.lightTemplateId, input.garment, input.productTypeId, input.price],
      );
      if (inserted) return { job: inserted, created: true };
      return { job: (await one(`select ${COLUMNS} from customization_product where dedupe_key = $1`, [input.dedupeKey]))!, created: false };
    },
    get: (id) => one(`select ${COLUMNS} from customization_product where id = $1`, [id]),
    findByInkProductId: (inkProductId) => one(`select ${COLUMNS} from customization_product where ink_product_id = $1 limit 1`, [inkProductId]),
    claim: (id, leaseMs, now = new Date()) =>
      one(
        `update customization_product set lease_until = $2, updated_at = now() where id = $1 and status in ('queued', 'creating', 'photos') and (lease_until is null or lease_until < $3) returning ${COLUMNS}`,
        [id, new Date(now.getTime() + leaseMs), now],
      ),
    async update(id, patch, opts) {
      const keys = Object.keys(patch) as (keyof ProductJobPatch)[];
      const sets = keys.map((k, i) => `${PATCH_COLUMN[k]} = $${i + 2}`);
      if (opts?.release) sets.push("lease_until = null");
      sets.push("updated_at = now()");
      const params: unknown[] = [id, ...keys.map((k) => patch[k] ?? null)];
      const guard = opts?.onlyIf ? ` and status = any($${params.push([...opts.onlyIf])})` : "";
      return one(`update customization_product set ${sets.join(", ")} where id = $1${guard} returning ${COLUMNS}`, params);
    },
    async list(filter, limit, offset) {
      const where: string[] = [];
      const params: unknown[] = [];
      if (filter.region) { params.push(filter.region); where.push(`region = $${params.length}`); }
      if (filter.status) { params.push(filter.status); where.push(`status = $${params.length}`); }
      const w = where.length ? `where ${where.join(" and ")}` : "";
      const total = (await db.query<{ n: number }>(`select count(*)::int as n from customization_product ${w}`, params)).rows[0].n;
      const rows = (await db.query<Row>(`select ${COLUMNS} from customization_product ${w} order by created_at desc limit $${params.length + 1} offset $${params.length + 2}`, [...params, limit, offset])).rows.map(toJob);
      return { rows, total };
    },
    async countCreatedSince(since) {
      return (await db.query<{ n: number }>(`select count(*)::int as n from customization_product where created_at >= $1`, [since])).rows[0].n;
    },
  };
}

/** The local sandbox stand-in (`data/admin-dev/customization-products.json`, gitignored). Same interface, same rules. */
export function fileProductJobStore(file: string = path.join(adminDevDir(), "customization-products.json")): ProductJobStore {
  type Data = { products: ProductJob[] };
  const read = async (): Promise<Data> => (await readJson<Data>(file)) ?? { products: [] };
  const write = (data: Data) => writeJsonAtomic(file, data);
  const now = () => new Date().toISOString();
  return {
    findOrCreate: (input: NewProductJob) =>
      withLock(async () => {
        const data = await read();
        const existing = data.products.find((p) => p.dedupeKey === input.dedupeKey);
        if (existing) return { job: existing, created: false };
        const at = now();
        const job: ProductJob = { ...input, id: ulid(), status: "queued", inkProductId: null, inkUrl: null, inkImageUrl: null, error: null, attempts: 0, leaseUntil: null, createdAt: at, updatedAt: at, inkCreatedAt: null, readyAt: null };
        data.products.push(job);
        await write(data);
        return { job, created: true };
      }),
    get: async (id) => (await read()).products.find((p) => p.id === id) ?? null,
    findByInkProductId: async (inkProductId) => (await read()).products.find((p) => p.inkProductId === inkProductId) ?? null,
    claim: (id, leaseMs, at = new Date()) =>
      withLock(async () => {
        const data = await read();
        const job = data.products.find((p) => p.id === id);
        if (!job || isTerminal(job.status) || (job.leaseUntil && new Date(job.leaseUntil) >= at)) return null;
        job.leaseUntil = new Date(at.getTime() + leaseMs).toISOString();
        job.updatedAt = now();
        await write(data);
        return job;
      }),
    update: (id, patch, opts) =>
      withLock(async () => {
        const data = await read();
        const job = data.products.find((p) => p.id === id);
        if (!job || (opts?.onlyIf && !opts.onlyIf.includes(job.status))) return null;
        Object.assign(job, patch, opts?.release ? { leaseUntil: null } : {}, { updatedAt: now() });
        await write(data);
        return job;
      }),
    async list(filter, limit, offset) {
      const rows = (await read()).products.filter((p) => (!filter.region || p.region === filter.region) && (!filter.status || p.status === filter.status)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return { rows: rows.slice(offset, offset + limit), total: rows.length };
    },
    countCreatedSince: async (since) => (await read()).products.filter((p) => new Date(p.createdAt) >= since).length,
  };
}

