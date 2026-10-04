import { describe, expect, test } from "vitest";
import { applyOp } from "@/lib/admin/draft-ops";
import { parseCustomizerForm, parseOrigin } from "@/lib/admin/customizer-form";
import { seedForEnv } from "@/lib/admin/publishing";
import { customizerProblems } from "@/lib/admin/validate-draft";
import { productLinkFor } from "@/lib/customization/requests";
import { snapshotOf } from "@/lib/customization/validate";
import { customizerProductLabel, validateCustomizer, type Customizer, type PublishedBundle, type ScopeDoc } from "@/lib/site-config/schema";
import { createYourOwnCards } from "@/lib/umapenca/customizer-cards";

let n = 0;
const ctx = () => ({ newId: () => `u${++n}` });
const start = (scope: "sul" | "norte" = "sul"): ScopeDoc => structuredClone(seedForEnv().docs[scope]);
const CANECA = { kind: "umapenca", articleKind: "caneca" } as const;
const PIC = { assetId: "up-mockup", alt: "Caneca Pai Paranaense", decorative: false };
const FIELD = { key: "frase", label: "Frase", required: true, maxLength: 30, position: 1, type: "text" as const };
const umaPencaModel = (patch: Partial<Customizer> = {}): Customizer => ({ id: "cz-up", slug: "caneca-pai", name: "Caneca do Pai", source: CANECA, fields: [FIELD], previewMode: "mockupWithTextSummary", active: true, pageMockup: PIC, version: 1, ...patch });

describe("Uma Penca personalization models (contract and draft)", () => {
  test("given any region, when an Uma Penca model is created, then it is valid without an INK collection (no region store rule applies)", () => {
    for (const region of ["sul", "norte"] as const) {
      const r = applyOp(start(region), { type: "create-customizer", name: "Caneca do Pai", source: CANECA }, ctx());
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.doc.customizers!.at(-1)).toMatchObject({ slug: "caneca-do-pai", source: CANECA, active: false });
    }
  });

  test("an unknown article kind, or an INK product on an Uma Penca model, is refused; an INK model is unchanged", () => {
    expect(validateCustomizer(umaPencaModel({ source: { kind: "umapenca", articleKind: "bone" as never } }), "sul").ok).toBe(false);
    expect(validateCustomizer(umaPencaModel({ inkProductId: "123" }), "sul").ok).toBe(false);
    expect(validateCustomizer(umaPencaModel(), "sul").ok).toBe(true);
    expect(validateCustomizer(umaPencaModel({ source: { store: "use-sul", collectionId: 1 } }), "sul").ok).toBe(true);
  });

  test("given a complete Uma Penca model, then nothing blocks its publish; it still needs a mockup and a field like any model", () => {
    const doc = start();
    expect(customizerProblems(doc, umaPencaModel())).toEqual([]);
    expect(customizerProblems(doc, umaPencaModel({ fields: [] })).join()).toMatch(/ao menos um campo/);
    expect(customizerProblems(doc, umaPencaModel({ pageMockup: undefined })).join()).toMatch(/mockup/);
  });

  test("labels follow the product", () => {
    expect(customizerProductLabel(CANECA)).toBe("Caneca");
    expect(customizerProductLabel({ kind: "umapenca", articleKind: "ecobag" })).toBe("Ecobag");
    expect(customizerProductLabel({ store: "use-sul", collectionId: 1 })).toBe("Camiseta");
  });
});

describe("model editor: origin", () => {
  const form = (entries: Record<string, string>) => ({ get: (name: string) => (name in entries ? entries[name] : null) });
  const ink: Customizer = { ...umaPencaModel(), source: { store: "use-sul", collectionId: 148122 }, inkProductId: "999" };

  test("parseOrigin: only the known kinds are Uma Penca; anything else (or nothing) is INK, the shape every existing model has", () => {
    expect(parseOrigin("umapenca:caneca")).toEqual({ kind: "umapenca", articleKind: "caneca" });
    expect(parseOrigin("umapenca:ecobag")).toEqual({ kind: "umapenca", articleKind: "ecobag" });
    expect(parseOrigin("umapenca:bone")).toEqual({ kind: "ink" });
    expect(parseOrigin("")).toEqual({ kind: "ink" });
  });

  test("given an INK model switched to Uma Penca ecobag, then the source changes and its INK product is dropped", () => {
    const { patch, errors } = parseCustomizerForm(form({ name: "X", source_origin: "umapenca:ecobag", source_collection: "use-sul:148122" }), ink, { store: "use-sul" }, { slugLocked: false });
    expect(errors).toEqual([]);
    expect(patch.source).toEqual({ kind: "umapenca", articleKind: "ecobag" });
    expect("inkProductId" in patch && patch.inkProductId === undefined).toBe(true);
  });

  test("given an Uma Penca model switched back to INK, then a collection of the region's store is required", () => {
    const current = umaPencaModel();
    expect(parseCustomizerForm(form({ name: "X", source_origin: "ink" }), current, { store: "use-sul" }, { slugLocked: false }).errors[0]).toMatch(/coleção da INK/);
    expect(parseCustomizerForm(form({ name: "X", source_origin: "ink", source_collection: "use-sul:148122" }), current, { store: "use-sul" }, { slugLocked: false }).patch.source).toEqual({ store: "use-sul", collectionId: 148122 });
  });

  test("an editor form without the origin field keeps behaving exactly as before (INK)", () => {
    expect(parseCustomizerForm(form({ name: "X", source_collection: "use-sul:148122" }), ink, { store: "use-sul" }, { slugLocked: false }).patch.source).toEqual({ store: "use-sul", collectionId: 148122 });
  });
});

describe("requests of an Uma Penca model", () => {
  test("the request freezes the origin, and the product link must then be an Uma Penca page — never the INK store, and never the other way round", () => {
    const snapshot = snapshotOf(umaPencaModel());
    expect(snapshot.store).toBe("umapenca");
    expect(snapshotOf({ ...umaPencaModel(), source: { store: "use-sul", collectionId: 1 } }).store).toBeUndefined();

    expect(productLinkFor("sul", "https://umapenca.com/useorigens/caneca/do-pai-1.html#x", "umapenca")).toEqual({ ok: true, url: "https://umapenca.com/useorigens/caneca/do-pai-1.html" });
    expect(productLinkFor("sul", "https://artigos.useorigens.com.br/caneca/la-de-acegua-426949.html", "umapenca")).toEqual({ ok: true, url: "https://artigos.useorigens.com.br/caneca/la-de-acegua-426949.html" });
    expect(productLinkFor("sul", "https://artigos.useorigens.com.br/caneca/x.html").ok).toBe(false);
    expect(productLinkFor("sul", "https://www.usesul.com.br/usesul/product/1", "umapenca").ok).toBe(false);
    expect(productLinkFor("sul", "https://umapenca.com.evil.io/x", "umapenca").ok).toBe(false);
    expect(productLinkFor("sul", "http://umapenca.com/x", "umapenca").ok).toBe(false);
    expect(productLinkFor("sul", "https://umapenca.com/useorigens/x").ok).toBe(false);
    expect(productLinkFor("sul", "https://www.usesul.com.br/usesul/product/1").ok).toBe(true);
  });
});

describe("“Crie a sua” cards on Outros artigos", () => {
  const media = { "up-mockup": { src: "https://media.example/up.jpg", width: 800, height: 1000 } } as unknown as PublishedBundle["media"];
  const docWith = (...models: Customizer[]): ScopeDoc => ({ ...start(), customizers: models });

  test("given the region's active Uma Penca models, then each kind gets its own cards, in CMS order, leading to the personalization page", () => {
    const doc = docWith(umaPencaModel(), umaPencaModel({ id: "cz-bag", slug: "ecobag-praia", name: "Ecobag Praia", source: { kind: "umapenca", articleKind: "ecobag" } }));
    expect(createYourOwnCards(doc, media, "sul", "caneca")).toEqual([
      { id: "cz-up", href: "/sul/personalizar/caneca-pai", title: "Caneca do Pai", image: { src: "https://media.example/up.jpg", width: 800, height: 1000, alt: "Caneca Pai Paranaense" } },
    ]);
    expect(createYourOwnCards(doc, media, "sul", "ecobag").map((c) => c.href)).toEqual(["/sul/personalizar/ecobag-praia"]);
  });

  test("inactive, INK, image missing from the bundle, or another region's document: no card, never a broken one", () => {
    expect(createYourOwnCards(docWith(umaPencaModel({ active: false })), media, "sul", "caneca")).toEqual([]);
    expect(createYourOwnCards(docWith(umaPencaModel({ source: { store: "use-sul", collectionId: 1 } })), media, "sul", "caneca")).toEqual([]);
    expect(createYourOwnCards(docWith(umaPencaModel({ pageMockup: { ...PIC, assetId: "gone" } })), media, "sul", "caneca")).toEqual([]);
    expect(createYourOwnCards(docWith(umaPencaModel()), media, "norte", "caneca")).toEqual([]);
    expect(createYourOwnCards(undefined, media, "sul", "caneca")).toEqual([]);
  });
});
