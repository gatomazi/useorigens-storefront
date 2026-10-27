import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import type { RequestStore } from "@/lib/customization/requests";
import type { Customizer } from "@/lib/site-config/schema";
import type { PrintProject } from "@/lib/print-studio/model";

const state = vi.hoisted(() => ({ model: null as Customizer | null, store: null as RequestStore | null, base: null as PrintProject | null }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "127.0.0.1" }) }));
vi.mock("@/lib/admin/auth/rate-limit", () => ({ allow: () => true }));
vi.mock("@/lib/customization/server", () => ({ requestStoreOrNull: () => state.store, requestSecret: () => "unit-test-reference-secret-only" }));
vi.mock("@/lib/customization/artwork-server", () => ({ loadArtworkBase: async (id: string) => id === "1792427199786-94f180a0-474a-4a75-9fae-1fbdd72f2aa9" ? { ...state.base!, name: "Feliz tudo · camiseta clara" } : id.startsWith("1792427199") ? state.base : null }));
vi.mock("@/lib/pages/public", () => ({ publishedFor: (region: string) => region === "sul" ? { region: "sul", bundle: { docs: { sul: { customizers: [state.model] } } } } : null }));

import { loadArtworkBaseAction, submitCustomizationAction } from "@/app/[region]/personalizar/actions";
import { fileRequestStore } from "@/lib/customization/file-store";
import { createPreset } from "@/lib/print-studio/model";
import { initialArtworkEdits } from "@/lib/customization/artwork";

describe("envio público da arte para a fila existente", () => {
  let directory: string;
  const templateId = "1792427199785-94f180a0-474a-4a75-9fae-1fbdd72f2aa8";
  const contact = { name: "Ana Souza", email: "ana@example.com", confirm: true };
  beforeAll(async () => {
    directory = await mkdtemp(path.join(tmpdir(), "origens-artwork-action-"));
    state.store = fileRequestStore(path.join(directory, "requests.json"));
    state.base = createPreset("peleia");
    state.model = { id: "cz-art", slug: "sua-arte", name: "Sua arte", source: { store: "use-sul", collectionId: 1 }, fields: [{ key: "antigo", label: "Campo antigo", required: true, type: "text", position: 1, maxLength: 10 }], studioArts: [{ label: "Sua arte", versions: [{ templateId }] }], previewMode: "mockupWithTextSummary", active: true, version: 2 };
  });
  afterAll(async () => { await rm(directory, { recursive: true, force: true }); });

  test("valida o modelo publicado, guarda a composição sem exigir campos substituídos e repete sem duplicar", async () => {
    const edits = initialArtworkEdits(state.base!);
    edits[0].text = "Orgulho da minha terra";
    const input = { region: "sul", slug: "sua-arte", idempotencyKey: "same-public-artwork-key", contact, artwork: { templateId, layers: edits } };
    const result = await submitCustomizationAction(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.summary).toContainEqual({ label: "1. Frase", value: "Orgulho da minha terra" });
    expect(result.channels).toEqual(["a***@example.com"]);
    const duplicate = await submitCustomizationAction(input);
    expect(duplicate).toMatchObject({ ok: true, duplicate: true, reference: result.reference });
    const stored = await state.store!.list({}, 20, 0);
    expect(stored.total).toBe(1);
    expect(stored.rows[0]).toMatchObject({ status: "received", customizerVersion: 2, values: { fields: {}, lines: [], artwork: { templateId } }, contact: { name: "Ana Souza", email: "ana@example.com" } });
  });

  test("recusa base trocada, camadas incompletas e contato sem confirmação antes de salvar", async () => {
    const input = { region: "sul", slug: "sua-arte", idempotencyKey: "rejected-artwork-key", contact, artwork: { templateId, layers: initialArtworkEdits(state.base!) } };
    expect(await submitCustomizationAction({ ...input, artwork: { ...input.artwork, templateId: "1792427199785-00000000-0000-0000-0000-000000000000" } })).toMatchObject({ ok: false, message: expect.stringContaining("arte deste modelo mudou") });
    expect(await submitCustomizationAction({ ...input, artwork: { templateId, layers: [] } })).toMatchObject({ ok: false });
    expect(await submitCustomizationAction({ ...input, contact: { ...contact, confirm: false } })).toMatchObject({ ok: false, errors: expect.arrayContaining([{ key: "contact.confirm", message: expect.any(String) }]) });
    expect((await state.store!.list({}, 20, 0)).total).toBe(1);
  });
  test("aceita a versão para camiseta clara do mesmo modelo e registra a base escolhida", async () => {
    const lightId = "1792427199786-94f180a0-474a-4a75-9fae-1fbdd72f2aa9";
    const single = state.model!;
    state.model = { ...single, studioArts: [{ label: "Feliz tudo", versions: [{ templateId, lightTemplateId: lightId }] }, { label: "Outra", versions: [{ label: "Adulto", templateId: "1792427199787-94f180a0-474a-4a75-9fae-1fbdd72f2aaa" }, { label: "Infantil", templateId: "1792427199788-94f180a0-474a-4a75-9fae-1fbdd72f2aab" }] }] };
    try {
      const result = await submitCustomizationAction({ region: "sul", slug: "sua-arte", idempotencyKey: "light-shirt-artwork-key", contact, artwork: { templateId: lightId, layers: initialArtworkEdits(state.base!) } });
      expect(result).toMatchObject({ ok: true, summary: expect.arrayContaining([{ label: "Arte escolhida", value: "Feliz tudo" }, { label: "Base da arte", value: "Feliz tudo · camiseta clara" }]) });
      const kids = await submitCustomizationAction({ region: "sul", slug: "sua-arte", idempotencyKey: "kids-version-artwork-key", contact, artwork: { templateId: "1792427199788-94f180a0-474a-4a75-9fae-1fbdd72f2aab", layers: initialArtworkEdits(state.base!) } });
      expect(kids).toMatchObject({ ok: true, summary: expect.arrayContaining([{ label: "Arte escolhida", value: "Outra · Infantil" }]) });
      // Only the model's own bases are served to the page, never another saved template.
      expect(await loadArtworkBaseAction({ region: "sul", slug: "sua-arte", templateId: lightId })).toMatchObject({ name: "Feliz tudo · camiseta clara" });
      expect(await loadArtworkBaseAction({ region: "sul", slug: "sua-arte", templateId: "1792427199789-94f180a0-474a-4a75-9fae-1fbdd72f2aac" })).toBeNull();
      expect(await loadArtworkBaseAction({ region: "sul", slug: "outro", templateId: lightId })).toBeNull();
      // A family order: other arts of the same model, once each; the free-text base of this test has no fields, so it is refused.
      const family = { region: "sul", slug: "sua-arte", contact, artwork: { templateId: "1792427199787-94f180a0-474a-4a75-9fae-1fbdd72f2aaa", layers: initialArtworkEdits(state.base!), also: ["1792427199788-94f180a0-474a-4a75-9fae-1fbdd72f2aab"] } };
      expect(await submitCustomizationAction({ ...family, idempotencyKey: "family-free-text-key" })).toMatchObject({ ok: false, message: expect.stringContaining("lista de artes") });
      expect(await submitCustomizationAction({ ...family, idempotencyKey: "family-unknown-key", artwork: { ...family.artwork, also: ["1792427199789-94f180a0-474a-4a75-9fae-1fbdd72f2aac"] } })).toMatchObject({ ok: false });
      expect(await submitCustomizationAction({ ...family, idempotencyKey: "family-repeat-key", artwork: { ...family.artwork, also: [family.artwork.templateId] } })).toMatchObject({ ok: false });
      const stored = await state.store!.list({}, 20, 0);
      expect(stored.rows.find((r) => r.values.artwork?.templateId === lightId)).toBeDefined();
    } finally { state.model = single; }
  });

  test("grava um pedido de família: a mesma resposta em outra arte do modelo", async () => {
    const [adult, kids] = ["1792427199787-94f180a0-474a-4a75-9fae-1fbdd72f2aaa", "1792427199788-94f180a0-474a-4a75-9fae-1fbdd72f2aab"];
    const plain = state.base!;
    const single = state.model!;
    const slotted = createPreset("peleia");
    slotted.layers[0] = { ...slotted.layers[0], kind: "text", text: "Silva", slot: { field: "sobrenome", label: "Sobrenome da família", template: "{sobrenome}", textCase: "title", maxLength: 20, example: "Silva" } } as typeof slotted.layers[0];
    state.base = slotted;
    state.model = { ...single, studioArts: [{ label: "Eu vim pela ceia", versions: [{ label: "Adulto", templateId: adult }, { label: "Infantil", templateId: kids }] }] };
    try {
      const result = await submitCustomizationAction({ region: "sul", slug: "sua-arte", idempotencyKey: "family-order-ok-key", contact, artwork: { templateId: adult, fields: { sobrenome: "dos Santos" }, also: [kids] } });
      expect(result).toMatchObject({ ok: true, summary: expect.arrayContaining([{ label: "Arte escolhida 1", value: "Eu vim pela ceia · Adulto" }, { label: "Arte escolhida 2", value: "Eu vim pela ceia · Infantil" }, { label: "Sobrenome da família", value: "dos Santos" }]) });
      const stored = (await state.store!.list({}, 50, 0)).rows.find((r) => r.values.artwork?.templateId === adult);
      expect(stored?.values.moreArtwork).toEqual([expect.objectContaining({ templateId: kids, choice: "Eu vim pela ceia · Infantil" })]);
    } finally { state.base = plain; state.model = single; }
  });
});
