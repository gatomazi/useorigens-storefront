import { describe, expect, test } from "vitest";
import { personalizationCards } from "@/lib/customization/hub";
import type { Customizer, PublishedBundle, ScopeDoc } from "@/lib/site-config/schema";

const T = "1793300715844-02b539b5-caf7-4e18-b9cf-0a245d34827c";
const media = { "img-placa": { src: "/m/placa.webp", width: 800, height: 800 }, "img-natal": { src: "/m/natal.webp", width: 800, height: 800 } } as unknown as PublishedBundle["media"];
const model = (over: Partial<Customizer>): Customizer => ({
  id: "cz", slug: "x", name: "X", source: { store: "use-sul", collectionId: 1 }, fields: [], previewMode: "mockupWithTextSummary", active: true, version: 1,
  studioArts: [{ label: "A", versions: [{ templateId: T }] }], pageMockup: { assetId: "img-placa", alt: "", decorative: false }, ...over,
});
const doc = (customizers: Customizer[]) => ({ scope: "sul", customizers }) as unknown as ScopeDoc;

describe("the personalization page", () => {
  test("lists the active models with the art editor, in the panel's order, with the price when they sell on the spot", () => {
    const cards = personalizationCards(doc([
      model({ id: "cz-natal", slug: "natal-em-familia", name: "Natal em família", description: "Com o sobrenome", pageMockup: { assetId: "img-natal", alt: "Camiseta Natal", decorative: false }, directPurchase: { enabled: true, price: "109.90" } }),
      model({ id: "cz-placa", slug: "placa", name: "Placa da sua cidade", directPurchase: { enabled: false, price: "109.90" } }),
    ]), media, "sul");
    expect(cards).toEqual([
      { id: "cz-natal", href: "/sul/personalizar/natal-em-familia", title: "Natal em família", description: "Com o sobrenome", price: "R$ 109,90", image: { src: "/m/natal.webp", width: 800, height: 800, alt: "Camiseta Natal" } },
      { id: "cz-placa", href: "/sul/personalizar/placa", title: "Placa da sua cidade", image: { src: "/m/placa.webp", width: 800, height: 800, alt: "Placa da sua cidade" } },
    ]);
  });
  test("leaves out what would be a broken or foreign card", () => {
    const left = personalizationCards(doc([
      model({ id: "off", active: false }),
      model({ id: "form", studioArts: undefined }), // the old text-only request form
      model({ id: "caneca", source: { kind: "umapenca", articleKind: "caneca" } as Customizer["source"] }), // stays on "Outros artigos"
      model({ id: "no-image", pageMockup: undefined }),
      model({ id: "lost-image", pageMockup: { assetId: "gone", alt: "", decorative: false } }),
    ]), media, "sul");
    expect(left).toEqual([]);
    expect(personalizationCards(doc([model({})]), media, "norte")).toEqual([]);
  });
});
