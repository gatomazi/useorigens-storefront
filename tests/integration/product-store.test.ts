import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { loadMigrations, migrate } from "@/lib/admin/db/migrate";
import { createPgliteDb } from "@/lib/admin/db/pglite-db";
import type { Db } from "@/lib/admin/db/db";
import type { NewProductJob, ProductJobStore } from "@/lib/customization/ink-products";
import { fileProductJobStore, pgProductJobStore } from "@/lib/customization/product-store";

let db: Db;
let dir: string;
beforeAll(async () => {
  db = await createPgliteDb();
  await migrate(db, loadMigrations(path.join(process.cwd(), "db", "migrations")));
  dir = await mkdtemp(path.join(tmpdir(), "products-"));
});
afterAll(async () => {
  await db.close();
  await rm(dir, { recursive: true, force: true });
});

let n = 0;
const job = (over: Partial<NewProductJob> = {}): NewProductJob => ({
  dedupeKey: (++n).toString(16).padStart(64, "0"), region: "sul", customizerId: "cz-1", customizerSlug: "natal-em-familia", name: "Silva | Natal em família Universitário",
  artLabel: "Universitário", fields: { sobrenome: "Silva" }, templateId: "1793146922614-16838d1a-8fa1-441a-9d54-3c1df53976d5", lightTemplateId: null, garment: "camiseta", productTypeId: 1, price: "109.90", ...over,
});

describe.each([
  ["Postgres (PGlite, migration 0011)", () => pgProductJobStore(db)],
  ["local sandbox file", () => fileProductJobStore(path.join(dir, `products-${Math.random().toString(36).slice(2)}.json`))],
])("product store: %s", (_name, make) => {
  const store = (): ProductJobStore => make();

  test("the same key twice is one row: the second customer reuses the first one's product", async () => {
    const s = store();
    const input = job();
    const a = await s.findOrCreate(input);
    const b = await s.findOrCreate({ ...input, name: "outro nome" });
    expect(a.created).toBe(true);
    expect(b.created).toBe(false);
    expect(b.job.id).toBe(a.job.id);
    expect(b.job.name).toBe(input.name);
    expect(a.job).toMatchObject({ status: "queued", attempts: 0, inkProductId: null, leaseUntil: null, fields: { sobrenome: "Silva" } });
  });

  test("only one worker holds a job until its lease expires", async () => {
    const s = store();
    const { job: j } = await s.findOrCreate(job());
    const t0 = new Date("2026-12-01T12:00:00Z");
    expect(await s.claim(j.id, 60_000, t0)).not.toBeNull();
    expect(await s.claim(j.id, 60_000, new Date(t0.getTime() + 30_000))).toBeNull();
    expect(await s.claim(j.id, 60_000, new Date(t0.getTime() + 61_000))).not.toBeNull();
    await s.update(j.id, { attempts: 1 }, { release: true });
    expect(await s.claim(j.id, 60_000, new Date(t0.getTime() + 62_000))).not.toBeNull();
  });

  test("an update guarded by the state changes nothing once the job moved on", async () => {
    const s = store();
    const { job: j } = await s.findOrCreate(job());
    await s.update(j.id, { status: "photos", inkProductId: "5143876", inkUrl: "https://loja.useorigens.com.br/useorigens/product/silva" });
    expect(await s.update(j.id, { status: "check", error: "tarde demais" }, { onlyIf: ["queued", "creating"] })).toBeNull();
    expect(await s.get(j.id)).toMatchObject({ status: "photos", error: null });
    const later = new Date(Date.now() + 40_000).toISOString();
    expect(await s.update(j.id, { leaseUntil: later }, { onlyIf: ["photos"] })).toMatchObject({ leaseUntil: later });
  });

  test("a finished job is never taken again", async () => {
    const s = store();
    const { job: j } = await s.findOrCreate(job());
    await s.update(j.id, { status: "photos", inkProductId: "5143876", inkUrl: "https://loja.useorigens.com.br/useorigens/product/silva", inkCreatedAt: new Date().toISOString() });
    const ready = await s.update(j.id, { status: "ready", readyAt: new Date().toISOString() }, { release: true });
    expect(ready).toMatchObject({ status: "ready", inkProductId: "5143876", leaseUntil: null });
    expect(await s.claim(j.id, 60_000)).toBeNull();
  });

  test("lists newest first, filters by status, counts the day's new products", async () => {
    const s = store();
    const before = await s.countCreatedSince(new Date(Date.now() - 60_000));
    const { job: a } = await s.findOrCreate(job({ region: "sul" }));
    await s.findOrCreate(job({ region: "sul" }));
    await s.update(a.id, { status: "failed", error: "x" });
    expect(await s.countCreatedSince(new Date(Date.now() - 60_000))).toBe(before + 2);
    const failed = await s.list({ region: "sul", status: "failed" }, 10, 0);
    expect(failed.rows.map((r) => r.id)).toContain(a.id);
    expect(failed.rows.every((r) => r.status === "failed")).toBe(true);
    const all = await s.list({}, 2, 0);
    expect(all.rows).toHaveLength(2);
    expect(all.rows[0].createdAt >= all.rows[1].createdAt).toBe(true);
  });
});
