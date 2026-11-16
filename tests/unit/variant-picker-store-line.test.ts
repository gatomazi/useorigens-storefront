import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { VariantPicker, type VariantOption } from "@/components/catalog/VariantPicker";

const OPTIONS: VariantOption[] = [
  { id: "1", label: "Camiseta clássica", imageUrl: "/x.png", price: "R$ 99,90", href: "https://loja.example.test/p1", rawPrice: 99.9 },
];
const render = (finishIn: string) =>
  renderToStaticMarkup(createElement(VariantPicker, { options: OPTIONS, alt: "Camiseta Ponto de Origem de Florianópolis", finishIn, intro: createElement("h1", null, "Ponto de Origem") }));

describe("nota sob o botão de compra da página da estampa", () => {
  test("given the single store, then it says where the purchase is finished with the phrase it was given, without \"loja\" twice", () => {
    const html = render("na nossa loja online");
    expect(html).toContain("Tamanho, cor, frete e pagamento você define na nossa loja online.");
    expect(html).not.toContain("na loja na nossa");
    expect(html).not.toContain("Use Sul");
  });
  test("given regional stores, then it names the region's store", () => {
    expect(render("na loja Use Norte")).toContain("Tamanho, cor, frete e pagamento você define na loja Use Norte.");
  });
});
