import type { Db } from "../admin/db/db";
import { sqlState } from "../admin/db/db";
import { ulid, ULID_RE } from "../admin/ids";
import type { RegionSlug } from "../geo/regions";
import { isPartnerProfile, isPartnerStatus, type PartnerApplication } from "./application";
import type { PartnerStore } from "./store";

/** PostgreSQL implementation of the partner applications (db/migrations/0010_partner_applications). Every query is parameterised. */

type Row = {
  id: string; region: RegionSlug; profile: string; name: string; whatsapp: string; email: string | null; city: string; instagram: string | null;
  followers: number | null; message: string | null; status: string; notice_version: string; idempotency_key: string; created_at: unknown; updated_at: unknown;
};
const COLUMNS = "id, region, profile, name, whatsapp, email, city, instagram, followers, message, status, notice_version, idempotency_key, created_at, updated_at";
const iso = (v: unknown): string => (v instanceof Date ? v.toISOString() : new Date(String(v)).toISOString());

const toApplication = (r: Row): PartnerApplication => ({
  id: r.id, region: r.region, profile: isPartnerProfile(r.profile) ? r.profile : "ambassador", name: r.name, whatsapp: r.whatsapp, email: r.email, city: r.city,
  instagram: r.instagram, followers: r.followers === null ? null : Number(r.followers), message: r.message, status: isPartnerStatus(r.status) ? r.status : "new",
  noticeVersion: r.notice_version, idempotencyKey: r.idempotency_key, createdAt: iso(r.created_at), updatedAt: iso(r.updated_at),
});

export function pgPartnerStore(db: Db): PartnerStore {
  const byKey = async (key: string) => (await db.query<Row>(`select ${COLUMNS} from partner_application where idempotency_key = $1`, [key])).rows[0];
  return {
    async create(input) {
      try {
        const inserted = await db.query<Row>(
          `insert into partner_application (id, region, profile, name, whatsapp, email, city, instagram, followers, message, notice_version, idempotency_key)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
           on conflict (idempotency_key) do nothing returning ${COLUMNS}`,
          [ulid(), input.region, input.profile, input.name, input.whatsapp, input.email, input.city, input.instagram, input.followers, input.message, input.noticeVersion, input.idempotencyKey],
        );
        if (inserted.rows[0]) return { application: toApplication(inserted.rows[0]), duplicate: false };
        return { application: toApplication((await byKey(input.idempotencyKey))!), duplicate: true };
      } catch (error) {
        // Two identical submissions racing past the ON CONFLICT: the loser reads the winner.
        if (sqlState(error) === "23505") {
          const existing = await byKey(input.idempotencyKey);
          if (existing) return { application: toApplication(existing), duplicate: true };
        }
        throw error;
      }
    },
    async get(id) {
      if (!ULID_RE.test(id)) return null;
      const r = await db.query<Row>(`select ${COLUMNS} from partner_application where id = $1`, [id]);
      return r.rows[0] ? toApplication(r.rows[0]) : null;
    },
    async list(filter, limit) {
      if (filter.regions.length === 0) return { rows: [], total: 0 };
      const params: unknown[] = [[...filter.regions]];
      const where = ["region = any($1::text[])"];
      if (filter.status) where.push(`status = $${params.push(filter.status)}`);
      if (filter.profile) where.push(`profile = $${params.push(filter.profile)}`);
      const w = `where ${where.join(" and ")}`;
      const total = Number((await db.query<{ n: string }>(`select count(*)::text as n from partner_application ${w}`, params)).rows[0].n);
      const rows = await db.query<Row>(`select ${COLUMNS} from partner_application ${w} order by created_at desc, id desc limit ${Math.max(1, Math.min(500, limit))}`, params);
      return { rows: rows.rows.map(toApplication), total };
    },
    async countNew(regions) {
      if (regions.length === 0) return 0;
      const r = await db.query<{ n: string }>(`select count(*)::text as n from partner_application where region = any($1::text[]) and status = 'new'`, [[...regions]]);
      return Number(r.rows[0].n);
    },
    async setStatus(id, to) {
      const r = await db.query<Row>(`update partner_application set status = $2, updated_at = now() where id = $1 returning ${COLUMNS}`, [id, to]);
      return r.rows[0] ? toApplication(r.rows[0]) : null;
    },
    async purgeBefore(before) {
      return (await db.query(`delete from partner_application where created_at < $1 and status <> 'partner'`, [before.toISOString()])).rowCount;
    },
  };
}
