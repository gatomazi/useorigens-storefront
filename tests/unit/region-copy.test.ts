import { describe, expect, test } from "vitest";
import { buildRegionCopy, copyRequirements, suggestedCopyCollection, type CopyCollection, type CopyPart } from "@/lib/admin/region-copy";
import { defaultAppearance } from "@/lib/admin/draft-ops";
import { REGIONS, type RegionSlug } from "@/lib/geo/regions";
import { resolveTheme } from "@/lib/site-config/navigation";
import { newPage } from "@/lib/site-config/pages";
import { buildSeedBundle } from "@/lib/site-config/seed";
import { validateScopeDoc, type Customizer, type Section } from "@/lib/site-config/schema";
import { arrangementOf } from "@/lib/site-config/collections-enabled";
import { swapHomeTheme } from "@/lib/site-config/home-themes";

const doc = (region: RegionSlug = "sul") => structuredClone(buildSeedBundle({ metaPixelId: null, ga4MeasurementId: null }).docs[region]);
const collection = (store: CopyCollection["store"], id: number, overrides: Partial<CopyCollection> = {}): CopyCollection => ({ store, id, name: "Novidades", slug: "novidades", matchedCount: 6, isAvailable: true, ...overrides });
const collections = [collection("use-sul", 10), collection("use-norte", 20)];
function copy(source = doc(), destination = doc("norte"), part: CopyPart = "home", extra: Partial<Parameters<typeof buildRegionCopy>[0]> = {}) {
  let n = 0;
  return buildRegionCopy({ source, destination, part, mappings: { "use-sul:10": "20" }, collections, newId: () => `test${++n}`, ...extra });
}
function done(...args: Parameters<typeof copy>) {
  const result = copy(...args);
  if (!result.ok) throw new Error(result.errors.join(" | "));
  expect(validateScopeDoc(result.doc)).toMatchObject({ ok: true });
  return result;
}
const carousel = (patch: Partial<Section> = {}): Section => ({ id: "custom-source", anchor: "novidades", headingId: "novidades-title", template: "product-carousel", active: true, title: "Novidades", analyticsSource: "homeCollection", layout: { variant: "poster", tone: "light", surface: "plain" }, source: { kind: "ink-category", store: "use-sul", collectionId: 10, limit: 6, order: "manual", productIds: ["101", "102"], hiddenIds: ["103"] }, cta: { label: "Ver todos", dest: { kind: "collection-page", store: "use-sul", collectionId: 10 } }, appearance: defaultAppearance(), ...patch });
const withCarousel = () => {
  const source = doc();
  source.home!.sections.splice(1, 0, carousel());
  return source;
};
const model = (patch: Partial<Customizer> = {}): Customizer => ({ id: "cz-source", slug: "sua-frase", name: "Sua frase", source: { store: "use-sul", collectionId: 10 }, inkProductId: "123", fields: [{ key: "frase", label: "Frase", maxLength: 40, required: true, position: 1, type: "text" }], lineGroup: { key: "linhas", label: "Linhas", lineLabel: "Linha", min: 1, initial: 2, max: 4, maxLength: 40, defaults: ["Minha origem"] }, pageMockup: { assetId: "media-mockup", alt: "Camiseta com frase", decorative: false }, cardImage: { assetId: "media-card", alt: "Escolha uma frase", decorative: false }, previewMode: "mockupWithTextSummary", active: true, version: 4, ...patch });

describe("cópia regional de estruturas", () => {
  test("home e paleta são copiadas no tema em edição, preservando o tema em uso e sua configuração", () => {
    const source = doc();
    source.home!.sections[0].title = "Origem da cópia";
    const destination = doc("norte");
    destination.home = structuredClone(doc().home);
    const active = structuredClone(destination.home);
    const kept = structuredClone(destination.home!.sections);
    kept[0].title = "Tema editorial anterior";
    destination.homeThemes = { editorial: { sections: kept, theme: { mode: "inherit", colors: {} } } };
    const result = done(source, destination, "home", { destinationTheme: "editorial" });
    expect(result.doc.homeTheme).toBeUndefined();
    expect(result.doc.home).toEqual(active);
    expect(result.doc.homeThemes!.editorial!.sections[0].title).toBe("Origem da cópia");
    expect(result.summary.join(" ")).toContain("tema Editorial");
    const palette = done(source, destination, "theme", { destinationTheme: "editorial" });
    expect(palette.doc.theme).toEqual(destination.theme);
    expect(palette.doc.homeThemes!.editorial!.theme).toEqual({ mode: "override", colors: resolveTheme("sul", source, undefined).effective });
    expect(swapHomeTheme(result.doc, "editorial")!.home!.sections[0].title).toBe("Origem da cópia");
  });

  test("a loja única pode fornecer a coleção do destino sem copiar os IDs da curadoria de origem", () => {
    const source = withCarousel();
    const result = done(source, doc("norte"), "home", { targetStore: "use-sul", mappings: { "use-sul:10": "10" } });
    expect(result.doc.home!.sections[1].source).toEqual({ kind: "ink-category", store: "use-sul", collectionId: 10, order: "category", limit: 6 });
    expect(copy(source, doc("norte"), "home", { targetStore: "use-centro" }).ok).toBe(false);
  });

  test("links diretos para modelos usam o modelo ativo equivalente do destino", () => {
    const source = withCarousel();
    source.customizers = [model()];
    source.home!.sections[1].cta!.dest = { kind: "customizer", customizerId: "cz-source" };
    const destination = doc("norte");
    destination.customizers = [model({ id: "cz-target", source: { store: "use-norte", collectionId: 20 } })];
    expect(done(source, destination).doc.home!.sections[1].cta!.dest).toEqual({ kind: "customizer", customizerId: "cz-target" });
    destination.customizers[0].active = false;
    expect(done(source, destination).doc.home!.sections[1].cta).toBeUndefined();
  });
  test("copia a home completa, mantendo ordem e conteúdo e preservando as outras configurações de ambos os documentos", () => {
    const source = doc();
    const destination = doc("norte");
    destination.tracking = { meta: { mode: "override", id: "1234567890123" }, ga4: { mode: "disabled" } };
    destination.launched = false;
    destination.navigation = { categoriesBlock: { label: "Categorias próprias", visible: false, order: 5 } };
    destination.theme = { mode: "inherit", colors: {} };
    destination.promotions = { items: [] };
    destination.podio = { enabled: false };
    const beforeSource = structuredClone(source);
    const beforeDestination = structuredClone(destination);
    const result = done(source, destination);
    expect(result.doc.home!.sections.map((s) => [s.anchor, s.template, s.title, s.active, s.appearance])).toEqual(source.home!.sections.map((s) => [s.anchor, s.template, s.title, s.active, s.appearance]));
    expect(result.doc.home!.sections[0].template).toBe("hero");
    expect(result.doc.home!.sections.at(-1)!.template).toBe("footer");
    expect(result.doc.home!.sections.map((s) => s.id)).not.toEqual(source.home!.sections.map((s) => s.id));
    expect({ ...result.doc, home: undefined }).toEqual({ ...destination, home: undefined });
    expect(source).toEqual(beforeSource);
    expect(destination).toEqual(beforeDestination);
    result.doc.home!.sections[0].appearance.focal.mobile.x = 1;
    expect(source).toEqual(beforeSource);
  });

  test("substitui uma home existente e usa os produtos em destaque do destino, sem transportar produtos ou capas de estados da origem", () => {
    const source = doc();
    source.home!.sections[0].featured = [{ store: "use-sul", productId: "123" }];
    source.home!.sections.find((s) => s.template === "states")!.stateCovers = { PR: { assetId: "media-pr", alt: "Paraná", decorative: false } };
    const destination = doc("norte");
    destination.home = { sections: structuredClone(source.home!.sections).map((s) => ({ ...s, featured: s.template === "hero" ? [{ store: "use-norte", productId: "999" }] : undefined, stateCovers: undefined })) };
    const result = done(source, destination);
    expect(result.doc.home!.sections[0].featured).toEqual([{ store: "use-norte", productId: "999" }]);
    expect(result.doc.home!.sections.find((s) => s.template === "states")!.stateCovers).toEqual({});
    expect(result.warnings.join(" ")).toContain("capas de estados");
    expect(done(source).doc.home!.sections[0].featured).toEqual([]);
  });

  test("associa fontes, botões, links do menu e blocos à coleção real do destino e limpa os IDs de produtos", () => {
    const source = withCarousel();
    const s = source.home!.sections[1];
    s.nav = { label: "Novidades", dest: { kind: "ink-collection", store: "use-sul", collectionId: 10 } };
    source.home!.sections.splice(2, 0, { id: "custom-grid", anchor: "pecas", headingId: "pecas-title", template: "image-grid", active: true, title: "Peças", appearance: defaultAppearance(), grid: { columns: 2, aspect: "square", labels: "below" }, tiles: [{ label: "Novas", dest: { kind: "collection-page", store: "use-sul", collectionId: 10 } }, { label: "Tudo", dest: { kind: "route", path: "/sul" } }] });
    expect(copyRequirements(source, "home")).toEqual([{ store: "use-sul", collectionId: 10, products: true, publicOnly: true }]);
    const result = done(source);
    const copied = result.doc.home!.sections[1];
    expect(copied.source).toEqual({ kind: "ink-category", store: "use-norte", collectionId: 20, order: "category", limit: 6 });
    expect(copied.cta!.dest).toEqual({ kind: "collection-page", store: "use-norte", collectionId: 20 });
    expect(copied.nav!.dest).toEqual({ kind: "ink-collection", store: "use-norte", collectionId: 20 });
    expect(result.doc.home!.sections[2].tiles!.map((t) => t.dest)).toEqual([{ kind: "collection-page", store: "use-norte", collectionId: 20 }, { kind: "route", path: "/norte" }]);
  });

  test("recusa associações ausentes, de outra loja, com poucos produtos, antigas ou internas quando o botão exige INK pública", () => {
    const invalidMappings: Record<string, string>[] = [{}, { "use-sul:10": "10" }, { "use-sul:10": "999" }];
    for (const mappings of invalidMappings) expect(copy(withCarousel(), undefined, "home", { mappings }).ok).toBe(false);
    for (const overrides of [{ matchedCount: 2 }, { needsResync: true as const }]) expect(copy(withCarousel(), undefined, "home", { collections: [collections[0], collection("use-norte", 20, overrides)] }).ok).toBe(false);
    const source = withCarousel();
    source.home!.sections[1].cta!.dest.kind = "ink-collection";
    expect(copy(source, undefined, "home", { collections: [collections[0], collection("use-norte", 20, { isAvailable: false })] }).ok).toBe(false);
  });

  test("habilita só as coleções internas necessárias e conserva habilitações, menu e ordenação existentes do destino", () => {
    const destination = doc("norte");
    destination.collections = { enabled: [{ store: "use-norte", collectionId: 88 }], menu: { top: [{ store: "use-norte", collectionId: 88 }], hidden: [], added: [] }, arrangements: [{ store: "use-norte", collectionId: 20, productIds: ["777"], hiddenIds: ["778"] }] };
    const result = done(withCarousel(), destination, "home", { collections: [collections[0], collection("use-norte", 20, { isAvailable: false })] });
    expect(result.doc.collections).toEqual({ ...destination.collections, enabled: [...destination.collections.enabled, { store: "use-norte", collectionId: 20 }] });
    expect(result.warnings.join(" ")).toContain("será habilitada");
  });

  test("adapta links internos, remove botões regionais sem destino e mantém as grades com links seguros e avisos", () => {
    const source = doc();
    source.home!.sections[0].cta = { label: "Paraná", dest: { kind: "route", path: "/sul/pr/curitiba" } };
    const campaign = source.home!.sections.find((s) => s.template === "campaign")!;
    campaign.cta = { label: "Natal", dest: { kind: "page", pageKind: "hotpage", slug: "natal" } };
    campaign.nav = { label: "Natal", dest: { kind: "page", pageKind: "hotpage", slug: "natal" } };
    const result = done(source);
    expect(result.doc.home!.sections[0].cta).toBeUndefined();
    expect(result.doc.home!.sections.find((s) => s.template === "campaign")!.cta).toBeUndefined();
    expect(result.doc.home!.sections.find((s) => s.template === "campaign")!.nav).toEqual({ label: "Natal" });
    expect(result.warnings.join(" ")).toContain("destino não existe");
    campaign.cta = { label: "Loja", dest: { kind: "external", url: "https://www.usesul.com.br/produto/regional" } };
    expect(done(source).doc.home!.sections.find((s) => s.template === "campaign")!.cta!.dest).toEqual({ kind: "route", path: "/norte" });
  });

  test("preserva ordens e ocultos legados do destino antes de substituir a home, respeitando entradas explícitas", () => {
    const destination = doc("norte");
    const source = withCarousel();
    destination.home = { sections: structuredClone(source.home!.sections) };
    const legacy = destination.home.sections[1];
    legacy.source = { kind: "ink-category", store: "use-norte", collectionId: 20, order: "manual", productIds: ["99", "98"], hiddenIds: ["97"], limit: 6 };
    legacy.cta = undefined;
    const result = done(source, destination);
    expect(result.doc.collections!.arrangements).toEqual([{ store: "use-norte", collectionId: 20, productIds: ["99", "98"], hiddenIds: ["97"] }]);
    expect(arrangementOf(result.doc, "use-norte", 20)).toEqual(arrangementOf(destination, "use-norte", 20));
    destination.collections = { enabled: [], arrangements: [{ store: "use-norte", collectionId: 20 }] };
    expect(done(source, destination).doc.collections!.arrangements).toEqual(destination.collections.arrangements);
    destination.collections = undefined;
    legacy.source.productIds = [];
    expect(done(source, destination).doc.collections!.arrangements).toEqual([{ store: "use-norte", collectionId: 20, productIds: undefined, hiddenIds: ["97"] }]);
  });

  test("relaciona cards ao modelo equivalente do destino ou remove o vínculo ausente, preservando as seções", () => {
    const source = withCarousel();
    source.customizers = [model()];
    source.home!.sections[1].customizerCard = { customizerId: "cz-source", title: "Crie a sua", button: "Personalizar" };
    const destination = doc("norte");
    destination.customizers = [model({ id: "cz-target", source: { store: "use-norte", collectionId: 20 } })];
    expect(done(source, destination).doc.home!.sections[1].customizerCard!.customizerId).toBe("cz-target");
    expect(done(source).doc.home!.sections[1].customizerCard).toBeUndefined();
  });

  test("copia navegação e menu de coleções, adapta o rótulo padrão de estados e preserva os demais recursos", () => {
    const source = doc();
    source.navigation = { statesBlock: { label: "Estados do Sul", visible: false, order: 30 }, primaryBlock: { label: "Descubra", visible: true, order: 20 } };
    source.collections = { enabled: [], menu: { top: [{ store: "use-sul", collectionId: 10 }], hidden: [], added: [] } };
    const destination = doc("norte");
    const result = done(source, destination, "navigation");
    expect(result.doc.navigation).toEqual({ ...source.navigation, statesBlock: { ...source.navigation.statesBlock, label: "Estados do Norte" } });
    expect(result.doc.collections!.menu!.top).toEqual([{ store: "use-norte", collectionId: 20 }]);
    expect(result.doc.home).toEqual(destination.home);
    const menuOnly = done(source, destination, "collection-menu");
    expect(menuOnly.doc.navigation).toEqual(destination.navigation);
    // Old navbar selections still provide the source menu.
    source.collections = { enabled: [], navbar: [{ store: "use-sul", collectionId: 10 }] };
    expect(done(source, destination, "collection-menu").doc.collections!.menu!.top[0].collectionId).toBe(20);
  });

  test("copia as cores efetivas, inclusive padrões regionais e cores herdadas, como uma paleta própria completa", () => {
    const source = doc();
    source.theme = { mode: "inherit", colors: {} };
    const global = structuredClone(buildSeedBundle({ metaPixelId: null, ga4MeasurementId: null }).docs.global);
    global.theme = { mode: "override", colors: { headerBackground: "#123456" } };
    expect(done(source, undefined, "theme", { global }).doc.theme).toEqual({ mode: "override", colors: resolveTheme("sul", source, global).effective });
    expect(done(doc(), undefined, "theme").doc.theme!.colors.brandPrimary).not.toBe(resolveTheme("norte", doc("norte"), undefined).effective.brandPrimary);
  });

  test("copia cupons e promoções desativados, com IDs novos e os textos, códigos e períodos preservados", () => {
    const source = doc();
    source.promotions = { items: [{ id: "cupom-1", type: "coupon", enabled: true, title: "Bem-vindo", code: "OI10", description: "10% na primeira compra", order: 1, startsAt: "2026-10-01T00:00:00-03:00", endsAt: "2026-11-01T00:00:00-03:00" }] };
    const result = done(source, undefined, "promotions");
    expect(result.doc.promotions!.items[0]).toEqual({ ...source.promotions.items[0], id: "promo-test1", enabled: false });
    expect(result.warnings.join(" ")).toContain("não cadastra cupons na INK");
  });

  test("copia páginas individualmente, evita colisões de endereço e adapta autorreferências para a nova página", () => {
    const source = doc();
    const page = newPage({ id: "page-source", heroId: "ph-source", kind: "hotpage", slug: "natal", title: "Natal" });
    page.sections[0].cta = { label: "Começar", dest: { kind: "page", pageKind: "hotpage", slug: "natal" } };
    page.sections.push(carousel());
    page.seo = { title: "Natal na loja", indexable: true };
    source.pages = [page];
    const destination = doc("norte");
    destination.pages = [newPage({ id: "page-existing", heroId: "ph-existing", kind: "hotpage", slug: "natal", title: "Natal atual" })];
    const result = done(source, destination, "page", { sourceId: page.id });
    expect(result.doc.pages![0]).toEqual(destination.pages[0]);
    expect(result.doc.pages![1]).toMatchObject({ slug: "natal-2", version: 1, seo: { title: "Natal na loja", indexable: false } });
    expect(result.doc.pages![1].sections[0].cta!.dest).toEqual({ kind: "page", pageKind: "hotpage", slug: "natal-2" });
    expect(result.doc.pages![1].sections[1].source).toMatchObject({ store: "use-norte", collectionId: 20 });
    expect(result.doc.home).toEqual(destination.home);
    expect(result.focusId).toBe(result.doc.pages![1].id);
  });

  test("copia modelos e bases do estúdio, preservando campos e mockups, sem importar o checkout da outra loja", () => {
    const source = doc();
    source.customizers = [model()];
    const destination = doc("norte");
    destination.customizers = [model({ id: "cz-existing", source: { store: "use-norte", collectionId: 20 } })];
    const result = done(source, destination, "customizer", { sourceId: "cz-source" });
    const copied = result.doc.customizers![1];
    expect(copied).toMatchObject({ slug: "sua-frase-2", active: false, version: 1, fields: source.customizers[0].fields, lineGroup: source.customizers[0].lineGroup, pageMockup: source.customizers[0].pageMockup, source: { store: "use-norte", collectionId: 20 } });
    expect(copied.inkProductId).toBeUndefined();
    expect(result.doc.customizers![0]).toEqual(destination.customizers[0]);
    expect(result.doc.home).toEqual(destination.home);
    source.customizers = [model({ source: { kind: "umapenca", articleKind: "caneca" }, inkProductId: undefined })];
    expect(copyRequirements(source, "customizer", "cz-source")).toEqual([]);
    expect(done(source, destination, "customizer", { sourceId: "cz-source", mappings: {} }).doc.customizers![1].source).toEqual({ kind: "umapenca", articleKind: "caneca" });
  });

  test("sugere só equivalências inequívocas por nome ou slug; nunca usa um ID coincidente de outra loja", () => {
    const requirement = { store: "use-sul" as const, collectionId: 10, products: true, publicOnly: false };
    expect(suggestedCopyCollection(collections[0], [collections[1]], requirement)).toBe("20");
    expect(suggestedCopyCollection(collections[0], [collection("use-norte", 10, { name: "Outra", slug: "outra" })], requirement)).toBe("");
    expect(suggestedCopyCollection(collections[0], [collections[1], collection("use-norte", 21)], requirement)).toBe("");
    expect(suggestedCopyCollection(undefined, [collections[1]], requirement)).toBe("");
  });

  test("recusa a própria região, o escopo global, fontes vazias e objetos ausentes", () => {
    expect(copy(doc(), doc()).ok).toBe(false);
    expect(copy({ ...doc(), scope: "global" }).ok).toBe(false);
    expect(copy(doc("norte"), doc("centro-oeste")).ok).toBe(false);
    expect(copy(doc(), undefined, "promotions").ok).toBe(false);
    expect(copy(doc(), undefined, "page", { sourceId: "missing" }).ok).toBe(false);
    expect(copy(doc(), undefined, "customizer", { sourceId: "missing" }).ok).toBe(false);
  });

  test("funciona entre as três regiões sem modificar flags de lançamento ou tracking", () => {
    for (const from of ["sul", "norte", "centro-oeste"] as const) for (const to of ["sul", "norte", "centro-oeste"] as const) {
      if (from === to) continue;
      const source = doc(from);
      source.home = { sections: [ { id: "hero-original", anchor: "topo", headingId: "topo-title", template: "hero", active: true, appearance: defaultAppearance() }, { id: "footer-original", anchor: "footer", headingId: "footer-title", template: "footer", active: true, appearance: defaultAppearance() } ] };
      const destination = doc(to);
      const result = done(source, destination);
      expect(result.doc.scope).toBe(to);
      expect(result.doc.tracking).toEqual(destination.tracking);
      expect(result.doc.launched).toEqual(destination.launched);
      expect(result.doc.home!.sections[0].featured?.every((r) => r.store === REGIONS[to].storeKey)).toBe(true);
    }
  });
});
