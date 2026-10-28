import path from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Db } from "@/lib/admin/db/db";
import { loadMigrations, migrate } from "@/lib/admin/db/migrate";
import { createPgliteDb } from "@/lib/admin/db/pglite-db";
import { pgAuditLog } from "@/lib/admin/store/pg-stores";
import { pgPartnerStore } from "@/lib/partners/pg-store";
import { validatePartnerApplication } from "@/lib/partners/application";

let db: Db & { close(): Promise<void> };
beforeAll(async () => {
  db = await createPgliteDb();
  await migrate(db, loadMigrations(path.join(process.cwd(), "db", "migrations")));
});
afterAll(async () => {
  await db.close();
});

/** What the public action stores: the validated values, never the raw input. */
function application(key: string, over: Record<string, unknown> = {}) {
  const r = validatePartnerApplication({ profile: "ambassador", name: "Ana Souza", whatsapp: "(48) 99999-0000", city: "Florianópolis - SC", email: "ana@exemplo.com", instagram: "@ana", followers: "3k", message: "Oi!\nTudo bem?", confirm: true, ...over });
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return { ...r.values, region: "sul" as const, idempotencyKey: key, noticeVersion: "2026-10-v1" };
}

describe("pgPartnerStore (migration 0010)", () => {
  test("given a validated application, when kept twice with the same key, then one row exists and both answers are the same application", async () => {
    const store = pgPartnerStore(db);
    const first = await store.create(application("key-pg-aaaaaaaaaaaa"));
    const again = await store.create(application("key-pg-aaaaaaaaaaaa"));
    expect(first.duplicate).toBe(false);
    expect(again).toEqual({ application: first.application, duplicate: true });
    expect(first.application).toMatchObject({ profile: "ambassador", whatsapp: "+5548999990000", instagram: "ana", followers: 3000, message: "Oi!\nTudo bem?", status: "new" });
    expect(await store.get(first.application.id)).toEqual(first.application);
  });

  test("given applications in two regions, when listed, then only the allowed regions and filters come back, newest first", async () => {
    const store = pgPartnerStore(db);
    await store.create({ ...application("key-pg-bbbbbbbbbbbb", { profile: "artist" }), region: "norte" });
    await store.create(application("key-pg-cccccccccccc", { profile: "collab" }));
    expect((await store.list({ regions: ["norte"] }, 50)).rows.map((a) => a.profile)).toEqual(["artist"]);
    const sul = await store.list({ regions: ["sul"] }, 50);
    expect(sul.total).toBe(2);
    expect(sul.rows[0].profile).toBe("collab");
    expect((await store.list({ regions: ["sul", "norte"], profile: "collab" }, 50)).total).toBe(1);
    expect(await store.list({ regions: [] }, 50)).toEqual({ rows: [], total: 0 });
    expect(await store.countNew(["sul", "norte"])).toBe(3);
  });

  test("given a status change, when it is recorded and audited, then the count of new ones drops and old ones are purged except agreed partnerships", async () => {
    const store = pgPartnerStore(db);
    const { rows } = await store.list({ regions: ["sul"], profile: "ambassador" }, 1);
    expect((await store.setStatus(rows[0].id, "partner"))?.status).toBe("partner");
    await pgAuditLog(db).record({ actor: "owner", action: "partner.status", scope: "sul", target: rows[0].id, meta: { to: "partner" } });
    expect(await store.countNew(["sul", "norte"])).toBe(2);
    expect(await store.setStatus("01J00000000000000000000099", "talking")).toBeNull();
    expect(await store.purgeBefore(new Date(Date.now() + 60_000))).toBe(2);
    expect((await store.list({ regions: ["sul", "norte"] }, 50)).rows.map((a) => a.id)).toEqual([rows[0].id]);
  });
});
