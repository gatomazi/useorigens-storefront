/**
 * "Guia de medidas": one central, versioned entry per INK base garment (`product_type.id`, see garments.ts) and model
 * (INK's variant `model`: Clássica/Masculino vs Baby Look/Feminino…). Thousands of designs share these few tables, so
 * nothing here is per product, per design, per city or per family ("Origem", "Coordenadas"… never change a piece's size).
 *
 * SOURCE. INK itself: the size-table images its own "Confira suas medidas" modal shows on every product page
 * (`div.modal-size-product` → `img[src*="/images/size_table/"]`). The public help article listed in the brief
 * (integracoes.reserva.ink …/10926971) answered Cloudflare error 1014 on 2026-10-05 and could not be read.
 * Every number below was transcribed from the image in `image.desktop` and checked value by value against it on
 * 2026-10-05; nothing was inferred, rounded or filled in. The image itself is shown in the guide too (zoomable), so the
 * official picture is always one tap away from the transcription. If INK replaces an image, re-check and bump
 * `checkedAt` — a stale or missing entry falls back to "Consultar medidas na página de compra", never generic numbers.
 *
 * MEASURES. These are GARMENT measurements, not body measurements: every official drawing measures a flat garment.
 * Width columns (Abdômen, Busto, Cintura, Tórax) are a straight line from one side of the flat piece to the other —
 * not a circumference. Tolerance is shown only because each official image prints its own.
 *
 * Sizes are what the table lists. They match the sizes INK offers for that base (checked against the variant frames
 * of one product per base on 2026-10-05), but the guide never says a size is in stock — availability is on the product page.
 */

export type SizeGuideColumn = {
  label: string;
  /** Narrow-screen header (phones), when the full label would push the table past the sheet's width. */
  short?: string;
  /** How to read this measure, from the official drawing. */
  meaning: string;
};

export type SizeGuide = {
  /** Stable id, e.g. "camiseta-classica". */
  id: string;
  /** INK `product_type.id` (garments.ts). */
  garmentTypeId: number;
  /** INK variant `model` value this table is for, when the base has more than one ("Masculino" / "Feminino"). */
  inkModel?: string;
  /** Name shown in the guide ("Camiseta clássica (unissex)"). */
  name: string;
  /** Short label for the model selector. */
  shortName: string;
  /** Title exactly as INK's modal prints it. */
  inkTitle: string;
  unit: "cm";
  columns: SizeGuideColumn[];
  rows: { size: string; values: number[] }[];
  /** As printed on the official image ("+/- 2 cm"). */
  tolerance: string;
  /** Official note printed on the image, verbatim. */
  note?: string;
  /** Short "how to measure" line, adapted to the piece. */
  howTo: string;
  image: { desktop: string; mobile: string; width: number; height: number };
  /** A real INK product page where this image was read. */
  sourcePage: string;
  checkedAt: string;
};

const IMG = "https://gcp-images.majestic.ink.rsvcloud.com/images/size_table/";
const CHECKED = "2026-10-05";

const C = {
  comprimento: { label: "Comprimento", short: "Compr.", meaning: "Do ponto mais alto do ombro, junto à gola, até a barra." },
  abdomen: { label: "Abdômen", meaning: "Largura da peça estendida, de um lado ao outro, logo abaixo das cavas (não é circunferência)." },
  busto: { label: "Busto", meaning: "Largura da peça estendida, de um lado ao outro, na altura das cavas (não é circunferência)." },
  cintura: { label: "Cintura", meaning: "Largura da peça estendida, de um lado ao outro, na parte mais baixa do corpo da peça (não é circunferência)." },
  torax: { label: "Tórax", meaning: "Largura da peça estendida, de um lado ao outro, logo abaixo das cavas (não é circunferência)." },
  ombro: { label: "Ombro", meaning: "De uma costura do ombro à outra." },
  mangaCurta: { label: "Manga", meaning: "Medida da manga marcada na ilustração oficial, na altura da barra da manga." },
  mangaComprida: { label: "Manga", meaning: "Comprimento da manga, da costura do ombro até o punho." },
  mangaOversized: { label: "Manga", meaning: "Comprimento da manga, da costura do ombro até a barra da manga." },
  bocaManga: { label: "Boca da manga", meaning: "Largura da abertura da manga, com a peça estendida." },
} satisfies Record<string, SizeGuideColumn>;

const HOW_TEE = "Compare com uma camiseta sua que veste bem, estendida sobre uma superfície plana.";
const HOW_TANK = "Compare com uma regata sua que veste bem, estendida sobre uma superfície plana.";
const HOW_SWEAT = "Compare com um moletom seu que veste bem, estendido sobre uma superfície plana.";
const HOW_KIDS = "Compare com uma peça da criança que veste bem, estendida sobre uma superfície plana.";

const CLASSICA_ROWS = [
  { size: "P", values: [69, 52, 48, 19] },
  { size: "M", values: [72, 54, 49, 20] },
  { size: "G", values: [74, 56, 50, 21] },
  { size: "GG", values: [75, 59, 51.5, 22.5] },
  { size: "3G", values: [79, 64, 55.5, 23.5] },
  { size: "4G", values: [86, 72, 61, 25.5] },
];
const BABY_LOOK_ROWS = [
  { size: "PP", values: [65, 41, 40, 36, 14] },
  { size: "P", values: [66, 43, 42, 37, 15] },
  { size: "M", values: [67, 45, 44, 38, 16] },
  { size: "G", values: [68, 47, 46, 39, 17] },
  { size: "GG", values: [69, 49, 48, 40, 18] },
  { size: "3G", values: [76.5, 55, 54, 44, 20] },
];
const MOLETOM_SLIM_COLUMNS = [C.comprimento, C.torax, C.mangaComprida];

export const SIZE_GUIDES: readonly SizeGuide[] = [
  {
    id: "camiseta-classica",
    garmentTypeId: 1,
    inkModel: "Masculino",
    name: "Camiseta clássica (unissex)",
    shortName: "Clássica",
    inkTitle: "Clássica | Unissex",
    unit: "cm",
    columns: [C.comprimento, C.abdomen, C.ombro, C.mangaCurta],
    rows: CLASSICA_ROWS,
    tolerance: "+/- 2 cm",
    howTo: HOW_TEE,
    image: { desktop: `${IMG}84fe6b2adfc72123a5bc913f13e5b756.webp`, mobile: `${IMG}3de43729fffae4430d4faf5dd1defed1.webp`, width: 1650, height: 878 },
    sourcePage: "https://www.usesul.com.br/usesul/product/paranaense-pe-vermelho",
    checkedAt: CHECKED,
  },
  {
    id: "camiseta-baby-look",
    garmentTypeId: 1,
    inkModel: "Feminino",
    name: "Camiseta baby look (feminina)",
    shortName: "Baby look",
    inkTitle: "Baby Look | Feminina",
    unit: "cm",
    columns: [C.comprimento, C.busto, C.cintura, C.ombro, C.mangaCurta],
    rows: BABY_LOOK_ROWS,
    tolerance: "+/- 1 cm",
    howTo: HOW_TEE,
    image: { desktop: `${IMG}250d955bb3d4db4a1d213e34cadf56fc.webp`, mobile: `${IMG}9c1ab7b24451dbe8454ad82398ce480d.webp`, width: 1650, height: 878 },
    sourcePage: "https://www.usesul.com.br/usesul/product/paranaense-pe-vermelho",
    checkedAt: CHECKED,
  },
  {
    id: "peruano-masculino",
    garmentTypeId: 72,
    inkModel: "Masculino",
    name: "Camiseta Algodão Peruano (masculina)",
    shortName: "Peruano masculina",
    inkTitle: "Masculino",
    unit: "cm",
    columns: [C.comprimento, C.abdomen, C.ombro, C.mangaCurta],
    rows: CLASSICA_ROWS,
    tolerance: "+/- 2 cm",
    note: "Atenção à modelagem da cor verde musgo e oliva: este produto possui modelagem ligeiramente mais justa. Recomendamos escolher um número acima do tamanho que você costuma usar no dia a dia.",
    howTo: HOW_TEE,
    image: { desktop: `${IMG}93c4039b0ba5826c63f05d296ab5b1ff.webp`, mobile: `${IMG}c3467304d0731d0e9d30882164e13b45.webp`, width: 2200, height: 1170 },
    sourcePage: "https://www.usesul.com.br/usesul/product/paranaense-pe-vermelho-1f3eca29-03b7-40f4-8762-d47a459b52ca",
    checkedAt: CHECKED,
  },
  {
    id: "peruano-feminino",
    garmentTypeId: 72,
    inkModel: "Feminino",
    name: "Camiseta Algodão Peruano (feminina)",
    shortName: "Peruano feminina",
    inkTitle: "Feminino",
    unit: "cm",
    columns: [C.comprimento, C.busto, C.cintura, C.ombro, C.mangaCurta],
    rows: BABY_LOOK_ROWS,
    tolerance: "+/- 1 cm",
    howTo: HOW_TEE,
    image: { desktop: `${IMG}8a196d5b04028c459e704a205f32688a.webp`, mobile: `${IMG}098ab7086c1e607d5b186f51b5a05a10.webp`, width: 2200, height: 1170 },
    sourcePage: "https://www.usesul.com.br/usesul/product/paranaense-pe-vermelho-1f3eca29-03b7-40f4-8762-d47a459b52ca",
    checkedAt: CHECKED,
  },
  {
    id: "oversized",
    garmentTypeId: 178,
    name: "Camiseta oversized (unissex)",
    shortName: "Oversized",
    inkTitle: "Unissex",
    unit: "cm",
    columns: [C.comprimento, C.mangaOversized, C.torax, C.bocaManga],
    rows: [
      { size: "P", values: [73, 27, 60, 18.5] },
      { size: "M", values: [76, 28, 63, 19.5] },
      { size: "G", values: [79, 29, 67, 21] },
      { size: "GG", values: [82, 30, 71, 22.5] },
      { size: "3G", values: [85, 31, 75, 23.5] },
    ],
    tolerance: "+/- 2 cm",
    howTo: HOW_TEE,
    image: { desktop: `${IMG}309bc4b433725b84f5903e7154d2e94c.webp`, mobile: `${IMG}4de6b1ea033b0d7f966ca6ee4311ac81.webp`, width: 2200, height: 1170 },
    sourcePage: "https://www.usesul.com.br/usesul/product/churrasco-e-cerveja-treino-p-b",
    checkedAt: CHECKED,
  },
  {
    id: "regata",
    garmentTypeId: 8,
    name: "Regata",
    shortName: "Regata",
    inkTitle: "Regata",
    unit: "cm",
    columns: [C.comprimento, C.abdomen, C.ombro],
    rows: [
      { size: "P", values: [72, 51, 31] },
      { size: "M", values: [74, 53, 32] },
      { size: "G", values: [75, 55, 33] },
      { size: "GG", values: [76, 58, 36] },
      { size: "3G", values: [78, 62, 38] },
    ],
    tolerance: "+/- 1 cm",
    howTo: HOW_TANK,
    image: { desktop: `${IMG}6b3b2c6187a441e2d0ef45c2b2e1b108.webp`, mobile: `${IMG}862f7f37432bde2214a2f0509c5e5e02.webp`, width: 929, height: 494 },
    sourcePage: "https://www.usesul.com.br/usesul/product/paranaense-pe-vermelho-88d2916e-9746-494a-b28f-643c81b40637",
    checkedAt: CHECKED,
  },
  {
    id: "infantil",
    garmentTypeId: 2,
    name: "Camiseta infantil",
    shortName: "Infantil",
    inkTitle: "Infantil",
    unit: "cm",
    columns: [C.comprimento, C.ombro, C.mangaCurta],
    rows: [
      { size: "02 anos", values: [42, 28, 12] },
      { size: "04 anos", values: [46, 31, 13.5] },
      { size: "06 anos", values: [50, 34, 15] },
      { size: "08 anos", values: [54, 37, 16.5] },
      { size: "10 anos", values: [58, 39, 17.5] },
      { size: "12 anos", values: [62, 41, 18.5] },
      { size: "14 anos", values: [66, 43, 19.5] },
    ],
    tolerance: "+/- 1 cm",
    howTo: HOW_KIDS,
    image: { desktop: `${IMG}7c28ff77ab96e626e016a462cef00ab2.webp`, mobile: `${IMG}03db82fd11a0d2c41729d5b3b82d2983.webp`, width: 929, height: 483 },
    sourcePage: "https://www.usesul.com.br/usesul/product/paranaense-pe-vermelho-dc0bb402-9022-43c9-9ffd-f2d6a6a4f582",
    checkedAt: CHECKED,
  },
  {
    id: "body-infantil",
    garmentTypeId: 165,
    name: "Body infantil",
    shortName: "Body",
    inkTitle: "Infantil",
    unit: "cm",
    columns: [C.comprimento, C.torax, C.ombro, C.mangaCurta],
    rows: [
      { size: "03 meses", values: [34.5, 20, 18, 7] },
      { size: "06 meses", values: [38, 22, 19, 7.5] },
      { size: "09 meses", values: [40.5, 23, 20, 8] },
      { size: "12 meses", values: [43.5, 24, 21, 8.5] },
      { size: "18 meses", values: [46.5, 25, 22, 9] },
      { size: "24 meses", values: [49.5, 26, 23, 9.5] },
    ],
    tolerance: "+/- 2 cm",
    howTo: HOW_KIDS,
    image: { desktop: `${IMG}d6ab7e288c7a25fb6fee7ff2d4d0d7ce.webp`, mobile: `${IMG}a9a672acf15b3ba4062c21755cc44985.webp`, width: 2200, height: 1170 },
    sourcePage: "https://www.usesul.com.br/usesul/product/mate-bom-demais-menina-f423e8ff-7aec-4c57-8390-2c03a3fe199e",
    checkedAt: CHECKED,
  },
  {
    id: "cropped",
    garmentTypeId: 23,
    name: "Cropped",
    shortName: "Cropped",
    inkTitle: "Cropped",
    unit: "cm",
    columns: [C.busto, C.comprimento, C.ombro, C.mangaCurta],
    rows: [
      { size: "PP", values: [51, 40, 43.5, 18] },
      { size: "P", values: [53, 41, 45.5, 19] },
      { size: "M", values: [55, 42, 47.5, 20] },
      { size: "G", values: [57, 43, 49.5, 21] },
      { size: "GG", values: [59, 44, 51.5, 22] },
    ],
    tolerance: "+/- 1 cm",
    howTo: HOW_TEE,
    image: { desktop: `${IMG}5aae142b21dca104c1a489f9997dbf03.webp`, mobile: `${IMG}7898071d887be98bdaed03d86ff415f2.webp`, width: 929, height: 494 },
    sourcePage: "https://www.usesul.com.br/usesul/product/paranaense-pe-vermelho-d4c15929-9a82-4b67-9af2-1e85e19d57c8",
    checkedAt: CHECKED,
  },
  {
    id: "cropped-moletom",
    garmentTypeId: 28,
    name: "Cropped moletom",
    shortName: "Cropped moletom",
    inkTitle: "Moletom Cropped",
    unit: "cm",
    columns: [C.busto, C.comprimento, C.ombro, C.mangaComprida],
    rows: [
      { size: "PP", values: [50, 47, 53, 51] },
      { size: "P", values: [52, 48, 55, 52] },
      { size: "M", values: [54, 49, 57, 53] },
      { size: "G", values: [56, 50, 59, 54] },
      { size: "GG", values: [58, 51, 61, 55] },
    ],
    tolerance: "+/- 1 cm",
    howTo: HOW_SWEAT,
    image: { desktop: `${IMG}fb672c56fc65b7ad70f25d74058537e5.webp`, mobile: `${IMG}84eff0b71721f3c1bfbbb17cf4da5eae.webp`, width: 929, height: 494 },
    sourcePage: "https://www.usesul.com.br/usesul/product/paranaense-pe-vermelho-48e739eb-3d45-43c9-ac53-f4fba056d6b8",
    checkedAt: CHECKED,
  },
  {
    id: "moletom-capuz",
    garmentTypeId: 119,
    name: "Moletom com capuz (Hoodie Slim)",
    shortName: "Moletom capuz",
    inkTitle: "Hoodie Slim",
    unit: "cm",
    columns: MOLETOM_SLIM_COLUMNS,
    rows: [
      { size: "PP", values: [67, 51, 65] },
      { size: "P", values: [69, 53, 66] },
      { size: "M", values: [71, 55, 67] },
      { size: "G", values: [73, 57, 68] },
      { size: "GG", values: [75, 59, 69] },
      { size: "3G", values: [77, 61, 70] },
    ],
    tolerance: "+/- 1 cm",
    howTo: HOW_SWEAT,
    image: { desktop: `${IMG}e54f138be1ac03e8488a8289b60a9bd5.webp`, mobile: `${IMG}b045d3e0783dcedb8534df9b08c5dd02.webp`, width: 2200, height: 1170 },
    sourcePage: "https://www.usesul.com.br/usesul/product/paranaense-pe-vermelho-f4f76bb2-96fb-499c-94a0-b7167ce5a1dc",
    checkedAt: CHECKED,
  },
  {
    id: "moletom-sueter",
    garmentTypeId: 120,
    name: "Moletom suéter (Suéter Slim)",
    shortName: "Moletom suéter",
    inkTitle: "Suéter Slim",
    unit: "cm",
    columns: MOLETOM_SLIM_COLUMNS,
    rows: [
      { size: "PP", values: [68, 51, 66] },
      { size: "P", values: [70, 53, 67] },
      { size: "M", values: [72, 55, 68] },
      { size: "G", values: [74, 57, 69] },
      { size: "GG", values: [76, 59, 70] },
      { size: "3G", values: [78, 61, 71] },
    ],
    tolerance: "+/- 1 cm",
    howTo: HOW_SWEAT,
    image: { desktop: `${IMG}fa46d82f524bc11b689e20ebae4d4f46.webp`, mobile: `${IMG}047e86c4831bcaf1378e9b862db50c22.webp`, width: 2200, height: 1170 },
    sourcePage: "https://www.usesul.com.br/usesul/product/paranaense-pe-vermelho-35346baa-609e-4408-91a9-3dcc90da9048",
    checkedAt: CHECKED,
  },
];

/** Every official table for the given base garments, in the given order (models of one base stay together). Unknown ids yield nothing. */
export function sizeGuidesFor(garmentTypeIds: readonly number[]): SizeGuide[] {
  return garmentTypeIds.flatMap((id) => SIZE_GUIDES.filter((g) => g.garmentTypeId === id));
}

/** "51,5" — the official images print a decimal comma. */
export function formatMeasure(value: number): string {
  return value.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}
