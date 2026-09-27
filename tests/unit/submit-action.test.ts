import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import type { Customizer } from "@/lib/site-config/schema";
import { fileRequestStore } from "@/lib/customization/file-store";
import type { RequestStore } from "@/lib/customization/requests";

// The action's own collaborators are replaced by small stand-ins: the model is "published" for Sul only, the store is a temp file, the client is anonymous.
const PIC = { assetId: "legacy:sul/fala-daqui-desktop", alt: "", decorative: true };
const model: Customizer = {
  id: "cz-1", slug: "pai-paranaense", name: "Pai Paranaense", source: { store: "use-sul", collectionId: 148122 }, previewMode: "mockupWithTextSummary", active: true, version: 3, pageMockup: PIC,
  fields: [{ key: "cidade", label: "Cidade", type: "text", required: true, maxLength: 20, position: 1 }],
};
let store: RequestStore;
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": `10.0.0.${Math.floor(Math.random() * 250)}` }) }));
vi.mock("@/lib/pages/public", () => ({
  publishedFor: (region: string) => (region === "sul" ? { region: "sul", bundle: { docs: { sul: { schemaVersion: 1, scope: "sul", customizers: [model] } } } } : null),
}));
vi.mock("@/lib/customization/server", () => ({ requestStoreOrNull: () => store, requestSecret: () => "unit-test-secret-with-more-than-thirty-two-characters" }));

const { submitCustomizationAction } = await import("@/app/[region]/personalizar/actions");
const KEY = () => `key-${Math.random().toString(36).slice(2)}-abcdefghijkl`.slice(0, 40);
const contact = { name: "Ana Souza", whatsapp: "(51) 99999-8888", email: "", confirm: true };
const base = () => ({ region: "sul", slug: "pai-paranaense", idempotencyKey: KEY(), fields: { cidade: "Santiago" }, lines: undefined, contact });

let dir: string;
beforeAll(async () => { dir = await mkdtemp(path.join(tmpdir(), "submit-")); });
afterAll(async () => { await rm(dir, { recursive: true, force: true }); });
beforeEach(() => { store = fileRequestStore(path.join(dir, `r-${Math.random().toString(36).slice(2)}.json`)); });

describe("submitCustomizationAction: the server re-validates everything", () => {
  test("given a valid request with only a WhatsApp, when submitted, then it is stored with the normalised contact and the answer carries masked channels, never the number", async () => {
    const r = await submitCustomizationAction(base());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.channels).toEqual(["WhatsApp final 8888"]);
    expect(r.shortReference).toMatch(/^[0-9A-Z]{8}$/);
    expect(JSON.stringify(r)).not.toMatch(/99999|Ana|Souza/);
    const [saved] = (await store.list({}, 10, 0)).rows;
    expect(saved).toMatchObject({ region: "sul", status: "received", customizerVersion: 3, contact: { name: "Ana Souza", whatsapp: "+5551999998888", noticeVersion: expect.any(String) } });
    expect(saved.contact!.email).toBeUndefined();
    expect(saved.contact!.confirmedAt).toBeTruthy();
  });

  test("given only an e-mail, or both channels, when submitted, then both are accepted", async () => {
    expect((await submitCustomizationAction({ ...base(), contact: { name: "Bruno", email: "Bruno@Exemplo.com", confirm: true } })).ok).toBe(true);
    expect((await submitCustomizationAction({ ...base(), contact: { ...contact, email: "ana@exemplo.com" } })).ok).toBe(true);
    const rows = (await store.list({}, 10, 0)).rows;
    expect(rows.map((x) => x.contact?.email).sort()).toEqual(["Bruno@exemplo.com", "ana@exemplo.com"]);
  });

  test.each([
    ["no contact at all", { contact: undefined }],
    ["no channel", { contact: { name: "Ana", confirm: true } }],
    ["an invalid WhatsApp", { contact: { ...contact, whatsapp: "12345" } }],
    ["an invalid e-mail", { contact: { name: "Ana", email: "x@", confirm: true } }],
    ["a missing name", { contact: { ...contact, name: "" } }],
    ["a missing confirmation", { contact: { ...contact, confirm: false } }],
    ["a confirmation that is not exactly true", { contact: { ...contact, confirm: "on" } }],
    ["markup in the name", { contact: { ...contact, name: "<script>" } }],
    ["a contact that is not an object", { contact: "Ana" }],
  ] as const)("given %s, when submitted (the browser's checks bypassed), then it is refused and nothing is stored", async (_why, patch) => {
    const r = await submitCustomizationAction({ ...base(), ...(patch as object) } as never);
    expect(r.ok).toBe(false);
    expect((await store.list({}, 10, 0)).total).toBe(0);
    if (!r.ok) expect(JSON.stringify(r)).not.toMatch(/12345|<script>|"Ana"/); // error messages never echo what was typed
  });

  test("given personalization values that break the model, when submitted with a good contact, then the personalization errors are reported too", async () => {
    const r = await submitCustomizationAction({ ...base(), fields: { cidade: "<b>x</b>" } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.map((e) => e.key)).toContain("cidade");
    const both = await submitCustomizationAction({ ...base(), fields: {}, contact: { name: "" } });
    expect(!both.ok && both.errors.map((e) => e.key).sort()).toEqual(["cidade", "contact.confirm", "contact.name", "contact.whatsapp"].sort());
  });

  test("given a region that has no published model, or an unknown slug, when submitted, then it is refused: no cross-region request exists", async () => {
    expect((await submitCustomizationAction({ ...base(), region: "norte" })).ok).toBe(false);
    expect((await submitCustomizationAction({ ...base(), region: "centro-oeste" })).ok).toBe(false);
    expect((await submitCustomizationAction({ ...base(), slug: "outro" })).ok).toBe(false);
    expect((await store.list({}, 10, 0)).total).toBe(0);
  });

  test("given the same idempotency key twice (a double click), when submitted, then one request exists and the second answer reports the duplicate with the same reference", async () => {
    const input = base();
    const first = await submitCustomizationAction(input);
    const second = await submitCustomizationAction(input);
    expect(first.ok && second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(second.duplicate).toBe(true);
      expect(second.reference).toBe(first.reference);
      expect(second.shortReference).toBe(first.shortReference);
    }
    expect((await store.list({}, 10, 0)).total).toBe(1);
  });

  test("given a request store whose create() rejects (a Postgres outage), when submitted, then the answer is a generic failure — never a fake success and never the reason echoed to the customer", async () => {
    const failing: RequestStore = { ...store, create: () => Promise.reject(new Error("connect ECONNREFUSED 127.0.0.1:1")) };
    store = failing;
    const r = await submitCustomizationAction(base());
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.message).toMatch(/[Nn]ão foi possível registrar/);
      expect(r.message).not.toMatch(/ECONNREFUSED|Postgres|pg_|connect/i);
    }
  });

  test("given an environment without a request store, when submitted, then the answer says so instead of pretending", async () => {
    store = null as unknown as RequestStore;
    const r = await submitCustomizationAction(base());
    expect(!r.ok && r.message).toMatch(/não está disponível/);
  });
});
