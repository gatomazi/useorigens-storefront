import path from "node:path";
import { adminDevDir, readJson, withLock, writeJsonAtomic } from "../admin/local-store";
import { ulid } from "../admin/ids";
import type { RegionSlug } from "../geo/regions";
import type { PartnerApplication, PartnerProfile, PartnerStatus, PartnerValues } from "./application";

export type PartnerFilter = { regions: readonly RegionSlug[]; status?: PartnerStatus; profile?: PartnerProfile };
export type NewPartnerApplication = PartnerValues & { region: RegionSlug; idempotencyKey: string; noticeVersion: string };

/** Where partner applications live: Postgres in production (db/migrations/0010_partner_applications), a JSON file on the development server. */
export interface PartnerStore {
  /** Keeps one application; the same idempotency key (a double click, a retry) returns the first one instead of a second row. */
  create(input: NewPartnerApplication): Promise<{ application: PartnerApplication; duplicate: boolean }>;
  get(id: string): Promise<PartnerApplication | null>;
  /** The newest first, at most `limit`. */
  list(filter: PartnerFilter, limit: number): Promise<{ rows: PartnerApplication[]; total: number }>;
  countNew(regions: readonly RegionSlug[]): Promise<number>;
  setStatus(id: string, to: PartnerStatus): Promise<PartnerApplication | null>;
  /** Deletes what arrived before `before`, except agreed partnerships. */
  purgeBefore(before: Date): Promise<number>;
}

/** The local sandbox stand-in for the Postgres table (`data/admin-dev/partners.json`, gitignored). Same interface, same rules. */
export function filePartnerStore(file: string = path.join(adminDevDir(), "partners.json")): PartnerStore {
  type Db = { applications: PartnerApplication[] };
  const read = async (): Promise<Db> => (await readJson<Db>(file)) ?? { applications: [] };
  const newestFirst = (a: PartnerApplication, b: PartnerApplication) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0);
  return {
    create: (input) =>
      withLock(async () => {
        const db = await read();
        const existing = db.applications.find((a) => a.idempotencyKey === input.idempotencyKey);
        if (existing) return { application: existing, duplicate: true };
        const at = new Date().toISOString();
        const application: PartnerApplication = { ...input, id: ulid(), status: "new", createdAt: at, updatedAt: at };
        db.applications.push(application);
        await writeJsonAtomic(file, db);
        return { application, duplicate: false };
      }),
    async get(id) {
      return (await read()).applications.find((a) => a.id === id) ?? null;
    },
    async list(filter, limit) {
      const all = (await read()).applications
        .filter((a) => filter.regions.includes(a.region) && (!filter.status || a.status === filter.status) && (!filter.profile || a.profile === filter.profile))
        .sort(newestFirst);
      return { rows: all.slice(0, limit), total: all.length };
    },
    async countNew(regions) {
      return (await read()).applications.filter((a) => regions.includes(a.region) && a.status === "new").length;
    },
    setStatus: (id, to) =>
      withLock(async () => {
        const db = await read();
        const a = db.applications.find((x) => x.id === id);
        if (!a) return null;
        a.status = to;
        a.updatedAt = new Date().toISOString();
        await writeJsonAtomic(file, db);
        return a;
      }),
    purgeBefore: (before) =>
      withLock(async () => {
        const db = await read();
        const keep = db.applications.filter((a) => a.status === "partner" || new Date(a.createdAt) >= before);
        const removed = db.applications.length - keep.length;
        if (removed > 0) await writeJsonAtomic(file, { applications: keep });
        return removed;
      }),
  };
}
