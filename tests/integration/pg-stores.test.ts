import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import sharp from "sharp";
import type { Db } from "@/lib/admin/db/db";
import { loadMigrations, migrate, migrationStatus } from "@/lib/admin/db/migrate";
import { createPgliteDb } from "@/lib/admin/db/pglite-db";
import { ulid } from "@/lib/admin/ids";
import type { ObjectStore } from "@/lib/admin/media/s3";
import { bucketMediaStore } from "@/lib/admin/media/bucket-store";
import { filePublishedStore, publishRelease, reconcileReleases, inspectReleases, type PublishDeps } from "@/lib/admin/publishing";
import { pgAuditLog, pgDraftRepository, pgReleaseStore, pgSessionRepository, pgSyncRunRepository, pgUserRepository } from "@/lib/admin/store/pg-stores";
import { buildSeedBundle } from "@/lib/site-config/seed";
import type { ScopeDoc } from "@/lib/site-config/schema";
import { applyOp } from "@/lib/admin/draft-ops";

/**
 * The repository SQL against a real PostgreSQL engine (PGlite): schema constraints, triggers, partial unique indexes and jsonb behave
 * exactly as they will on Railway. No mocks of the database anywhere in this file.
 */
let db: Db;
const migrations = loadMigrations(path.join(process.cwd(), "db", "migrations"));
const seed = () => buildSeedBundle({ metaPixelId: null, ga4MeasurementId: null });
const sulDoc = (): ScopeDoc => structuredClone(seed().docs.sul);
const editedDoc = (title: string): ScopeDoc => {
  const r = applyOp(sulDoc(), { type: "add-carousel", title, source: { kind: "ink-category", store: "use-sul", collectionId: 152188, order: "category", limit: 6 } }, { newId: () => Math.random().toString(16).slice(2, 10) });
  if (!r.ok) throw new Error(r.errors.join());
  return r.doc;
};

beforeAll(async () => {
  db = await createPgliteDb();
  await migrate(db, migrations);
});
afterAll(async () => db.close());

async function seedUser(email: string, role: "owner" | "editor" = "editor", scopes: ("sul" | "norte" | "centro-oeste")[] = ["sul"]) {
  return pgUserRepository(db).create({ email, name: null, role, scopes });
}

describe("migrations", () => {
  test("given a fresh database, when migrated, then every migration is applied once and a second run applies nothing", async () => {
    const fresh = await createPgliteDb();
    expect(await migrate(fresh, migrations)).toEqual(["0001_init", "0002_auth_sync"]);
    expect(await migrate(fresh, migrations)).toEqual([]);
    expect(await migrationStatus(fresh, migrations)).toEqual({ applied: ["0001_init", "0002_auth_sync"], pending: [], unknown: [] });
    await fresh.close();
  });

  test("given a database that is behind, when its status is read, then the pending versions are reported and nothing is applied", async () => {
    const half = await createPgliteDb();
    await migrate(half, migrations.slice(0, 1));
    expect((await migrationStatus(half, migrations)).pending).toEqual(["0002_auth_sync"]);
    await half.close();
  });

  test("given a broken migration, when it fails, then nothing of it is left behind and the version is not recorded", async () => {
    const d = await createPgliteDb();
    await migrate(d, migrations.slice(0, 1));
    const broken = { version: "0003_broken", up: "create table half_done (id int); select 1/0;", down: null, checksum: "x" };
    await expect(migrate(d, [...migrations, broken])).rejects.toThrow();
    expect((await d.query(`select to_regclass('public.half_done') is not null as present`)).rows[0]).toEqual({ present: false });
    expect((await migrationStatus(d, [...migrations, broken])).pending).toEqual(["0003_broken"]);
    await d.close();
  });
});

describe("drafts", () => {
  beforeEach(async () => { await db.query(`delete from config_draft`); });

  test("given no draft, when the first save expects none, then rev 1 is stored; a second 'first' save conflicts", async () => {
    const drafts = pgDraftRepository(db);
    const first = await drafts.save("sul", sulDoc(), null, null, null);
    expect(first.ok && first.record.rev).toBe(1);
    const again = await drafts.save("sul", sulDoc(), null, null, null);
    expect(again.ok).toBe(false);
  });

  test("given two tabs on the same revision, when both save, then the second is refused with the winner's copy (nobody is overwritten silently)", async () => {
    const drafts = pgDraftRepository(db);
    const a = await drafts.save("sul", sulDoc(), null, null, null);
    expect(a.ok).toBe(true);
    const tab1 = await drafts.save("sul", editedDoc("Aba 1"), 1, null, null);
    const tab2 = await drafts.save("sul", editedDoc("Aba 2"), 1, null, null);
    expect(tab1.ok && tab1.record.rev).toBe(2);
    expect(tab2.ok).toBe(false);
    expect(!tab2.ok && tab2.conflict?.rev).toBe(2);
    expect((await drafts.load("sul"))!.doc.home!.sections.some((s) => s.title === "Aba 1")).toBe(true);
  });

  test("given a saved draft, when it is loaded, then the document round-trips through jsonb and discard removes it; regions are isolated", async () => {
    const drafts = pgDraftRepository(db);
    const doc = editedDoc("Roundtrip");
    await drafts.save("sul", doc, null, null, null);
    expect((await drafts.load("sul"))!.doc).toEqual(doc);
    expect(await drafts.load("norte")).toBeNull();
    await drafts.discard("sul");
    expect(await drafts.load("sul")).toBeNull();
  });

  test("given a draft saved by a person, when stored, then the author is recorded and must be a real user", async () => {
    const u = await seedUser(`author-${ulid().toLowerCase()}@example.com`);
    await expect(pgDraftRepository(db).save("sul", sulDoc(), null, null, u.id)).resolves.toMatchObject({ ok: true });
    await db.query(`delete from config_draft`);
    await expect(pgDraftRepository(db).save("sul", sulDoc(), null, null, "01J0000000000000000000NOPE")).rejects.toThrow();
  });
});

describe("releases, publishing and rollback", () => {
  let dir: string;
  let deps: PublishDeps;
  const noRevalidate = async () => {};
  beforeEach(async () => {
    await db.query(`update release_head set release_id = release_id`); // no-op; head persists across tests on purpose (history is append-only)
    dir = await mkdtemp(path.join(tmpdir(), "pub-"));
    deps = { releases: pgReleaseStore(db), files: filePublishedStore(dir), media: async () => ({}), actorId: null };
  });
  afterAll(async () => { if (dir) await rm(dir, { recursive: true, force: true }); });

  const ok = async (doc: ScopeDoc, note?: string) => {
    const r = await publishRelease(deps, { kind: "publish", doc, note }, noRevalidate);
    if (!r.ok) throw new Error(r.errors.join("; "));
    return r.outcome;
  };

  test("given a valid draft, when published, then the release is live, the head moved, published.json is the same bundle and the cache step is recorded", async () => {
    const outcome = await ok(editedDoc("Primeira"), "primeira");
    expect(outcome.status).toBe("published");
    const state = await deps.releases.reconcileState();
    expect(state.head?.id).toBe(outcome.releaseId);
    expect(state.headRevalidated).toBe(true);
    expect(await inspectReleases(deps)).toEqual([]);
    const file = await deps.files.read();
    expect(file?.releaseId).toBe(outcome.releaseId);
    expect(file?.docs.sul.home?.sections.some((s) => s.title === "Primeira")).toBe(true);
    const history = await deps.releases.list(5);
    expect(history[0]).toMatchObject({ id: outcome.releaseId, status: "live", kind: "publish", note: "primeira", scopesChanged: ["sul"] });
  });

  test("given a live release, when a bundle is stored, then only the edited region changes; other regions carry over from the live head", async () => {
    const before = (await deps.releases.head())!.bundle;
    await ok(editedDoc("Só o Sul"));
    const after = (await deps.releases.head())!.bundle;
    expect(after.docs.norte).toEqual(before.docs.norte);
    expect(after.docs["centro-oeste"]).toEqual(before.docs["centro-oeste"]);
    expect(after.docs.global).toEqual(before.docs.global);
  });

  test("given release rows, when anyone tries to edit or delete one, then the database refuses (append-only history)", async () => {
    const id = (await deps.releases.head())!.record.id;
    await expect(db.query(`update release set bundle = '{"x":1}'::jsonb where id = $1::bigint`, [id])).rejects.toThrow(/immutable/);
    await expect(db.query(`delete from release where id = $1::bigint`, [id])).rejects.toThrow(/append-only/);
  });

  test("given an earlier live release, when it is restored, then a NEW rollback release goes live with its content and history keeps everything", async () => {
    const first = await ok(editedDoc("Versão A"));
    await ok(editedDoc("Versão B"));
    const r = await publishRelease(deps, { kind: "rollback", toReleaseId: first.releaseId }, noRevalidate);
    expect(r.ok && r.outcome.status).toBe("published");
    const head = (await deps.releases.head())!;
    expect(head.record.id).not.toBe(first.releaseId);
    expect(head.bundle.docs.sul.home!.sections.some((s) => s.title === "Versão A")).toBe(true);
    expect(head.bundle.docs.sul.home!.sections.some((s) => s.title === "Versão B")).toBe(false);
    const list = await deps.releases.list(10);
    expect(list.find((x) => x.id === head.record.id)?.kind).toBe("rollback");
    expect(list.some((x) => x.id === first.releaseId && x.status === "live")).toBe(true);
    expect((await deps.files.read())?.releaseId).toBe(head.record.id);
  });

  test("given a failed or unknown release, when a rollback to it is requested, then it is refused (only versions that were live are restorable)", async () => {
    const r = await publishRelease(deps, { kind: "rollback", toReleaseId: "999999" }, noRevalidate);
    expect(r.ok).toBe(false);
    const bad = await publishRelease(deps, { kind: "rollback", toReleaseId: "1; drop table release" }, noRevalidate);
    expect(bad.ok).toBe(false);
  });

  test("given the file write fails (disk full, volume gone), when publishing, then the release is failed, the previous file is untouched and visitors keep the old version", async () => {
    const live = await ok(editedDoc("Estável"));
    const failing: PublishDeps = { ...deps, files: { ...deps.files, writeAtomic: async () => { throw new Error("ENOSPC"); } } };
    const r = await publishRelease(failing, { kind: "publish", doc: editedDoc("Nunca vai ao ar") }, noRevalidate);
    expect(r.ok && r.outcome.status).toBe("failed");
    expect((await deps.files.read())?.releaseId).toBe(live.releaseId);
    expect((await deps.releases.reconcileState()).pending).toEqual([]);
    expect((await deps.releases.head())!.record.id).toBe(live.releaseId);
  });

  test("given the database dies after the file was written, when publishing, then visitors already see the new version and the reconciler completes the record", async () => {
    const real = pgReleaseStore(db);
    const flaky: PublishDeps = { ...deps, releases: { ...real, markLive: async () => { throw new Error("connection lost"); } } };
    const r = await publishRelease(flaky, { kind: "publish", doc: editedDoc("Arquivo primeiro") }, noRevalidate);
    expect(r.ok && r.outcome.status).toBe("file-live-db-pending");
    const pendingId = r.ok ? r.outcome.releaseId : "";
    expect((await deps.files.read())?.releaseId).toBe(pendingId);
    expect(await inspectReleases(deps)).toContain("promote-pending");
    expect(await reconcileReleases(deps, noRevalidate)).toContain("promote-pending");
    expect((await deps.releases.head())!.record.id).toBe(pendingId);
    expect(await inspectReleases(deps)).toEqual([]);
  });

  test("given the Volume was lost (published.json missing or corrupted), when reconciled, then the file is rewritten from the live release", async () => {
    const live = (await deps.releases.head())!.record.id;
    const missing = filePublishedStore(await mkdtemp(path.join(tmpdir(), "empty-")));
    const lost: PublishDeps = { ...deps, files: missing };
    expect(await inspectReleases(lost)).toContain("rewrite-file-from-head");
    expect(await reconcileReleases(lost, noRevalidate)).toContain("rewrite-file-from-head");
    expect((await missing.read())?.releaseId).toBe(live);
    expect(await inspectReleases(lost)).toEqual([]);
  });

  test("given a publish already in flight, when a second begins, then the database refuses it (single pending release)", async () => {
    const compose = async (id: string) => ({ ...seed(), releaseId: id });
    const first = await deps.releases.begin({ kind: "publish", note: null, scopesChanged: ["sul"], sections: 1, actorId: null }, compose);
    await expect(deps.releases.begin({ kind: "publish", note: null, scopesChanged: ["sul"], sections: 1, actorId: null }, compose)).rejects.toThrow("already in flight");
    await deps.releases.markFailed(first.release.id, "test cleanup");
    expect((await deps.releases.list(1))[0]).toMatchObject({ status: "failed", failedReason: "test cleanup" });
  });

  test("given a document that fails validation, when published, then nothing is written anywhere", async () => {
    const before = (await deps.releases.list(1))[0].id;
    const broken = sulDoc();
    broken.home!.sections[1].cta = { label: "x", dest: { kind: "external", url: "https://evil.example/" } } as never;
    const r = await publishRelease(deps, { kind: "publish", doc: broken }, noRevalidate);
    expect(r.ok).toBe(false);
    expect((await deps.releases.list(1))[0].id).toBe(before);
  });
});

describe("people, sessions and audit", () => {
  test("given users, when created, then e-mails are unique and lower-case, editors need a scope, and 'global' is never an editor scope", async () => {
    const users = pgUserRepository(db);
    await users.create({ email: "Mixed.Case@Example.com", name: null, role: "editor", scopes: ["sul"] });
    expect((await users.findByEmail("MIXED.case@example.com"))?.email).toBe("mixed.case@example.com");
    await expect(users.create({ email: "mixed.case@example.com", name: null, role: "editor", scopes: ["sul"] })).rejects.toThrow();
    await expect(users.create({ email: "noscope@example.com", name: null, role: "editor", scopes: [] })).rejects.toThrow();
    await expect(users.create({ email: "g@example.com", name: null, role: "editor", scopes: ["global" as never] })).rejects.toThrow();
  });

  test("given a session, when created and looked up, then only the hash is stored, it expires, idles out and dies with the user's access", async () => {
    const users = pgUserRepository(db);
    const sessions = pgSessionRepository(db);
    const u = await users.create({ email: `s-${ulid().toLowerCase()}@example.com`, name: null, role: "editor", scopes: ["sul"] });
    const token = await sessions.create(u.id, 60_000);
    expect((await db.query<{ token_hash: string }>(`select token_hash from admin_session where user_id = $1`, [u.id])).rows[0].token_hash).not.toContain(token);
    expect((await sessions.lookup(token, 60_000))?.user.email).toBe(u.email);
    expect(await sessions.lookup("A".repeat(43), 60_000)).toBeNull();
    expect(await sessions.lookup("not-a-token", 60_000)).toBeNull();
    await db.query(`update admin_session set last_seen_at = now() - interval '3 hours' where user_id = $1`, [u.id]);
    expect(await sessions.lookup(token, 2 * 60 * 60_000)).toBeNull(); // idle timeout
    await db.query(`update admin_session set last_seen_at = now(), expires_at = now() + interval '1 hour' where user_id = $1`, [u.id]);
    expect(await sessions.lookup(token, 2 * 60 * 60_000)).not.toBeNull();
    await users.update(u.id, { active: false });
    expect(await sessions.lookup(token, 2 * 60 * 60_000)).toBeNull(); // deactivated: the cookie is worthless
    await users.update(u.id, { active: true });
    await sessions.destroyAllFor(u.id);
    expect(await sessions.lookup(token, 60_000)).toBeNull();
  });

  test("given an expired session, when purged, then it is deleted", async () => {
    const users = pgUserRepository(db);
    const sessions = pgSessionRepository(db);
    const u = await users.create({ email: `p-${ulid().toLowerCase()}@example.com`, name: null, role: "editor", scopes: ["sul"] });
    await sessions.create(u.id, 1);
    await db.query(`update admin_session set created_at = now() - interval '2 hours', expires_at = now() - interval '1 hour' where user_id = $1`, [u.id]);
    expect(await sessions.purgeExpired()).toBeGreaterThanOrEqual(1);
  });

  test("given the audit log, when entries are recorded, then they are readable newest first and can never be edited or deleted", async () => {
    const audit = pgAuditLog(db);
    await audit.record({ actor: "system", action: "reconcile", meta: { actions: ["revalidate"] } });
    await audit.record({ actor: "system", action: "collections.sync", scope: null, target: "x" });
    const recent = await audit.recent(2);
    expect(recent.map((r) => r.action)).toEqual(["collections.sync", "reconcile"]);
    await expect(db.query(`update audit_log set actor = 'x'`)).rejects.toThrow(/append-only/);
    await expect(db.query(`delete from audit_log`)).rejects.toThrow(/append-only/);
  });
});

describe("sync runs", () => {
  test("given a running collections sync, when another starts, then it is refused; a catalog sync may run alongside; a finished run frees the lock", async () => {
    const syncs = pgSyncRunRepository(db);
    const run = await syncs.start("collections", "owner");
    expect(run).not.toBeNull();
    expect(await syncs.start("collections", "owner")).toBeNull();
    const catalog = await syncs.start("catalog", "owner");
    expect(catalog).not.toBeNull();
    await syncs.finish(run!.id, { ok: true, summary: { stores: 3 } });
    await syncs.finish(catalog!.id, { ok: false, error: "INK 503" });
    expect(await syncs.last("collections")).toMatchObject({ status: "succeeded", summary: { stores: 3 } });
    expect(await syncs.last("catalog")).toMatchObject({ status: "failed", error: "INK 503" });
    const next = await syncs.start("collections", "owner");
    expect(next).not.toBeNull();
    await syncs.finish(next!.id, { ok: true, summary: {} });
  });

  test("given a run whose process died, when it is stale, then it is failed and a new run may start", async () => {
    const syncs = pgSyncRunRepository(db);
    const run = await syncs.start("collections", "owner");
    await db.query(`update sync_run set started_at = now() - interval '30 minutes' where id = $1::bigint`, [run!.id]);
    expect(await syncs.failStale("collections", 10 * 60_000)).toBe(1);
    expect((await syncs.last("collections"))?.status).toBe("failed");
    const next = await syncs.start("collections", "owner");
    expect(next).not.toBeNull();
    await syncs.finish(next!.id, { ok: true, summary: {} });
  });
});

describe("media in a private Railway bucket (fake object store)", () => {
  const fakeObjects = () => {
    const puts = new Map<string, number>();
    const bodies = new Map<string, Buffer>();
    const store: ObjectStore = {
      async put(key, body) { puts.set(key, body.length); bodies.set(key, Buffer.from(body)); },
      async get(key) { const b = bodies.get(key); return b ? { body: b, contentType: "image/webp" } : null; },
      async exists(key) { return puts.has(key); },
      async remove() { throw new Error("the application must never delete objects"); },
    };
    return { store, puts };
  };
  const png = () => sharp({ create: { width: 1300, height: 500, channels: 3, background: { r: 10, g: 120, b: 60 } } }).png().toBuffer();

  test("given an upload, when saved, then variants go to the store, the row is ready, the publishing URLs are same-origin /media paths, the library ones are authenticated /admin paths, and the original is not kept", async () => {
    const { store, puts } = fakeObjects();
    const media = bucketMediaStore({ db, objects: store });
    const r = await media.save(await png(), "Minha Foto.png", null);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect([...puts.keys()].every((k) => /^media\/[0-9a-f]{64}\/\d{3,4}\.webp$/.test(k))).toBe(true);
    expect([...puts.keys()].map((k) => Number(k.match(/\/(\d+)\.webp$/)![1]))).toEqual([640, 1080, 1300]);
    expect(r.choice).toMatchObject({ label: "Minha Foto", kind: "upload", width: 1300, height: 500 });
    expect(r.choice.src).toMatch(/^\/admin\/media\/[0-9a-f]{64}\/640\.webp$/); // library thumbnails: signed-in editors only
    const resolved = await media.resolve([r.choice.assetId, "legacy:sul/hero-mobile", "upload:01J0000000000000000000NOPE"]);
    expect(resolved[r.choice.assetId]).toMatchObject({ width: 1300, variants: [{ w: 640 }, { w: 1080 }, { w: 1300 }] });
    expect(resolved[r.choice.assetId].src).toMatch(/^\/media\/[0-9a-f]{64}\/1300\.webp$/); // what gets published: the storefront's own route
    const preview = await media.resolve([r.choice.assetId], "preview");
    expect(preview[r.choice.assetId].src).toMatch(/^\/admin\/media\/[0-9a-f]{64}\/1300\.webp$/);
    expect(await media.knows!(r.choice.assetId.length ? [...puts.keys()][0].split("/")[1] : "")).toBe(true);
    expect(await media.knows!("f".repeat(64))).toBe(false);
    expect((await media.read!([...puts.keys()][0]))?.body.length).toBeGreaterThan(0);
    expect(resolved["upload:01J0000000000000000000NOPE"]).toBeUndefined();
    expect((await media.list()).some((m) => m.assetId === r.choice.assetId)).toBe(true);
  });

  test("given the same bytes twice, when saved, then the second is a duplicate: same asset, no second upload", async () => {
    const { store, puts } = fakeObjects();
    const media = bucketMediaStore({ db, objects: store });
    const buf = await sharp({ create: { width: 900, height: 300, channels: 3, background: "#224466" } }).png().toBuffer();
    const a = await media.save(buf, "a.png", null);
    const count = puts.size;
    const b = await media.save(buf, "b.png", null);
    expect(a.ok && b.ok && b.duplicate === true && b.choice.assetId === a.choice.assetId).toBe(true);
    expect(puts.size).toBe(count);
  });

  test("given hostile or unsupported bytes, when saved, then nothing is uploaded and no row is created", async () => {
    const { store, puts } = fakeObjects();
    const media = bucketMediaStore({ db, objects: store });
    const before = (await db.query(`select count(*)::int as n from media_asset`)).rows[0];
    expect((await media.save(Buffer.from("<svg onload=alert(1)/>"), "x.svg", null)).ok).toBe(false);
    expect((await media.save(Buffer.from("nope"), "x.png", null)).ok).toBe(false);
    expect(puts.size).toBe(0);
    expect((await db.query(`select count(*)::int as n from media_asset`)).rows[0]).toEqual(before);
  });

  test("given no bucket configuration, when uploading, then it is refused clearly and the existing banners still list", async () => {
    const media = bucketMediaStore({ db, objects: null });
    expect(media.canUpload).toBe(false);
    expect(await media.save(await png(), "x.png", null)).toMatchObject({ ok: false, error: expect.stringContaining("Bucket") });
    expect((await media.list()).some((m) => m.kind === "banner")).toBe(true);
  });

  test("given an asset referenced by a published release or a draft, when removal is requested, then it is refused; an unused one is only hidden, never deleted from storage", async () => {
    const { store, puts } = fakeObjects();
    const media = bucketMediaStore({ db, objects: store });
    const used = await media.save(await sharp({ create: { width: 800, height: 300, channels: 3, background: "#aa5500" } }).png().toBuffer(), "usada.png", null);
    const free = await media.save(await sharp({ create: { width: 800, height: 300, channels: 3, background: "#0055aa" } }).png().toBuffer(), "livre.png", null);
    if (!used.ok || !free.ok) throw new Error("upload failed");
    const releases = pgReleaseStore(db);
    const info = (await media.resolve([used.choice.assetId]))[used.choice.assetId];
    await releases.begin({ kind: "publish", note: null, scopesChanged: ["sul"], sections: 0, actorId: null }, async (id) => ({ ...seed(), releaseId: id, media: { ...seed().media, [used.choice.assetId]: info } }))
      .then(async (b) => { await releases.markLive(b.release.id); });
    const refused = await media.remove(used.choice.assetId);
    expect(refused).toMatchObject({ ok: false, error: expect.stringContaining("publicada") });
    const removed = await media.remove(free.choice.assetId);
    expect(removed.ok).toBe(true);
    expect((await media.list()).some((m) => m.assetId === free.choice.assetId)).toBe(false);
    expect(puts.size).toBeGreaterThan(0); // objects stay; the fake store's remove() would have thrown
    expect(await media.remove("upload:not-a-ulid")).toMatchObject({ ok: false });
    await db.query(`delete from config_draft`);
    await pgDraftRepository(db).save("sul", { ...sulDoc(), notes: `uses ${free.choice.assetId}` } as never, null, null, null);
  });
});
