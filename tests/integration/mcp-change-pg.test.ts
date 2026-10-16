import path from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Db } from "@/lib/admin/db/db";
import { loadMigrations, migrate } from "@/lib/admin/db/migrate";
import { createPgliteDb } from "@/lib/admin/db/pglite-db";
import { pgUserRepository } from "@/lib/admin/store/pg-stores";
import { pgChangeStore } from "@/lib/mcp/change-pg-store";
import type { ChangeStore } from "@/lib/mcp/change-store";
import { changeHash, newChangeCode, type ProductPlan } from "@/lib/mcp/changes";

/** The confirmed-changes store on the real schema (PGlite): one winner per code, expiry, owner binding, finish and purge. */
let db: Db;
let store: ChangeStore;
let owner: string;
const T0 = Date.parse("2026-10-14T15:00:00Z");
const plan: ProductPlan = { kind: "product", store: "use-sul", items: [{ product_id: "101", name: "P", patch: { price: "99.90" }, changes_tags: false, changes_categories: false, before: {}, after: {} }], unchanged: [], tag_delta: null, category_delta: null, warnings: [] };

beforeAll(async () => {
  db = await createPgliteDb();
  await migrate(db, loadMigrations(path.join(process.cwd(), "db", "migrations")));
  store = pgChangeStore(db);
  owner = (await pgUserRepository(db).create({ email: "dono@example.com", name: null, role: "owner", scopes: [] })).id;
});
afterAll(async () => db.close());

const create = async (expiresAt = T0 + 600_000) => {
  const hash = changeHash(newChangeCode());
  await store.create({ codeHash: hash, subject: owner, clientId: "mcp_x", kind: "product", store: "use-sul", plan, createdAt: T0, expiresAt });
  return hash;
};

describe("pg change store", () => {
  test("two confirmations of one code at once: exactly one wins, the other is told it was used", async () => {
    const hash = await create();
    const [a, b] = await Promise.all([store.claim(hash, owner, T0 + 1000), store.claim(hash, owner, T0 + 1000)]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    expect([a, b].find((r) => !r.ok)).toMatchObject({ ok: false, reason: "used" });
    await store.finish(hash, "applied", { applied: 1 }, T0 + 2000);
    expect(await store.find(hash)).toMatchObject({ status: "applied", result: { applied: 1 }, plan });
  });

  test("an expired code, another account and an unknown code are refused with their reason", async () => {
    const hash = await create(T0 + 10);
    expect(await store.claim(hash, "01J99999999999999999999999", T0)).toMatchObject({ ok: false, reason: "other_account" });
    expect(await store.claim(hash, owner, T0 + 11)).toMatchObject({ ok: false, reason: "expired" });
    expect(await store.claim("f".repeat(64), owner, T0)).toMatchObject({ ok: false, reason: "unknown", record: null });
    expect(await store.purgeExpired(T0 + 11)).toBeGreaterThanOrEqual(1);
    expect(await store.find(hash)).toBeNull();
  });
});
