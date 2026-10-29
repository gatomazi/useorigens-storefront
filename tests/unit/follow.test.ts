import { describe, expect, test } from "vitest";
import { defaultAppearance } from "@/lib/admin/draft-ops";
import { type RegionSlug } from "@/lib/geo/regions";
import { validateFollow, withFollowPart } from "@/lib/site-config/follow-schema";
import { followedDestination, followedDoc, withFollowing, withRegionName } from "@/lib/site-config/follow";
import { newPage } from "@/lib/site-config/pages";
import { sanitizeBundle } from "@/lib/site-config/sanitize";
import { buildSeedBundle } from "@/lib/site-config/seed";
import { validateScopeDoc, type Customizer, type Section } from "@/lib/site-config/schema";

const seed = () => buildSeedBundle({ metaPixelId: null, ga4MeasurementId: null });
const doc = (region: RegionSlug = "sul") => structuredClone(seed().docs[region]);
const carousel = (patch: Partial<Section> = {}): Section => ({ id: "custom-novidades", anchor: "novidades", headingId: "novidades-title", template: "product-carousel", active: true, title: "Novidades do {regiao}", analyticsSource: "homeCollection", layout: { variant: "poster", tone: "light", surface: "plain" }, source: { kind: "ink-category", store: "use-sul", collectionId: 10, limit: 6, order: "category" }, cta: { label: "Ver todos", dest: { kind: "collection-page", store: "use-sul", collectionId: 10 } }, appearance: defaultAppearance(), ...patch });
const model = (patch: Partial<Customizer> = {}): Customizer => ({ id: "cz-sul", slug: "natal-em-familia", name: "Natal", source: { store: "use-sul", collectionId: 10 }, fields: [{ key: "nome", label: "Nome", maxLength: 20, required: true, position: 1, type: "text" }], pageMockup: { assetId: "media-mockup", alt: "Camiseta", decorative: false }, cardImage: { assetId: "media-card", alt: "Card", decorative: false }, previewMode: "mockupWithTextSummary", active: true, version: 1, ...patch });

/** Sul with a tagged section, a carousel with `{regiao}` and an internal collection, an arrangement, a menu, a state page and a page. */
function sulWithStructure() {
  const sul = doc();
  const page = newPage({ id: "page-black", kind: "hotpage", slug: "black-friday", title: "Black do {regiao}", heroId: "page-black-hero" });
  sul.pages = [page];
  sul.home!.sections.splice(1, 0,
    carousel(),
    carousel({ id: "custom-so-sul", anchor: "so-sul", headingId: "so-sul-title", title: "Só da Sul", regions: ["sul"] }),
    carousel({ id: "custom-so-norte", anchor: "so-norte", headingId: "so-norte-title", title: "Lendas do Norte", regions: ["norte"] }),
    carousel({ id: "custom-links", anchor: "links", headingId: "links-title", title: "Links", cta: { label: "Black", dest: { kind: "route", path: "/sul/h/black-friday?x=1" } } }),
    carousel({ id: "custom-pr", anchor: "pr", headingId: "pr-title", title: "Paraná", cta: { label: "Paraná", dest: { kind: "route", path: "/sul/pr" } } }),
  );
  sul.homeTheme = "natal";
  sul.navigation = { statesBlock: { label: "Estados do Sul", visible: true, order: 20 } };
  sul.statePage = { hidden: ["showcase"] };
  sul.collections = { enabled: [{ store: "use-sul", collectionId: 99 }], menu: { top: [{ store: "use-sul", collectionId: 10 }], hidden: [], added: [] }, stateCategories: [{ store: "use-sul", collectionId: 10 }], arrangements: [{ store: "use-sul", collectionId: 10, productIds: ["1", "2"] }] };
  return sul;
}
const titles = (d: ReturnType<typeof doc>) => (d.home?.sections ?? []).map((s) => s.title);

describe("Seguir a Sul: o contrato", () => {
  test("só Norte e Centro-Oeste seguem, cada parte uma vez", () => {
    expect(validateFollow(["home", "pages"], "norte")).toMatchObject({ ok: true });
    expect(validateFollow(["home"], "sul").ok).toBe(false);
    expect(validateFollow(["home"], "global").ok).toBe(false);
    expect(validateFollow(["home", "home"], "norte").ok).toBe(false);
    expect(validateFollow(["tracking"], "norte").ok).toBe(false);
    const norte = withFollowPart(doc("norte"), "pages", true);
    expect(withFollowPart(norte, "home", true).follow).toEqual(["home", "pages"]);
    expect(withFollowPart(norte, "pages", false).follow).toBeUndefined();
    expect(validateScopeDoc({ ...doc("norte"), follow: ["home", "menu", "statePage", "pages"] })).toMatchObject({ ok: true });
  });

  test("a abertura e o rodapé não têm regiões; as demais seções aceitam uma ou mais", () => {
    const sul = doc();
    sul.home!.sections.splice(1, 0, carousel({ regions: ["sul", "norte"] }));
    expect(validateScopeDoc(sul)).toMatchObject({ ok: true });
    sul.home!.sections[0].regions = ["sul"];
    expect(validateScopeDoc(sul).ok).toBe(false);
    sul.home!.sections[0].regions = undefined;
    sul.home!.sections[1].regions = [];
    expect(validateScopeDoc(sul).ok).toBe(false);
  });

  test("uma lista de seguir inválida no arquivo publicado é ignorada sem derrubar a região", () => {
    const bundle = seed();
    const raw = structuredClone({ ...bundle, releaseId: "r1", docs: { ...bundle.docs, norte: { ...bundle.docs.norte, follow: ["tudo"] } } });
    const { bundle: read, diagnostics } = sanitizeBundle(raw, seed());
    expect(read!.docs.norte.follow).toBeUndefined();
    expect(read!.docs.norte.home).toEqual(bundle.docs.norte.home);
    expect(diagnostics.join(" ")).toContain("follow is invalid");
  });
});

describe("Seguir a Sul: o que o público vê", () => {
  test("a Sul só mostra as seções dela e troca {regiao} pelo nome", () => {
    const sul = followedDoc(sulWithStructure(), undefined, false);
    expect(titles(sul)).toContain("Novidades do Sul");
    expect(titles(sul)).toContain("Só da Sul");
    expect(titles(sul)).not.toContain("Lendas do Norte");
    expect(sul.pages![0].title).toBe("Black do Sul");
  });

  test("uma região que não segue nada mantém tudo o que é dela", () => {
    const norte = doc("norte");
    norte.navigation = { statesBlock: { label: "Nossos estados", visible: true, order: 20 } };
    expect(followedDoc(norte, sulWithStructure(), true)).toEqual(norte);
  });

  test("a home seguida vem da Sul, adaptada à região, com o tema em uso da Sul", () => {
    const norte = doc("norte");
    norte.follow = ["home"];
    const own = structuredClone(norte.home);
    const out = followedDoc(norte, sulWithStructure(), true);
    expect(titles(out)).toContain("Novidades do Norte");
    expect(titles(out)).toContain("Lendas do Norte");
    expect(titles(out)).not.toContain("Só da Sul");
    expect(out.homeTheme).toBe("natal");
    // The page is not followed: the link to it has nowhere to go. A link to a state of Sul neither.
    expect(out.home!.sections.find((s) => s.id === "custom-links")!.cta).toBeUndefined();
    expect(out.home!.sections.find((s) => s.id === "custom-pr")!.cta).toBeUndefined();
    // Sul's internal collection comes along, its order of products does not; the region's own home stays stored in its document.
    expect(out.collections!.enabled).toContainEqual({ store: "use-sul", collectionId: 99 });
    expect(out.collections!.arrangements).toBeUndefined();
    expect(norte.home).toEqual(own);
  });

  test("tema sazonal da Sul traz as cores dele; no tema original a região fica com as próprias", () => {
    const norte = doc("norte");
    norte.follow = ["home"];
    norte.theme = { mode: "override", colors: { brandPrimary: "#123456" } };
    const sul = sulWithStructure();
    sul.theme = { mode: "override", colors: { brandPrimary: "#000000" } };
    expect(followedDoc(norte, sul, true).theme).toEqual({ mode: "override", colors: { brandPrimary: "#000000" } });
    delete sul.homeTheme;
    const original = followedDoc(norte, sul, true);
    expect(original.theme).toEqual(norte.theme);
    expect(original.homeTheme).toBeUndefined();
  });

  test("com as páginas seguidas, os links da Sul passam a apontar para a região, e a página da região vence a da Sul", () => {
    const norte = doc("norte");
    norte.follow = ["home", "pages"];
    let out = followedDoc(norte, sulWithStructure(), true);
    expect(out.home!.sections.find((s) => s.id === "custom-links")!.cta!.dest).toEqual({ kind: "route", path: "/norte/h/black-friday?x=1" });
    expect(out.pages!.map((p) => p.title)).toEqual(["Black do Norte"]);
    norte.pages = [newPage({ id: "page-norte", kind: "hotpage", slug: "black-friday", title: "Black amazônica", heroId: "page-norte-hero" })];
    out = followedDoc(norte, sulWithStructure(), true);
    expect(out.pages!.map((p) => p.title)).toEqual(["Black amazônica"]);
  });

  test("menu e página do estado seguidos trazem a navegação, o menu de coleções e a hierarquia da Sul", () => {
    const norte = doc("norte");
    norte.follow = ["menu", "statePage"];
    norte.collections = { enabled: [], navbarGroups: { top: [{ store: "use-sul", collectionId: 5 }], more: [] }, stateRows: [{ store: "use-sul", collectionId: 5 }], descriptions: [{ store: "use-sul", collectionId: 5, text: "Do Norte" }] };
    const sul = sulWithStructure();
    sul.collections!.descriptions = [{ store: "use-sul", collectionId: 10, text: "Novidades" }];
    const out = followedDoc(norte, sul, true);
    expect(out.collections!.descriptions).toEqual([{ store: "use-sul", collectionId: 10, text: "Novidades" }]);
    expect(out.navigation!.statesBlock!.label).toBe("Estados do Norte");
    expect(out.collections!.menu).toEqual({ top: [{ store: "use-sul", collectionId: 10 }], hidden: [], added: [] });
    expect(out.collections!.navbarGroups).toBeUndefined();
    expect(out.collections!.stateCategories).toEqual([{ store: "use-sul", collectionId: 10 }]);
    expect(out.collections!.stateRows).toBeUndefined();
    expect(out.statePage).toEqual({ hidden: ["showcase"] });
    expect(out.home).toEqual(norte.home);
  });

  test("fora da loja única ninguém segue: cada região volta ao que é dela", () => {
    const bundle = seed();
    bundle.docs.sul = sulWithStructure();
    bundle.docs.norte.follow = ["home", "menu", "statePage", "pages"];
    const regional = withFollowing(bundle, () => false);
    expect(regional.docs.norte.home).toEqual(bundle.docs.norte.home);
    const single = withFollowing(bundle, () => true);
    expect(titles(single.docs.norte)).toContain("Novidades do Norte");
    expect(titles(single.docs["centro-oeste"])).toEqual(titles(bundle.docs["centro-oeste"]));
    expect(titles(single.docs.sul)).toContain("Novidades do Sul");
  });

  test("capas de estados e o card de personalização se ajustam à região", () => {
    const sul = doc();
    const states = sul.home!.sections.find((s) => s.template === "states")!;
    states.stateCovers = { PR: { assetId: "media-pr", alt: "Paraná", decorative: false } };
    sul.customizers = [model()];
    sul.home!.sections.splice(1, 0, carousel({ customizerCard: { customizerId: "cz-sul", title: "Natal", button: "Criar" } }));
    const norte = doc("norte");
    norte.follow = ["home"];
    let out = followedDoc(norte, sul, true);
    expect(out.home!.sections.find((s) => s.template === "states")!.stateCovers).toEqual({});
    expect(out.home!.sections[1].customizerCard).toBeUndefined();
    norte.customizers = [model({ id: "cz-norte" })];
    out = followedDoc(norte, sul, true);
    expect(out.home!.sections[1].customizerCard!.customizerId).toBe("cz-norte");
  });

  test("destinos: link para outra região fica como está; personalizar só se a região tiver o modelo", () => {
    const ctx = { to: "norte" as const, pages: [], sourceCustomizers: [], customizers: [] };
    expect(followedDestination({ kind: "route", path: "/centro-oeste" }, ctx)).toEqual({ kind: "route", path: "/centro-oeste" });
    expect(followedDestination({ kind: "route", path: "/sul/colecoes/natal#topo" }, ctx)).toEqual({ kind: "route", path: "/norte/colecoes/natal#topo" });
    expect(followedDestination({ kind: "route", path: "/sul/pa" }, ctx)).toEqual({ kind: "route", path: "/norte/pa" });
    expect(followedDestination({ kind: "route", path: "/sul/personalizar/natal" }, ctx)).toBeUndefined();
  });

  test("{regiao} vira o nome em qualquer texto, sem copiar o que não tem o marcador", () => {
    const s = carousel({ title: "Sem marcador" });
    expect(withRegionName(s, "norte")).toBe(s);
    expect(withRegionName({ a: ["do {regiao}"] }, "centro-oeste")).toEqual({ a: ["do Centro-Oeste"] });
  });
});

describe("Seguir a Sul no painel", () => {
  test("publicar mostra quando uma parte passa a seguir ou volta a ser própria", async () => {
    const { diffDocs } = await import("@/lib/admin/diff");
    const norte = doc("norte");
    const changes = diffDocs(norte, withFollowPart(norte, "home", true)).filter((c) => c.kind === "follow");
    expect(changes.map((c) => c.text)).toEqual(["Home: passa a seguir a Sul (a configuração própria do Norte fica guardada)"]);
    expect(diffDocs(withFollowPart(norte, "menu", true), norte).find((c) => c.kind === "follow")!.text).toContain("volta à configuração própria do Norte");
  });

  test("a operação de rascunho só aceita Norte e Centro-Oeste", async () => {
    const { applyOp } = await import("@/lib/admin/draft-ops");
    expect(applyOp(doc("norte"), { type: "set-follow", part: "statePage", on: true }, { newId: () => "x" })).toMatchObject({ ok: true, doc: { follow: ["statePage"] } });
    expect(applyOp(doc(), { type: "set-follow", part: "home", on: true }, { newId: () => "x" }).ok).toBe(false);
  });

  test("“Aparece em”: todas (ou nenhuma) marcadas = todas as regiões", async () => {
    const { parseSectionForm } = await import("@/lib/admin/section-form");
    const form = (checked: string[]) => ({ get: (n: string) => (n === "regions_field" ? "1" : checked.map((r) => `region_${r}`).includes(n) ? "on" : null) });
    const s = carousel();
    expect(parseSectionForm(form(["sul"]), s).regions).toEqual(["sul"]);
    expect(parseSectionForm(form(["norte", "centro-oeste"]), s).regions).toEqual(["norte", "centro-oeste"]);
    expect(parseSectionForm(form(["sul", "norte", "centro-oeste"]), s)).toHaveProperty("regions", undefined);
    expect(parseSectionForm(form([]), s)).toHaveProperty("regions", undefined);
    expect(parseSectionForm({ get: () => null }, s)).not.toHaveProperty("regions");
  });
});

describe("Seguir a Sul: imagens e produtos da região", () => {
  const img = (assetId: string) => ({ assetId, alt: assetId, decorative: false });
  const focal = { mobile: { x: 40, y: 60 }, desktop: { x: 50, y: 50 } };

  test("a estrutura vem da Sul; banner, produtos da abertura e capas são os da região", () => {
    const sul = sulWithStructure();
    const hero = sul.home!.sections[0];
    hero.appearance = { ...hero.appearance, image: { mobile: img("sul-hero") } };
    hero.featured = [{ store: "use-sul", productId: "111" }];
    const states = sul.home!.sections.find((s) => s.template === "states")!;
    states.stateCovers = { PR: img("capa-pr") };
    const norte = doc("norte");
    norte.follow = ["home"];
    norte.regional = [
      { sectionId: hero.id, appearance: { image: { mobile: img("norte-hero") }, focal }, featured: [{ store: "use-sul", productId: "222", image: img("banner-222") }], featuredRotation: "slide" },
      { sectionId: states.id, stateCovers: { PA: img("capa-pa") } },
      { sectionId: "secao-que-a-sul-tirou", appearance: { focal } },
    ];
    expect(validateScopeDoc(norte)).toMatchObject({ ok: true });
    const out = followedDoc(norte, sul, true);
    const outHero = out.home!.sections[0];
    expect(outHero.title).toBe(hero.title);
    expect(outHero.appearance.image).toEqual({ mobile: img("norte-hero") });
    expect(outHero.appearance.focal).toEqual(focal);
    expect(outHero.appearance.fill).toEqual(hero.appearance.fill);
    expect(outHero.featured).toEqual([{ store: "use-sul", productId: "222", image: img("banner-222") }]);
    expect(outHero.featuredRotation).toBe("slide");
    expect(out.home!.sections.find((s) => s.template === "states")!.stateCovers).toEqual({ PA: img("capa-pa") });
    // A section without an entry keeps Sul's own content.
    expect(out.home!.sections.find((s) => s.id === "custom-novidades")!.appearance).toEqual(sul.home!.sections.find((s) => s.id === "custom-novidades")!.appearance);
  });

  test("sem imagem na região = a seção fica sem a foto da Sul", () => {
    const sul = sulWithStructure();
    sul.home!.sections[1].appearance = { ...sul.home!.sections[1].appearance, image: { mobile: img("sul-banner") } };
    const norte = { ...doc("norte"), follow: ["home" as const], regional: [{ sectionId: sul.home!.sections[1].id, appearance: { focal } }] };
    expect(followedDoc(norte, sul, true).home!.sections[1].appearance.image).toBeUndefined();
  });

  test("as regras: só quem segue, um tipo por seção, capas de estados da própria região", () => {
    expect(validateScopeDoc({ ...doc(), regional: [{ sectionId: "seed-hero", appearance: { focal } }] }).ok).toBe(false);
    expect(validateScopeDoc({ ...doc("norte"), regional: [{ sectionId: "s1", featured: [], stateCovers: {} }] }).ok).toBe(false);
    expect(validateScopeDoc({ ...doc("norte"), regional: [{ sectionId: "s1", stateCovers: { PR: img("capa-pr") } }] }).ok).toBe(false);
    expect(validateScopeDoc({ ...doc("norte"), regional: [{ sectionId: "s1", stateCovers: { PA: img("capa-pa") } }, { sectionId: "s1", appearance: { focal } }] }).ok).toBe(false);
    expect(validateScopeDoc({ ...doc("norte"), regional: [{ sectionId: "s1", featured: [{ store: "use-norte", productId: "1" }] }] })).toMatchObject({ ok: true });
  });
});
