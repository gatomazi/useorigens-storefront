import { describe, expect, test } from "vitest";
import { expandTuple, toTuple } from "@/lib/catalog/garment-index-file";
import { buildStoreIndex } from "@/lib/catalog/indexer";
import { paraProdutoIndexavel } from "@/lib/catalog/unificado/reconciliar";
import { reduzirProdutoBruto } from "@/lib/catalog/unificado/produto-bruto";
import { formatListPrice, formatPrice } from "@/lib/format";
import { inkPricing, normalizeGarmentSourceProduct, normalizeInkProduct } from "@/lib/ink/normalize";
import { product } from "./fixtures";

/** A product as INK's API returns it (the live Sul store answered "109.9" / "89.9" on 2026-10-10). */
const raw = (over: Record<string, unknown> = {}) => ({
  id: 4765729,
  name: "Torres | Legado RS",
  slug: "torres-legado-rs",
  store_product_url: "https://www.usesul.com.br/usesul/product/torres-legado-rs",
  main_image_url: "https://gcp-images.majestic.ink.rsvcloud.com/images/a.jpg",
  status: "published",
  visible_in_store: true,
  price: "109.9",
  promotional_price: "89.9",
  product_cluster_id: 530356,
  product_type: { id: 1 },
  total_sales_count: 3,
  ...over,
});
const NOW = "2026-10-10T00:00:00.000Z";

describe("INK promotional price", () => {
  test("given a promotional price below the regular one, when read, then it is the price charged and the regular one is kept as the list price", () => {
    expect(inkPricing({ price: "109.9", promotional_price: "89.9" })).toEqual({ price: 89.9, listPrice: 109.9 });
    expect(inkPricing({ price: 109.9, promotional_price: 89.9 })).toEqual({ price: 89.9, listPrice: 109.9 });
  });

  test("given no promotion, or a promotional price that is not a real discount, when read, then the regular price stands alone", () => {
    for (const promotional_price of [null, undefined, "", "0", "0.0", "109.9", "119.9", "abc", -5]) {
      expect(inkPricing({ price: "109.9", promotional_price }), String(promotional_price)).toEqual({ price: 109.9, listPrice: null });
    }
    expect(inkPricing({ price: null, promotional_price: "89.9" })).toEqual({ price: null, listPrice: null }); // never a price INK did not give as regular
  });

  test("given a product on promotion, when normalized for the catalog and for the piece index, then both carry the promotional price and the list price", () => {
    expect(normalizeInkProduct(raw(), "use-sul")).toMatchObject({ price: 89.9, listPrice: 109.9 });
    expect(normalizeGarmentSourceProduct(raw(), "use-sul")).toMatchObject({ price: 89.9, listPrice: 109.9 });
    const regular = normalizeInkProduct(raw({ promotional_price: null }), "use-sul")!;
    expect(regular.price).toBe(109.9);
    expect(regular).not.toHaveProperty("listPrice");
  });

  test("given products on promotion, when indexed, then city designs and merchandise keep both prices; without one the snapshot is unchanged", () => {
    const index = buildStoreIndex("use-sul", [{ ...product("Torres | Legado RS"), price: 89.9, listPrice: 109.9 }, { ...product("Gaúcho de Pedra"), price: 89.9, listPrice: 109.9 }], NOW);
    expect(index.bindings[0]).toMatchObject({ price: 89.9, listPrice: 109.9 });
    expect(index.merch[0]).toMatchObject({ price: 89.9, listPrice: 109.9 });
    const plain = buildStoreIndex("use-sul", [product("Torres | Legado RS")], NOW);
    expect(plain.bindings[0]).not.toHaveProperty("listPrice");
  });

  test("given a piece on promotion, when stored in the compact index and read back, then the list price survives; a 5-slot tuple from an older file still reads", () => {
    const piece = { garmentTypeId: 72, inkProductId: "10", slug: "torres-legado-rs-x", imageUrl: "https://gcp-images.majestic.ink.rsvcloud.com/images/a.jpg", price: 89.9, listPrice: 109.9 };
    const tuple = toTuple(piece)!;
    expect(tuple).toHaveLength(6);
    expect(expandTuple("use-sul", tuple)).toMatchObject({ price: 89.9, listPrice: 109.9 });
    const old = toTuple({ ...piece, listPrice: undefined })!;
    expect(old).toHaveLength(5);
    expect(expandTuple("use-sul", old)).not.toHaveProperty("listPrice");
    expect(expandTuple("use-sul", [72, "10", "slug", "images/a.jpg", 89.9, 80])).not.toHaveProperty("listPrice"); // a "list price" below the price is no promotion
  });

  test("given the unified store's raw read, when made indexable, then it follows the same rule", () => {
    const bruto = reduzirProdutoBruto(raw())!;
    expect(paraProdutoIndexavel(bruto, "use-sul")).toMatchObject({ price: 89.9, listPrice: 109.9 });
    expect(paraProdutoIndexavel(reduzirProdutoBruto(raw({ promotional_price: null }))!, "use-sul")).not.toHaveProperty("listPrice");
  });

  test("given both prices, when formatted, then the list price only exists during a promotion", () => {
    expect(formatPrice(89.9)).toBe("R$ 89,90");
    expect(formatListPrice({ listPrice: 109.9 })).toBe("R$ 109,90");
    expect(formatListPrice({})).toBeUndefined();
  });
});
