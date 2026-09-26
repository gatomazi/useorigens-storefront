import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { loadMigrations, migrate } from "@/lib/admin/db/migrate";
import { createPgliteDb } from "@/lib/admin/db/pglite-db";
import type { Db } from "@/lib/admin/db/db";
import { fileRequestStore } from "@/lib/customization/file-store";
import { pgRequestStore } from "@/lib/customization/pg-store";
import { expiryFrom, hashToken, tokenFor, type RequestContact, type RequestStore } from "@/lib/customization/requests";
import { snapshotOf, summaryOf } from "@/lib/customization/validate";
import type { Customizer } from "@/lib/site-config/schema";

const model: Customizer = {
  id: "cz-1", slug: "pai-paranaense", name: "Pai Paranaense", source: { store: "use-sul", collectionId: 1 }, fields: [], previewMode: "mockupWithTextSummary", active: true, version: 4,
  lineGroup: { key: "linhas", label: "Linhas", lineLabel: "Linha {n}", min: 1, initial: 4, max: 6, maxLength: 16 },
};
const SECRET = "test-secret-with-more-than-thirty-two-characters!!";
const future = () => expiryFrom(new Date(), 30);
const contact = (over: Partial<RequestContact> = {}): RequestContact => ({ name: "Ana Souza", whatsapp: "+5551999998888", email: "ana@exemplo.com", confirmedAt: new Date().toISOString(), noticeVersion: "2026-09-v1", ...over });
let n = 0;
const fresh = (region: "sul" | "norte" | "centro-oeste" = "sul", lines = ["PAI", "PARANAENSE", "CHURRASQUEIRO", "LENDA"]) => {
  const key = `idem-${String(++n).padStart(6, "0")}-abcdefghij`;
  const token = tokenFor(SECRET, region, key);
  return { key, token, input: { region, idempotencyKey: key, tokenHash: hashToken(token), snapshot: snapshotOf(model), values: { fields: {}, lines }, contact: contact(), expiresAt: future() } };
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
  ["Postgres (PGlite, migrations 0004 + 0005)", () => pgRequestStore(db)],
  ["local sandbox file", () => fileRequestStore(path.join(dir, `requests-${Math.random().toString(36).slice(2)}.json`))],
])("request store: %s", (_name, make) => {
  const store = (): RequestStore => make();

  test("given a new request, when stored, then it keeps the model snapshot, the version and the values, starts as received with its contact, and is found by the hash of its reference", async () => {
    const s = store();
    const a = fresh();
    const { record, duplicate } = await s.create(a.input);
    expect(duplicate).toBe(false);
    expect(record).toMatchObject({ region: "sul", customizerId: "cz-1", customizerVersion: 4, customizerName: "Pai Paranaense", status: "received", contactedAt: null, productLink: null });
    expect(record.contact).toMatchObject({ name: "Ana Souza", whatsapp: "+5551999998888", email: "ana@exemplo.com", noticeVersion: "2026-09-v1" });
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
    expect(next.record.status).toBe("received");
    // a reference of ANOTHER region never cancels anything
    const c = fresh("norte");
    await s.create({ ...c.input, replacesTokenHash: hashToken(b.token) });
    expect((await s.get(next.record.id))!.status).toBe("received");
  });

  test("given requests of two regions, when listed with filters, then region, status and text narrow the queue", async () => {
    const s = store();
    const sul = await s.create(fresh("sul", ["ZZZUNICO"]).input);
    await s.create(fresh("norte", ["ZZZUNICO"]).input);
    const onlySul = await s.list({ region: "sul", q: "zzzunico" }, 50, 0);
    expect(onlySul.rows.map((r) => r.id)).toEqual([sul.record.id]);
    expect((await s.list({ q: "zzzunico" }, 50, 0)).total).toBe(2);
    expect((await s.list({ region: "sul", status: "closed", q: "zzzunico" }, 50, 0)).total).toBe(0);
  });

  test("given the flow, when an operator moves the request, then only allowed moves work, contact is stamped by the human step, and the history records who did it", async () => {
    const s = store();
    const r = (await s.create(fresh().input)).record;
    expect((await s.setStatus(r.id, "artReady", "ana@x")).ok).toBe(false); // cannot skip the creation step
    expect((await s.setStatus(r.id, "customerContacted", "ana@x")).ok).toBe(false);
    expect((await s.setStatus(r.id, "inCreation", "ana@x", "começando a arte")).ok).toBe(true);
    expect((await s.get(r.id))!.contactedAt).toBeNull();
    expect((await s.setStatus(r.id, "artReady", "ana@x")).ok).toBe(true);
    const contacted = await s.setStatus(r.id, "customerContacted", "ana@x", "enviei o link no WhatsApp");
    expect(contacted.ok && contacted.record.contactedAt).toBeTruthy();
    expect((await s.setStatus(r.id, "closed", "ana@x")).ok).toBe(true);
    expect((await s.setStatus(r.id, "cancelled", "ana@x")).ok).toBe(false); // closed only reopens into creation
    const got = (await s.get(r.id))!;
    expect(got.events.map((e) => e.action)).toEqual(["created", "status", "status", "status", "status"]);
    expect(got.events[1]).toMatchObject({ actor: "ana@x", detail: "inCreation: começando a arte" });
    expect((await s.setStatus("01J0000000000000000000NOPE", "inCreation", "x")).ok).toBe(false);
  });

  test("given a note and a product link, when saved, then they are in the record and history; a cleared link disappears; an empty note is refused", async () => {
    const s = store();
    const r = (await s.create(fresh().input)).record;
    expect((await s.addNote(r.id, "ana@x", "   ")).ok).toBe(false);
    expect((await s.addNote(r.id, "ana@x", "pedi a grafia correta")).ok).toBe(true);
    const url = "https://www.usesul.com.br/usesul/product/pai-paranaense-x";
    const set = await s.setProductLink(r.id, url, "ana@x");
    expect(set.ok && set.record.productLink).toMatchObject({ url, setBy: "ana@x" });
    const cleared = await s.setProductLink(r.id, null, "ana@x");
    expect(cleared.ok && cleared.record.productLink).toBeNull();
    expect((await s.get(r.id))!.events.map((e) => e.action)).toEqual(["created", "note", "product-link", "product-link"]);
  });

  test("given open and finished requests, when counted, then only received / in creation / art ready count, per region", async () => {
    const s = store();
    const before = { sul: await s.countOpen(["sul"]), norte: await s.countOpen(["norte"]) };
    const a = (await s.create(fresh("sul").input)).record;
    const b = (await s.create(fresh("sul").input)).record;
    await s.create(fresh("norte").input);
    expect(await s.countOpen(["sul"])).toBe(before.sul + 2);
    expect(await s.countOpen(["sul", "norte"])).toBe(before.sul + before.norte + 3);
    expect(await s.countOpen([])).toBe(0);
    for (const to of ["inCreation", "artReady", "customerContacted"] as const) await s.setStatus(a.id, to, "ana@x");
    await s.setStatus(b.id, "cancelled", "ana@x");
    expect(await s.countOpen(["sul"])).toBe(before.sul);
  });

  test("given a name search, when listed, then the customer's name finds the request but a phone number or e-mail does not", async () => {
    const s = store();
    const named = await s.create({ ...fresh().input, contact: contact({ name: "Zuleide Quintanilha", whatsapp: "+5551988887777", email: "zu@exemplo.com" }) });
    expect((await s.list({ q: "quintanilha" }, 50, 0)).rows.map((r) => r.id)).toContain(named.record.id);
    expect((await s.list({ q: "988887777" }, 50, 0)).total).toBe(0);
    expect((await s.list({ q: "zu@exemplo" }, 50, 0)).total).toBe(0);
  });

  test("given expired requests, when purged, then the ones nobody is working on are removed and the ones being made stay", async () => {
    const s = store();
    const old = (h: string) => ({ ...fresh(h as "sul").input, expiresAt: new Date(Date.now() - 1000).toISOString() });
    const gone = (await s.create(old("sul"))).record;
    const kept = (await s.create(old("sul"))).record;
    await s.setStatus(kept.id, "inCreation", "ana@x");
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

describe("requests made before the manual-contact flow", () => {
  test("given a legacy record in the local file (old status, an order, no contact), when read and worked, then it maps to the new statuses, hides the order and keeps its history", async () => {
    const file = path.join(dir, "legacy-requests.json");
    const { writeFile } = await import("node:fs/promises");
    const base = { region: "sul", customizerId: "cz-1", customizerSlug: "pai", customizerName: "Pai", customizerVersion: 2, snapshot: snapshotOf(model), values: { fields: {}, lines: ["PAI"] }, idempotencyKey: "legacy-key-000000000001", createdAt: "2026-09-20T10:00:00.000Z", updatedAt: "2026-09-21T10:00:00.000Z", expiresAt: "2027-03-01T00:00:00.000Z" };
    await writeFile(file, JSON.stringify({ requests: [
      { ...base, id: "01J00000000000000000LEGA01", tokenHash: "a".repeat(64), status: "linkedToInkOrder", order: { store: "use-sul", number: "INK-1001", linkedBy: "ana@x", linkedAt: "2026-09-21T10:00:00.000Z" }, events: [{ at: "2026-09-20T10:00:00.000Z", actor: "customer", action: "created" }, { at: "2026-09-21T10:00:00.000Z", actor: "ana@x", action: "linked", detail: "INK-1001" }] },
      { ...base, id: "01J00000000000000000LEGA02", tokenHash: "b".repeat(64), idempotencyKey: "legacy-key-000000000002", status: "inReview", events: [] },
      { ...base, id: "01J00000000000000000LEGA03", tokenHash: "c".repeat(64), idempotencyKey: "legacy-key-000000000003", status: "awaitingOrderLink", events: [] },
    ] }));
    const s = fileRequestStore(file);
    const linked = (await s.get("01J00000000000000000LEGA01"))!;
    expect(linked).toMatchObject({ status: "closed", contact: null, contactedAt: null, productLink: null });
    expect(linked).not.toHaveProperty("order");
    expect(linked.events.map((e) => e.action)).toEqual(["created", "linked"]); // the history is kept
    expect((await s.get("01J00000000000000000LEGA02"))!.status).toBe("inCreation");
    expect((await s.get("01J00000000000000000LEGA03"))!.status).toBe("received");
    expect(await s.countOpen(["sul"])).toBe(2);
    expect((await s.setStatus("01J00000000000000000LEGA02", "artReady", "ana@x")).ok).toBe(true); // a legacy request can be worked in the new flow
  });

  test("given a Postgres database at 0004 with legacy rows, when 0005 is applied, then statuses are renamed in place and the store reads them without a contact", async () => {
    const legacyDb = await createPgliteDb();
    try {
      const all = loadMigrations(path.join(process.cwd(), "db", "migrations"));
      await migrate(legacyDb, all.filter((m: { version: string }) => m.version < "0005"));
      const ins = (id: string, status: string, key: string) => legacyDb.query(`insert into customization_request (id, token_hash, region, customizer_id, customizer_slug, customizer_name, customizer_version, snapshot, request_values, idempotency_key, expires_at, status) values ($1,$2,'sul','cz-1','pai','Pai',1,$3::jsonb,'{"fields":{},"lines":["PAI"]}'::jsonb,$4, now() + interval '30 days',$5)`, [id, id.toLowerCase().padEnd(64, "0").replace(/[^0-9a-f]/g, "0"), JSON.stringify(snapshotOf(model)), key, status]);
      await ins("01J00000000000000000CEGB01", "inReview", "legacy-pg-key-00000001");
      await ins("01J00000000000000000CEGB02", "fulfilled", "legacy-pg-key-00000002");
      await migrate(legacyDb, all);
      const s = pgRequestStore(legacyDb);
      expect(await s.get("01J00000000000000000CEGB01")).toMatchObject({ status: "inCreation", contact: null });
      expect(await s.get("01J00000000000000000CEGB02")).toMatchObject({ status: "closed", contact: null });
      expect(await s.countOpen(["sul"])).toBe(1);
    } finally {
      await legacyDb.close();
    }
  });
});
