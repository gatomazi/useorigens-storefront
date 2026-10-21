import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { CollectionsSnapshot } from "@/lib/catalog/collections";
import type { CopyRequest } from "@/lib/admin/region-copy";
import type { Platform } from "@/lib/admin/platform";
import type { Actor } from "@/lib/admin/store/ports";
import type { HomeThemeName, PublishedBundle } from "@/lib/site-config/schema";

const state = vi.hoisted(() => ({ platform: null as unknown as Platform, seed: null as unknown as PublishedBundle, published: null as unknown as PublishedBundle, collections: { version: 2, stores: {} } as CollectionsSnapshot, actor: null as unknown as Actor, editingTheme: null as HomeThemeName | null }));
vi.mock("@/lib/admin/platform", () => ({ platform: () => state.platform }));
vi.mock("@/lib/admin/publishing", () => ({ seedForEnv: () => state.seed }));
vi.mock("@/lib/catalog/collections-file", () => ({ getCollections: () => state.collections }));
vi.mock("@/lib/admin/auth/guard", () => ({ requireAdmin: vi.fn(async () => state.actor) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (url: string): never => { throw new Error(`redirect:${url}`); } }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => state.editingTheme ? { value: state.editingTheme } : undefined }) }));

import { fileDraftRepository } from "@/lib/admin/local-store";
import { regionCopySources, reviewRegionCopy, saveRegionCopy } from "@/lib/admin/region-copy-service";
import { reviewRegionCopyAction, copyRegionConfigurationAction } from "@/app/admin/region-copy-actions";
import { requireAdmin } from "@/lib/admin/auth/guard";
import { buildSeedBundle } from "@/lib/site-config/seed";

const owner: Actor = { id: "owner-test", role: "owner", scopes: [], email: "owner@example.com", name: null };
const editor = (...scopes: Actor["scopes"]): Actor => ({ ...owner, id: "editor-test", role: "editor", scopes });
const request = (patch: Partial<CopyRequest> = {}): CopyRequest => ({ scope: "norte", fromScope: "sul", sourceVersion: "working", part: "home", sourceId: "", rev: null, mappings: {}, ...patch });
const form = (req = request(), checksum?: string) => {
  const fd = new FormData();
  for (const [key, value] of Object.entries(req)) fd.set(key, key === "mappings" ? JSON.stringify(value) : String(value));
  if (checksum) fd.set("checksum", checksum);
  return fd;
};
async function reviewed(req = request(), actor = owner) {
  const result = await reviewRegionCopy(actor, req);
  if (!result.ok) throw new Error(result.errors.join(" | "));
  return result;
}

describe("cópia regional: permissões, revisão e persistência", () => {
  let dir: string;
  beforeEach(async () => {
    vi.clearAllMocks();
    dir = await mkdtemp(path.join(tmpdir(), "origens-region-copy-"));
    state.seed = buildSeedBundle({ metaPixelId: null, ga4MeasurementId: null });
    state.published = structuredClone(state.seed);
    state.collections = { version: 2, stores: {} };
    state.actor = owner;
    state.editingTheme = null;
    state.platform = { drafts: fileDraftRepository(dir), files: { read: vi.fn(async () => state.published) }, audit: { record: vi.fn(async () => {}) } } as unknown as Platform;
  });
  afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

  test("revisar não grava nada; confirmar grava só o rascunho do destino e registra a origem na auditoria", async () => {
    const published = structuredClone(state.published);
    const review = await reviewed();
    expect(await state.platform.drafts.load("norte")).toBeNull();
    expect(await state.platform.drafts.load("sul")).toBeNull();
    expect(await saveRegionCopy(owner, request(), review.checksum)).toEqual({ ok: true });
    expect((await state.platform.drafts.load("norte"))?.doc.home?.sections.length).toBe(published.docs.sul.home!.sections.length);
    expect(await state.platform.drafts.load("sul")).toBeNull();
    expect(await state.platform.drafts.load("centro-oeste")).toBeNull();
    expect(await state.platform.drafts.load("global")).toBeNull();
    expect(state.published).toEqual(published);
    expect(state.platform.audit.record).toHaveBeenCalledWith(expect.objectContaining({ actor: owner.id, action: "draft.save", scope: "norte", target: "region.copy", meta: expect.objectContaining({ fromScope: "sul", part: "home", sourceVersion: "working" }) }));
  });

  test("trocar o tema em edição invalida a revisão e a confirmação grava no tema selecionado", async () => {
    const destination = state.published.docs.norte;
    destination.home = structuredClone(state.published.docs.sul.home);
    destination.homeThemes = { editorial: { sections: structuredClone(destination.home!.sections) } };
    const original = structuredClone(destination.home);
    const first = await reviewed();
    state.editingTheme = "editorial";
    expect(await saveRegionCopy(owner, request(), first.checksum)).toMatchObject({ ok: false });
    const second = await reviewed();
    expect(second.summary.join(" ")).toContain("tema Editorial");
    expect(await saveRegionCopy(owner, request(), second.checksum)).toEqual({ ok: true });
    const saved = (await state.platform.drafts.load("norte"))!.doc;
    expect(saved.home).toEqual(original);
    expect(saved.homeTheme).toBeUndefined();
    expect(saved.homeThemes!.editorial!.sections[0].id).not.toBe(original!.sections[0].id);
  });

  test("configuração atual usa o rascunho; publicada usa a versão no ar", async () => {
    const sourceDraft = structuredClone(state.published.docs.sul);
    sourceDraft.home!.sections[0].title = "Topo apenas no rascunho";
    await state.platform.drafts.save("sul", sourceDraft, null, null, owner.id);
    const reviewDraft = await reviewed();
    const reviewPublished = await reviewed(request({ sourceVersion: "published" }));
    expect(reviewDraft.summary.join(" ")).toContain("Topo apenas no rascunho");
    expect(reviewPublished.summary.join(" ")).not.toContain("Topo apenas no rascunho");
    const sourceBefore = await state.platform.drafts.load("sul");
    expect(await saveRegionCopy(owner, reviewPublished.request, reviewPublished.checksum)).toEqual({ ok: true });
    expect((await state.platform.drafts.load("norte"))!.doc.home!.sections[0].title).toBe(state.published.docs.sul.home!.sections[0].title);
    expect(await state.platform.drafts.load("sul")).toEqual(sourceBefore);
  });

  test("recusa editores sem acesso à origem ou ao destino, e não envia metadados de regiões não autorizadas", async () => {
    for (const actor of [editor("norte"), editor("sul"), editor("centro-oeste")]) {
      expect(await reviewRegionCopy(actor, request())).toMatchObject({ ok: false, errors: [expect.stringContaining("permissão")] });
      expect(await saveRegionCopy(actor, request(), "forged")).toMatchObject({ ok: false });
    }
    expect(await state.platform.drafts.load("norte")).toBeNull();
    expect(await regionCopySources(editor("norte"), "norte", "home")).toEqual({ sources: [], collections: [] });
    expect((await regionCopySources(editor("sul", "norte"), "norte", "home")).sources.map((s) => s.scope)).toEqual(["sul"]);
    const actor = editor("sul", "norte");
    const review = await reviewed(request(), actor);
    expect(await saveRegionCopy(actor, request(), review.checksum)).toEqual({ ok: true });
  });

  test("metadados da origem não incluem documentos, configuração de tracking ou dados de usuários", async () => {
    state.published.docs.sul.tracking = { meta: { mode: "override", id: "1234567890123456" }, ga4: { mode: "override", id: "G-SECRETO1234" } };
    const serialized = JSON.stringify(await regionCopySources(owner, "norte", "home"));
    expect(serialized).toContain("seções");
    expect(serialized).not.toContain("1234567890123456");
    expect(serialized).not.toContain("G-SECRETO1234");
    expect(serialized).not.toContain("tracking");
    expect(serialized).not.toContain("owner@example.com");
  });

  test("recusa destino alterado desde a renderização ou desde a revisão", async () => {
    const review = await reviewed();
    const competitor = structuredClone(state.published.docs.norte);
    competitor.navigation = { primaryBlock: { label: "Outra aba", order: 10, visible: true } };
    await state.platform.drafts.save("norte", competitor, null, null, owner.id);
    expect(await reviewRegionCopy(owner, request())).toMatchObject({ ok: false, errors: [expect.stringContaining("outra aba")] });
    expect(await saveRegionCopy(owner, request(), review.checksum)).toMatchObject({ ok: false, errors: [expect.stringContaining("outra aba")] });
    expect((await state.platform.drafts.load("norte"))!.doc).toEqual(competitor);
  });

  test("recusa origem ou versão publicada do destino alterada depois da revisão, inclusive sem rascunho persistido", async () => {
    const review = await reviewed();
    state.published.docs.sul.home!.sections[0].title = "Nova origem";
    expect(await saveRegionCopy(owner, request(), review.checksum)).toMatchObject({ ok: false, errors: [expect.stringContaining("mudaram desde a revisão")] });
    const second = await reviewed();
    state.published.docs.norte.navigation = { primaryBlock: { label: "Nova publicação", order: 10, visible: true } };
    expect(await saveRegionCopy(owner, request(), second.checksum)).toMatchObject({ ok: false });
    expect(await state.platform.drafts.load("norte")).toBeNull();
  });

  test("mantém a trava otimista quando uma edição acontece entre a leitura e a gravação", async () => {
    const review = await reviewed();
    const actualSave = state.platform.drafts.save;
    const competing = structuredClone(state.published.docs.norte);
    competing.theme = { mode: "inherit", colors: {} };
    state.platform.drafts.save = async (...args) => {
      await actualSave("norte", competing, null, null, owner.id);
      return actualSave(...args);
    };
    expect(await saveRegionCopy(owner, request(), review.checksum)).toMatchObject({ ok: false, errors: [expect.stringContaining("outra aba")] });
    expect((await state.platform.drafts.load("norte"))!.doc).toEqual(competing);
  });

  test("exige revisão e invalida a confirmação se parâmetros, associações ou catálogo forem alterados", async () => {
    expect(await saveRegionCopy(owner, request(), "")).toMatchObject({ ok: false, errors: [expect.stringContaining("Revise a cópia")] });
    const review = await reviewed();
    expect(await saveRegionCopy(owner, request({ part: "theme" }), review.checksum)).toMatchObject({ ok: false });
    expect(await saveRegionCopy(owner, request({ mappings: { "use-sul:10": "20" } }), review.checksum)).toMatchObject({ ok: false });
    state.collections.stores["use-norte"] = { commerceStoreKey: "use-norte", syncedAt: "2026-10-20T00:00:00Z", catalogSyncedAt: "2026-10-20T00:00:00Z", totalCount: 1, collections: [{ id: 20, name: "Nova", slug: "nova", position: 1, isAvailable: true, reportedProductCount: 3, matchedCount: 3, merchCount: 3, cityDesignCount: 0, memberIds: ["1", "2", "3"] }] };
    expect(await saveRegionCopy(owner, request(), review.checksum)).toMatchObject({ ok: false });
    expect(await state.platform.drafts.load("norte")).toBeNull();
  });

  test("a versão publicada permanece copiável quando só o rascunho da origem muda depois da revisão", async () => {
    const req = request({ sourceVersion: "published" });
    const review = await reviewed(req);
    const draft = structuredClone(state.published.docs.sul);
    draft.home!.sections[0].title = "Mudança não publicada";
    await state.platform.drafts.save("sul", draft, null, null, owner.id);
    expect(await saveRegionCopy(owner, req, review.checksum)).toEqual({ ok: true });
  });

  test("as actions autenticam cada chamada, recusam parâmetros adulterados e redirecionam após salvar o rascunho", async () => {
    for (const [field, value] of [["scope", "global"], ["scope", "invalid"], ["fromScope", "norte"], ["sourceVersion", "arbitrary"], ["part", "tracking"], ["part", "__proto__"], ["rev", "NaN"], ["rev", "0"], ["rev", ""], ["mappings", "[]"], ["mappings", '{"use-sul:10":20}']]) {
      const fd = form();
      fd.set(field, value);
      expect(await reviewRegionCopyAction(fd)).toMatchObject({ ok: false });
    }
    expect(requireAdmin).toHaveBeenCalledWith({ mutation: true });
    const review = await reviewRegionCopyAction(form());
    expect(review.ok).toBe(true);
    if (!review.ok) return;
    await expect(copyRegionConfigurationAction(form(request(), review.checksum))).rejects.toThrow("redirect:/admin/home?ok=");
    expect((await state.platform.drafts.load("norte"))!.rev).toBe(1);
    expect(await state.platform.drafts.load("sul")).toBeNull();
  });
});
