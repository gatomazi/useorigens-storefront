import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { loadMigrations, migrate } from "@/lib/admin/db/migrate";
import { createPgliteDb } from "@/lib/admin/db/pglite-db";
import type { Db } from "@/lib/admin/db/db";
import { fileRequestStore } from "@/lib/customization/file-store";
import { pgRequestStore } from "@/lib/customization/pg-store";
import { expiryFrom, hashToken, tokenFor, type RequestStore } from "@/lib/customization/requests";
import { snapshotOf, summaryOf } from "@/lib/customization/validate";
import type { Customizer } from "@/lib/site-config/schema";

const model: Customizer = {
  id: "cz-1", slug: "pai-paranaense", name: "Pai Paranaense", source: { store: "use-sul", collectionId: 1 }, fields: [], previewMode: "mockupWithTextSummary", active: true, version: 4,
  lineGroup: { key: "linhas", label: "Linhas", lineLabel: "Linha {n}", min: 1, initial: 4, max: 6, maxLength: 16 },
};
const SECRET = "test-secret-with-more-than-thirty-two-characters!!";
const future = () => expiryFrom(new Date(), 30);
let n = 0;
const fresh = (region: "sul" | "norte" | "centro-oeste" = "sul", lines = ["PAI", "PARANAENSE", "CHURRASQUEIRO", "LENDA"]) => {
  const key = `idem-${String(++n).padStart(6, "0")}-abcdefghij`;
  const token = tokenFor(SECRET, region, key);
  return { key, token, input: { region, idempotencyKey: key, tokenHash: hashToken(token), snapshot: snapshotOf(model), values: { fields: {}, lines }, expiresAt: future() } };
};

let db: Db;
let dir: string;
beforeAll(async () => {
  db = await createPgliteDb();
  await migrate(db, loadMigrations(path.join(process.cwd(), "db", "migrations")));
  dir = await mkdtemp(path.join(tmpdir(), "reqs-"));
});
afterAll(async () => {
  await db.close();
  await rm(dir, { recursive: true, force: true });
});

describe.each([
  ["Postgres (PGlite, migration 0004)", () => pgRequestStore(db)],
  ["local sandbox file", () => fileRequestStore(path.join(dir, `requests-${Math.random().toString(36).slice(2)}.json`))],
])("request store: %s", (_name, make) => {
  const store = (): RequestStore => make();

  test("given a new request, when stored, then it keeps the model snapshot, the version and the values, starts as submitted and is found by the hash of its reference", async () => {
    const s = store();
    const a = fresh();
    const { record, duplicate } = await s.create(a.input);
    expect(duplicate).toBe(false);
    expect(record).toMatchObject({ region: "sul", customizerId: "cz-1", customizerVersion: 4, customizerName: "Pai Paranaense", status: "submitted", order: null });
    expect(summaryOf(record.snapshot, record.values).map((l) => l.value)).toEqual(["PAI", "PARANAENSE", "CHURRASQUEIRO", "LENDA"]);
    expect((await s.findByTokenHash(hashToken(a.token)))?.id).toBe(record.id);
    expect(await s.findByTokenHash(hashToken("outra-referencia-qualquer-000000000"))).toBeNull();
    expect(JSON.stringify(record)).not.toContain(a.token); // the reference itself is never stored
  });

  test("given a double click (same idempotency key), when submitted twice, then one request exists and the second call reports the duplicate", async () => {
    const s = store();
    const a = fresh();
    const first = await s.create(a.input);
    const second = await s.create(a.input);
    expect(second.duplicate).toBe(true);
    expect(second.record.id).toBe(first.record.id);
    expect((await s.list({}, 50, 0)).rows.filter((r) => r.idempotencyKey === a.key)).toHaveLength(1);
  });

  test("given the customer edits and sends again with the old reference, when stored, then the old request is cancelled and the new one stays", async () => {
    const s = store();
    const a = fresh();
    const old = await s.create(a.input);
    const b = fresh("sul", ["PAI", "GAÚCHO"]);
    const next = await s.create({ ...b.input, replacesTokenHash: hashToken(a.token) });
    expect((await s.get(old.record.id))!.status).toBe("cancelled");
    expect(next.record.status).toBe("submitted");
    // a reference of ANOTHER region never cancels anything
    const c = fresh("norte");
    await s.create({ ...c.input, replacesTokenHash: hashToken(b.token) });
    expect((await s.get(next.record.id))!.status).toBe("submitted");
  });

  test("given requests of two regions, when listed with filters, then region, status and text narrow the queue", async () => {
    const s = store();
    const sul = await s.create(fresh("sul", ["ZZZUNICO"]).input);
    await s.create(fresh("norte", ["ZZZUNICO"]).input);
    const onlySul = await s.list({ region: "sul", q: "zzzunico" }, 50, 0);
    expect(onlySul.rows.map((r) => r.id)).toEqual([sul.record.id]);
    expect((await s.list({ q: "zzzunico" }, 50, 0)).total).toBe(2);
    expect((await s.list({ region: "sul", status: "fulfilled", q: "zzzunico" }, 50, 0)).total).toBe(0);
  });

  test("given the status rules, when an operator changes status, then only allowed moves work and the history records who did it", async () => {
    const s = store();
    const r = (await s.create(fresh().input)).record;
    expect((await s.setStatus(r.id, "fulfilled", "ana@x")).ok).toBe(false); // cannot skip review
    expect((await s.setStatus(r.id, "inReview", "ana@x", "conferindo")).ok).toBe(true);
    const done = await s.setStatus(r.id, "fulfilled", "ana@x");
    expect(done.ok).toBe(true);
    expect((await s.setStatus(r.id, "cancelled", "ana@x")).ok).toBe(false); // final
    const got = (await s.get(r.id))!;
    expect(got.events.map((e) => e.action)).toEqual(["created", "status", "status"]);
    expect(got.events[1]).toMatchObject({ actor: "ana@x", detail: "inReview: conferindo" });
    expect((await s.setStatus("01J0000000000000000000NOPE", "inReview", "x")).ok).toBe(false);
  });

  test("given a manual link, when the order is of the region's own store and valid, then the request becomes linked; another store, a bad number, or an order already used are refused", async () => {
    const s = store();
    const a = (await s.create(fresh().input)).record;
    const b = (await s.create(fresh().input)).record;
    expect(await s.linkOrder(a.id, { store: "use-norte", number: "INK-5001" }, "ana@x")).toMatchObject({ ok: false, error: expect.stringContaining("loja INK desta região") });
    expect((await s.linkOrder(a.id, { store: "use-sul", number: "<b>x</b>" }, "ana@x")).ok).toBe(false);
    const ok = await s.linkOrder(a.id, { store: "use-sul", number: "INK-5001" }, "ana@x");
    expect(ok.ok && ok.record).toMatchObject({ status: "linkedToInkOrder", order: { store: "use-sul", number: "INK-5001", linkedBy: "ana@x" } });
    expect(await s.linkOrder(b.id, { store: "use-sul", number: "INK-5001" }, "ana@x")).toMatchObject({ ok: false, error: expect.stringContaining("já está vinculado") });
    expect((await s.linkOrder(a.id, { store: "use-sul", number: "INK-5002" }, "ana@x")).ok).toBe(false); // already linked: not a state that accepts an order
    expect((await s.get(a.id))!.events.map((e) => e.action)).toEqual(["created", "linked"]);
  });

  test("given expired requests, when purged, then the ones nobody is working on are removed and linked or in-review ones stay", async () => {
    const s = store();
    const old = (h: string, status?: "inReview") => ({ ...fresh(h as "sul").input, expiresAt: new Date(Date.now() - 1000).toISOString() });
    const gone = (await s.create(old("sul"))).record;
    const kept = (await s.create(old("sul"))).record;
    await s.setStatus(kept.id, "inReview", "ana@x");
    const removed = await s.purgeExpired(new Date());
    expect(removed).toBeGreaterThanOrEqual(1);
    expect(await s.get(gone.id)).toBeNull();
    expect(await s.get(kept.id)).not.toBeNull();
  });
});

describe("the reference", () => {
  test("given the same idempotency key, when the reference is derived twice, then it is identical; another key, region or secret gives another", () => {
    const k = "abcdefghijklmnop1234";
    expect(tokenFor(SECRET, "sul", k)).toBe(tokenFor(SECRET, "sul", k));
    expect(tokenFor(SECRET, "sul", k)).not.toBe(tokenFor(SECRET, "norte", k));
    expect(tokenFor(SECRET, "sul", k)).not.toBe(tokenFor(`${SECRET}x`, "sul", k));
    expect(tokenFor(SECRET, "sul", k)).toMatch(/^[A-Za-z0-9_-]{32}$/);
  });
});
