import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { composeArtwork, initialArtworkEdits, publicArtworkBase, validateArtwork } from "@/lib/customization/artwork";
import { fileRequestStore } from "@/lib/customization/file-store";
import { createPreset, parseProject, type PrintProject } from "@/lib/print-studio/model";
import { summaryOf } from "@/lib/customization/validate";

const templateId = "1792427199785-94f180a0-474a-4a75-9fae-1fbdd72f2aa8";
const base = (): PrintProject => ({ ...createPreset("peleia"), fonts: [{ id: "font-mont", name: "Mont da base", weight: 900, dataUrl: "data:application/octet-stream;base64,AA==" }] });

describe("personalização visual do cliente", () => {
  test("aceita somente escolhas de textos visíveis, fontes da base e cores válidas", () => {
    const project = base();
    const edits = initialArtworkEdits(project);
    edits[0] = { ...edits[0], text: "  Minha   origem  ", fontId: "font-mont", color: "#FF0033" };
    const checked = validateArtwork(project, templateId, edits);
    expect(checked.ok).toBe(true);
    if (!checked.ok) return;
    expect(checked.artwork.layers[0]).toMatchObject({ text: "Minha origem", fontName: "Mont da base", color: "#ff0033" });
    expect(composeArtwork(project, edits).layers).toEqual(composeArtwork(project, checked.artwork.layers).layers);
    const composed = composeArtwork(project, checked.artwork.layers);
    expect(composed.layers[0]).toMatchObject({ x: project.layers[0].x, y: project.layers[0].y, fontId: "font-mont", weight: 900, maxWidth: 3570 });
    expect(parseProject(composed)).toEqual(composed);
    expect(project.layers[0]).toMatchObject({ kind: "text", text: "Não tá morto" });
  });

  test("recusa omissões, duplicação, camadas novas, texto longo, markup, quebras extras e fontes externas", () => {
    const project = base();
    const edits = initialArtworkEdits(project);
    for (const input of [undefined, {}, [], [edits[0], edits[0]], [{ ...edits[0], id: "imagem-ou-camada-privada" }, edits[1]]]) expect(validateArtwork(project, templateId, input).ok).toBe(false);
    for (const patch of [{ text: "" }, { text: "x".repeat(201) }, { text: "<img>" }, { text: "Oi\u0000" }, { text: "linha\nextra" }, { fontId: "font-de-outro-modelo" }, { color: "red" }, { color: "#000000;url(x)" }]) {
      expect(validateArtwork(project, templateId, [{ ...edits[0], ...patch }, edits[1]]).ok).toBe(false);
    }
    expect(validateArtwork({ ...project, layers: [] }, templateId, []).ok).toBe(false);
  });

  test("remove referência e textos ocultos e ignora tentativas de alterar posição ou enviar arquivos", () => {
    const project = base();
    project.reference = { name: "Referência interna", dataUrl: "data:image/png;base64,AA==", width: 1, height: 1 };
    project.layers.push({ ...project.layers[0], id: "interno", visible: false });
    const edits = initialArtworkEdits(project);
    const checked = validateArtwork(project, templateId, edits.map((e) => ({ ...e, x: 99999, fontSize: 2000, asset: { dataUrl: "external" } })));
    expect(checked.ok).toBe(true);
    if (!checked.ok) return;
    const result = composeArtwork(project, checked.artwork.layers);
    expect(publicArtworkBase(project).reference).toBeNull();
    expect(result.layers).toHaveLength(2);
    expect(result.layers[0]).toMatchObject({ x: 600, fontSize: 390 });
    expect(result.reference).toBeNull();
    expect(checked.artwork.layers[0]).not.toHaveProperty("asset");
  });

  test("guarda a base e os estilos com a solicitação, preserva idempotência e permite buscar pelo texto", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "origens-artwork-request-"));
    try {
      const project = base();
      const edits = initialArtworkEdits(project);
      edits[0].text = "Minha terra querida";
      const checked = validateArtwork(project, templateId, edits);
      if (!checked.ok) throw new Error("Dados da fixture inválidos");
      const store = fileRequestStore(path.join(directory, "requests.json"));
      const input = { region: "sul" as const, idempotencyKey: "artwork-test-request-123", tokenHash: "a".repeat(64), snapshot: { id: "cz-art", slug: "arte", name: "Sua arte", version: 1, fields: [] }, values: { fields: {}, lines: [], artwork: checked.artwork }, contact: { name: "Ana", email: "ana@example.com", confirmedAt: new Date().toISOString(), noticeVersion: "1" }, expiresAt: "2030-01-01T00:00:00.000Z" };
      const first = await store.create(input);
      expect((await store.create(input)).duplicate).toBe(true);
      const reopened = fileRequestStore(path.join(directory, "requests.json"));
      const record = await reopened.get(first.record.id);
      expect(record?.values.artwork).toEqual(checked.artwork);
      expect((await reopened.list({ q: "terra querida" }, 20, 0)).total).toBe(1);
      expect(summaryOf(record!.snapshot, record!.values)).toContainEqual({ label: "1. Frase · fonte", value: "Hanken Grotesk" });
      expect(composeArtwork(project, record!.values.artwork!.layers).layers[0]).toMatchObject({ text: "Minha terra querida" });
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});
