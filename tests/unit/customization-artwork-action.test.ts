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
vi.mock("@/lib/customization/artwork-server", () => ({ loadArtworkBase: async (id: string) => id === state.model?.studioTemplateId ? state.base : null }));
vi.mock("@/lib/pages/public", () => ({ publishedFor: (region: string) => region === "sul" ? { region: "sul", bundle: { docs: { sul: { customizers: [state.model] } } } } : null }));

import { submitCustomizationAction } from "@/app/[region]/personalizar/actions";
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
    state.model = { id: "cz-art", slug: "sua-arte", name: "Sua arte", source: { store: "use-sul", collectionId: 1 }, fields: [{ key: "antigo", label: "Campo antigo", required: true, type: "text", position: 1, maxLength: 10 }], studioTemplateId: templateId, previewMode: "mockupWithTextSummary", active: true, version: 2 };
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
    expect(await submitCustomizationAction({ ...input, artwork: { ...input.artwork, templateId: "1792427199785-00000000-0000-0000-0000-000000000000" } })).toMatchObject({ ok: false, message: expect.stringContaining("base deste modelo mudou") });
    expect(await submitCustomizationAction({ ...input, artwork: { templateId, layers: [] } })).toMatchObject({ ok: false });
    expect(await submitCustomizationAction({ ...input, contact: { ...contact, confirm: false } })).toMatchObject({ ok: false, errors: expect.arrayContaining([{ key: "contact.confirm", message: expect.any(String) }]) });
    expect((await state.store!.list({}, 20, 0)).total).toBe(1);
  });
});
