import { describe, expect, test } from "vitest";
import { classifyCoverPixels } from "@/lib/merchant/cover-color";
import { buildMerchantFeed, type DesignInfo } from "@/lib/merchant/feed";
import { reduceMerchantSource, type MerchantSourceProduct } from "@/lib/merchant/source";
import { parseInkTsv, tsvLine } from "@/lib/merchant/tsv";

const TEE_COLORS = [
  { name: "Vermelho", hex: "d52100" },
  { name: "Preta", hex: "000000" },
  { name: "Branca", hex: "ffffff" },
  { name: "Marinho", hex: "222e4b" },
  { name: "Verde", hex: "003218" },
  { name: "Cinza", hex: "808080" },
];

/** A 32×32 cover: flat light-grey background (as INK's mockups), a garment block in `shirt`, a small print in `print`. */
function cover(shirt: [number, number, number], print: [number, number, number] = [240, 240, 240]): Uint8Array {
  const size = 32;
  const px = new Uint8Array(size * size * 3);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const inShirt = x >= 6 && x < 26 && y >= 4 && y < 30;
      const inPrint = x >= 13 && x < 19 && y >= 12 && y < 18;
      const c = inPrint ? print : inShirt ? shirt : [229, 229, 229];
      px.set(c, (y * size + x) * 3);
    }
  }
  return px;
}

describe("classifyCoverPixels", () => {
  test("a black mockup (rendered dark grey) is Preta, not the dark Verde nor Marinho", () => {
    expect(classifyCoverPixels(cover([28, 28, 28]), 32, 32, TEE_COLORS)).toMatchObject({ color: "Preta", confident: true });
  });
  test("a dark green mockup is Verde (INK's feed called this cover Marinho)", () => {
    expect(classifyCoverPixels(cover([34, 67, 53]), 32, 32, TEE_COLORS)).toMatchObject({ color: "Verde", confident: true });
  });
  test("an off-white oversized is Off White, not Areia", () => {
    const colors = [{ name: "Areia", hex: "ded1bd" }, { name: "Off White", hex: "ffffff" }];
    expect(classifyCoverPixels(cover([244, 240, 233]), 32, 32, colors)).toMatchObject({ color: "Off White", confident: true });
  });
  test("two colors with the same hex are never a confident answer", () => {
    const colors = [{ name: "Branca", hex: "ffffff" }, { name: "Off White", hex: "ffffff" }, { name: "Preta", hex: "000000" }];
    expect(classifyCoverPixels(cover([244, 244, 244]), 32, 32, colors)?.confident).toBe(false);
  });
  test("a color without hex falls back to INK's known value; no usable color at all gives no verdict", () => {
    expect(classifyCoverPixels(cover([28, 28, 28]), 32, 32, [{ name: "Preta", hex: null }, { name: "Branca", hex: null }])).toMatchObject({ color: "Preta" });
    expect(classifyCoverPixels(cover([28, 28, 28]), 32, 32, [{ name: "Furta-cor", hex: null }])).toBeNull();
  });
});

describe("parseInkTsv / tsvLine", () => {
  test("quoted fields keep their tabs, line breaks and doubled quotes", () => {
    const text = 'id\tdescription\ttitle\n1\t"linha 1\nlinha ""2"""\tCamiseta - A\n2\tsimples\tCamiseta - B\n';
    const { header, rows } = parseInkTsv(text);
    expect(header).toEqual(["id", "description", "title"]);
    expect(rows).toEqual([
      { id: "1", description: 'linha 1\nlinha "2"', title: "Camiseta - A" },
      { id: "2", description: "simples", title: "Camiseta - B" },
    ]);
  });
  test("an output line never carries a tab or a line break inside a value", () => {
    expect(tsvLine(["a\tb", "c\nd", " e "])).toBe("a b\tc d\te");
  });
});

describe("reduceMerchantSource", () => {
  test("groups variants by color with INK's hex, models and only the available sizes", () => {
    const p = reduceMerchantSource({
      id: 7,
      name: "Ipira | Território SC",
      main_image_url: "https://img.example/capa.jpg",
      product_type: { id: 1, name: "Camiseta" },
      total_sales_count: 3,
      product_variants: [
        { color: "Preta", hex_color: "000000", model: "Masculino", size: "M", is_available: true },
        { color: "Preta", hex_color: "000000", model: "Feminino", size: "PP", is_available: true },
        { color: "Amarelo", hex_color: "CA8A00", model: "Masculino", size: "M", is_available: false },
      ],
    });
    expect(p).toMatchObject({ id: "7", cover: "https://img.example/capa.jpg", typeId: 1, typeName: "Camiseta", sales: 3 });
    expect(p?.colors).toEqual([
      { name: "Preta", hex: "000000", models: ["Masculino", "Feminino"], sizes: ["M", "PP"] },
      { name: "Amarelo", hex: "ca8a00", models: ["Masculino"], sizes: [] },
    ]);
  });
});

const INK_HEADER = ["id", "item_group_id", "availability", "condition", "description", "image_link", "link", "title", "price", "sale_price", "mpn", "google_product_category", "brand", "custom_label_0", "custom_label_2", "color", "gender", "material", "age_group", "size"];
const inkRow = (over: Record<string, string> = {}): Record<string, string> => ({
  id: "4394535",
  item_group_id: "4394535",
  availability: "in stock",
  condition: "new",
  description: "Confecção garantida pela Reserva INK.",
  image_link: "https://gcp-images.majestic.ink.rsvcloud.com/images/product_art/final_image/vermelha.jpg",
  link: "https://loja.useorigens.com.br/useorigens/product/ipira-territorio-sc",
  title: "Camiseta - Ipira | Território SC",
  price: "109.90 BRL",
  sale_price: "",
  mpn: "4394535",
  google_product_category: "212",
  brand: "Use Origens",
  custom_label_0: "Camiseta",
  custom_label_2: "Camiseta Regional com Identidade,CAMISETA COM A SUA CIDADE",
  color: "Vermelho",
  gender: "male",
  material: "Todas as cores de camisetas e regatas são 100% algodão, exceto as cinzas-mescla…",
  age_group: "adult",
  size: "3G",
  ...over,
});
const tee = (over: Partial<MerchantSourceProduct> = {}): MerchantSourceProduct => ({
  id: "4394535",
  name: "Ipira | Território SC",
  cover: "https://gcp-images.majestic.ink.rsvcloud.com/images/product_v2/main_image/capa.jpg",
  typeId: 1,
  typeName: "Camiseta",
  description: null,
  sales: 0,
  createdAt: null,
  colors: [
    { name: "Vermelho", hex: "d52100", models: ["Masculino", "Feminino"], sizes: ["3G", "G", "P", "M"] },
    { name: "Preta", hex: "000000", models: ["Masculino", "Feminino"], sizes: ["P", "GG", "M", "G", "3G"] },
  ],
  ...over,
});
const IPIRA: DesignInfo = { regionName: "Sul", uf: "SC", stateName: "Santa Catarina", cityName: "Ipira", familyId: "territorio", familyName: "Território", familyDescription: "Mapa do estado com a cidade em destaque." };

function build(rows: Record<string, string>[], products: MerchantSourceProduct[], verdicts: [string, { color: string; confident: boolean }][], design: (id: string) => DesignInfo | undefined = () => IPIRA) {
  const out = buildMerchantFeed({
    inkHeader: INK_HEADER,
    inkRows: rows,
    source: new Map(products.map((p) => [p.id, p])),
    coverColors: new Map(verdicts.map(([url, v]) => [url, { ...v, share: 0.9, runnerUp: 0 }])),
    design,
  });
  return { ...out, records: out.rows.map((r) => Object.fromEntries(out.header.map((h, i) => [h, r[i]]))) };
}

describe("buildMerchantFeed", () => {
  test("swaps INK's first-variant image for the cover and makes color, size and gender follow the cover", () => {
    const p = tee();
    const { records, stats } = build([inkRow()], [p], [[p.cover!, { color: "Preta", confident: true }]]);
    expect(records[0]).toMatchObject({
      id: "4394535",
      link: "https://loja.useorigens.com.br/useorigens/product/ipira-territorio-sc",
      price: "109.90 BRL",
      image_link: p.cover,
      color: "Preta",
      size: "M",
      gender: "unisex",
      material: "Algodão",
      title: "Camiseta Ipira (SC) – Estampa Território – Preta | Use Origens",
      product_type: "Camiseta > Sul > Santa Catarina > Ipira > Território",
      custom_label_1: "Sul",
      custom_label_2: "Território",
      custom_label_3: "sem vendas",
      custom_label_4: "SC",
    });
    expect(records[0].description).toMatch(/^Camiseta da estampa Território de Ipira \(SC\)\. Mapa do estado/);
    expect(stats).toMatchObject({ rows: 1, coverImage: 1, colorChanged: 1, placeholderFixed: 0 });
  });

  test("an unsure cover keeps INK's image, color and size together (never a cover with the wrong color)", () => {
    const p = tee();
    const { records, stats } = build([inkRow()], [p], [[p.cover!, { color: "Preta", confident: false }]]);
    expect(records[0]).toMatchObject({ image_link: inkRow().image_link, color: "Vermelho", size: "3G" });
    expect(stats.kept.colorUnsure).toBe(1);
  });

  test("INK's 'removed' placeholder is replaced by the cover even when the color is only a best guess", () => {
    const p = tee();
    const placeholder = "https://gcp-heroku.majestic.ink.rsvcloud.com/assets/dashboard/arts/removed-b1a2.png";
    const { records, stats } = build([inkRow({ image_link: placeholder })], [p], [[p.cover!, { color: "Preta", confident: false }]]);
    expect(records[0]).toMatchObject({ image_link: p.cover, color: "Preta" });
    expect(stats.placeholderFixed).toBe(1);
  });

  test("a row INK exports but our sync has not seen yet goes through with INK's look and our labels", () => {
    const kit = inkRow({ id: "kit_611", title: "Kit Catarinense", custom_label_0: "Kit", color: "Marinho,Preta,Branca" });
    const { records, stats } = build([kit], [], [], () => undefined);
    expect(records[0]).toMatchObject({ id: "kit_611", image_link: kit.image_link, title: "Kit Catarinense | Use Origens", custom_label_2: "Outras estampas", custom_label_3: "sem dados" });
    expect(stats.kept.noSource).toBe(1);
  });

  test("Body Infantil goes to Google's baby one-piece category", () => {
    const body = tee({ id: "5110741", typeId: 165, typeName: "Body Infantil", colors: [{ name: "Branca", hex: "ffffff", models: ["Infantil"], sizes: ["03 meses", "12 meses"] }] });
    const { records } = build([inkRow({ id: "5110741", custom_label_0: "Body Infantil", age_group: "infant" })], [body], [[body.cover!, { color: "Branca", confident: true }]], () => undefined);
    expect(records[0]).toMatchObject({ google_product_category: "5411", age_group: "infant", size: "12 meses", gender: "unisex" });
  });

  test("every custom label stays far below Google's 1,000 distinct values (INK's custom_label_2 had 1,876)", () => {
    const { records } = build([inkRow()], [tee()], []);
    for (const label of ["custom_label_0", "custom_label_1", "custom_label_2", "custom_label_3", "custom_label_4"]) expect(records[0][label]).not.toContain(",");
  });
});
