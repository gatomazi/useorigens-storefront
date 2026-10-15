import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { SOLID_CARDS } from "@/components/catalog/ProductCard";
import { ProductGrid } from "@/components/catalog/ProductGrid";
import type { CarouselItem } from "@/components/catalog/ProductCarousel";

const ITEMS: CarouselItem[] = [1, 2, 3].map((n) => ({ id: `p${n}`, name: `Camiseta ${n}`, price: "R$ 109,90", href: `https://example.test/p${n}`, imageUrl: "/x.png" }));
const grid = (solidCards: boolean) =>
  renderToStaticMarkup(createElement(ProductGrid, { items: ITEMS, labelledBy: "t", title: "Identidade", tone: "dark", viewAllHref: "https://example.test/colecao", sourceSection: "home_test", solidCards }));

describe("product cards on a section with a photo behind (solidCards)", () => {
  test("given a dark section on a photo, when its cards are solid, then they bring their own ground and dark text, and the heading stays light", () => {
    const html = grid(true);
    for (const cls of SOLID_CARDS.split(" ")) expect(html).toContain(cls);
    expect(html).toContain("border-black/15"); // the light card, not the see-through one for a dark ground
    expect(html).not.toContain("border-white/25");
    expect(html).toContain("border-white/40"); // "Ver todos" in the heading still follows the section's tone
  });

  test("given the same section without a photo, then the cards stay see-through and follow the section's tone", () => {
    const html = grid(false);
    expect(html).not.toContain("[--card-fill:var(--ground)]");
    expect(html).toContain("border-white/25");
  });
});
