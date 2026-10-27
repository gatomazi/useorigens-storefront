import { describe, expect, it } from "vitest";
import { availableStudioFonts } from "@/lib/print-studio/font-server";
import { fontFamilyId, groupFontOptions, includeFontFamily, preferredFontVariant } from "@/lib/print-studio/font-options";
import { BUILTIN_FONTS, createPreset, parseProject, type PrintFont } from "@/lib/print-studio/model";
import { composeArtwork, initialArtworkEdits, validateArtwork } from "@/lib/customization/artwork";

describe("família Mont e seus arquivos de variação", () => {
  it("agrupa os arquivos em Mont, preservando as demais famílias e os pesos reais", async () => {
    const fonts = await availableStudioFonts();
    const families = groupFontOptions([...BUILTIN_FONTS, ...fonts, ...fonts]);
    expect(families.map((f) => f.name)).toEqual(["Hanken Grotesk", "Big Shoulders", "Bodoni Moda", "Mont"]);
    const mont = families.find((f) => f.id === "mont")!;
    expect(mont.variants.map((v) => [v.name, v.weight])).toEqual([["Extraleve", 200], ["Regular", 400], ["Regular itálico", 400], ["Negrito", 700], ["Pesado", 900]]);
    expect(preferredFontVariant(mont, 400).id).toBe("font-mont-pdf-regular");
    expect(preferredFontVariant(mont, 300).id).toBe("font-mont-pdf-regular");
    expect(preferredFontVariant(mont, 900).id).toBe("font-mont-heavy");
    expect(fontFamilyId("font-outra-fonte")).toBe("font-outra-fonte");
  });

  it("incorpora as variações ao modelo sem substituir um arquivo já preservado", async () => {
    const available = await availableStudioFonts();
    const original = { ...available.find((f) => f.id === "font-mont-heavy")!, name: "Arquivo da composição original", dataUrl: "data:application/octet-stream;base64,AA==" };
    const fonts = includeFontFamily([original], available, "font-mont-heavy");
    expect(fonts).toHaveLength(5);
    expect(fonts.find((f) => f.id === original.id)).toBe(original);
    expect(includeFontFamily(fonts, available, "font-mont-pdf-regular")).toEqual(fonts);
    expect(includeFontFamily([], available, "hanken")).toEqual([]);
  });

  it("mantém o arquivo e o peso da variação escolhida no envio e na composição reaberta", async () => {
    const project = { ...createPreset("peleia"), fonts: await availableStudioFonts() };
    for (const variant of groupFontOptions(project.fonts)[0].variants) {
      const edits = initialArtworkEdits(project);
      edits[0].fontId = variant.id;
      const checked = validateArtwork(project, "base-preservada", edits);
      expect(checked.ok).toBe(true);
      if (!checked.ok) continue;
      const reopened = parseProject(JSON.parse(JSON.stringify(composeArtwork(project, checked.artwork.layers))));
      expect(reopened.layers[0]).toMatchObject({ fontId: variant.id, weight: variant.weight });
      expect(reopened.fonts.find((f) => f.id === variant.id)?.dataUrl).toBe(project.fonts.find((f) => f.id === variant.id)?.dataUrl);
    }
  });

  it("reconhece projetos antigos com uma única variação e a Bold parcial", () => {
    const family = groupFontOptions([{ id: "font-mont-pdf-bold", name: "Mont Bold antiga", weight: 700 }])[0];
    expect(family.name).toBe("Mont");
    expect(family.variants).toEqual([{ id: "font-mont-pdf-bold", name: "Negrito (parcial)", weight: 700 }]);
  });

  it("permite uma variação já incorporada no limite de arquivos e só atribui seu peso ao escolhê-la", async () => {
    const available = await availableStudioFonts();
    const heavy = { ...available.find((f) => f.id === "font-mont-heavy")!, weight: undefined };
    const existing: PrintFont[] = [heavy, ...Array.from({ length: 19 }, (_, i) => ({ id: `font-extra-${i}`, name: `Extra ${i}`, dataUrl: "data:application/octet-stream;base64,AA==" }))];
    const selected = includeFontFamily(existing, available, heavy.id);
    expect(selected).toHaveLength(20);
    expect(selected[0]).toMatchObject({ weight: 900, dataUrl: heavy.dataUrl });
    expect(existing[0].weight).toBeUndefined();
    expect(includeFontFamily(existing, available, "font-mont-pdf-regular").length).toBeGreaterThan(20);
  });

  it("resolve peso omitido em uma escolha nova sem alterar solicitações antigas nem aceitar pesos arbitrários", async () => {
    const regular = { ...(await availableStudioFonts()).find((f) => f.id === "font-mont-pdf-regular")!, weight: undefined };
    const project = { ...createPreset("peleia"), fonts: [regular] };
    const edits = initialArtworkEdits(project);
    edits[0] = { ...edits[0], fontId: regular.id };
    expect(composeArtwork(project, edits).layers[0]).toMatchObject({ weight: 300 });
    expect(composeArtwork(project, edits).fonts[0].weight).toBeUndefined();
    const checked = validateArtwork(project, "base-preservada", [{ ...edits[0], weight: 900 }, edits[1]]);
    expect(checked.ok).toBe(true);
    if (!checked.ok) return;
    expect(checked.artwork.layers[0].weight).toBe(400);
    const composed = composeArtwork(project, checked.artwork.layers);
    expect(composed.layers[0]).toMatchObject({ fontId: regular.id, weight: 400 });
    expect(composed.fonts[0]).toMatchObject({ weight: 400, dataUrl: regular.dataUrl });
    expect(project.fonts[0].weight).toBeUndefined();
  });
});
