import { describe, expect, test } from "vitest";
import { offerStripText } from "@/lib/offer-strip";

const kit = { kind: "value" as const, tiers: [{ items: 3, discount: 25 }, { items: 4, discount: 40 }, { items: 6, discount: 100 }] };

describe("linha de oferta da página da estampa", () => {
  test("monta frete e faixas do kit a partir das regras", () => {
    expect(offerStripText({ freeShippingItems: 2, kit })).toBe("Frete grátis a partir de 2 peças · Leve 3 e ganhe R$ 25 OFF (até R$ 100 OFF em 6)");
  });
  test("uma faixa só não ganha o 'até'", () => {
    expect(offerStripText({ kit: { kind: "percentage", tiers: [{ items: 3, discount: 10 }] } })).toBe("Leve 3 e ganhe 10% OFF");
  });
  test("só o frete, ou só o kit", () => {
    expect(offerStripText({ freeShippingItems: 3 })).toBe("Frete grátis a partir de 3 peças");
    expect(offerStripText({ kit })).toBe("Leve 3 e ganhe R$ 25 OFF (até R$ 100 OFF em 6)");
  });
  test("sem regra viva, nada aparece", () => {
    expect(offerStripText({})).toBeNull();
    expect(offerStripText({ freeShippingItems: null, kit: { kind: "value", tiers: [] } })).toBeNull();
    expect(offerStripText({ freeShippingItems: 1 })).toBeNull();
  });
});
