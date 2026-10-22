import type { CoverColorVerdict } from "./cover-color";
import type { MerchantSourceProduct } from "./source";

/**
 * The Use Origens Google Merchant feed: INK's own export (same ids, links, prices and availability, read at generation time so a promotion
 * is never stale) with the image swapped for the product's COVER — the image INK shows on its page and our site uses — instead of the
 * first variant created at registration, and the color/size/gender rewritten to match that cover. Titles, descriptions, product_type and
 * custom labels come from our classification of the design (city, UF, family), so campaigns can be split by them.
 */

/** Our classification of one product, from the catalog snapshot. */
export type DesignInfo = {
  regionName: string | null;
  uf: string | null;
  stateName: string | null;
  /** City designs only. */
  cityName?: string;
  localityLabel?: string;
  familyId?: string;
  familyName?: string;
  familyDescription?: string;
};

export type FeedInputs = {
  inkHeader: readonly string[];
  inkRows: readonly Record<string, string>[];
  source: ReadonlyMap<string, MerchantSourceProduct>;
  /** Verdict per cover URL (`null` = image could not be classified). */
  coverColors: ReadonlyMap<string, CoverColorVerdict | null>;
  design: (id: string) => DesignInfo | undefined;
};

export type FeedStats = {
  rows: number;
  coverImage: number;
  /** Rows whose INK image was the "removed" placeholder or empty, now with the cover. */
  placeholderFixed: number;
  colorChanged: number;
  kept: { noSource: number; noCover: number; colorUnsure: number };
  classified: number;
};

const BRAND = "Use Origens";
const EXTRA_COLUMNS = ["product_type", "custom_label_1", "custom_label_3", "custom_label_4"] as const;
const SIZE_PREFERENCE = ["M", "G", "P", "GG", "PP", "3G", "4G", "12 meses", "09 meses", "06 meses", "18 meses", "24 meses", "03 meses"];
/** Google taxonomy: "Vestuário e acessórios > Roupas > Roupas infantis > Macacões para bebês". */
const BABY_ONE_PIECE_CATEGORY = "5411";
const BODY_INFANTIL_TYPE_ID = 165;
const INFANTIL_TYPE_ID = 2;

export function isPlaceholderImage(url: string): boolean {
  return url.trim() === "" || /\/assets\/dashboard\/arts\/removed-/.test(url);
}

function representativeSize(sizes: readonly string[]): string | null {
  for (const size of SIZE_PREFERENCE) if (sizes.includes(size)) return size;
  return sizes[0] ?? null;
}

function genderOf(models: readonly string[]): string | null {
  const m = new Set(models.map((x) => x.toLowerCase()));
  if (m.size === 0) return null;
  if (m.has("unissex") || m.has("infantil") || (m.has("masculino") && m.has("feminino"))) return "unisex";
  if (m.has("masculino")) return "male";
  if (m.has("feminino")) return "female";
  return null;
}

function salesTier(product: MerchantSourceProduct | undefined): string {
  if (!product) return "sem dados";
  if (product.sales >= 20) return "mais vendidos";
  if (product.sales >= 1) return "com vendas";
  return "sem vendas";
}

const clip = (text: string, max: number) => (text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`);

/** INK titles are "<type> - <product name>"; the product name alone. */
function productName(row: Record<string, string>, product: MerchantSourceProduct | undefined, garment: string): string {
  if (product) return product.name;
  const title = row.title ?? "";
  return title.startsWith(`${garment} - `) ? title.slice(garment.length + 3) : title;
}

function titleOf(garment: string, name: string, color: string, design: DesignInfo | undefined): string {
  let subject: string;
  if (design?.cityName && design.uf) {
    const place = `${design.localityLabel ? `${design.localityLabel}, ` : ""}${design.cityName} (${design.uf})`;
    const head = name.split("|")[0].trim();
    subject = design.familyId === "gentilico" && head ? `${head} · ${place}` : place;
    subject += design.familyName ? ` – Estampa ${design.familyName}` : "";
  } else {
    subject = name.replace(/\s*\|\s*/g, " – ");
  }
  // A product INK exports without the "<type> - " prefix (the kits) already starts with its type.
  const head = subject.toLowerCase().startsWith(garment.toLowerCase()) ? subject : `${garment} ${subject}`;
  return clip(`${head}${color ? ` – ${color}` : ""} | ${BRAND}`, 150);
}

function descriptionOf(garment: string, inkDescription: string, design: DesignInfo | undefined, material: string): string {
  const parts: string[] = [];
  if (design?.cityName && design.uf && design.familyName) {
    const place = `${design.localityLabel ? `${design.localityLabel}, ` : ""}${design.cityName} (${design.uf})`;
    parts.push(`${garment} da estampa ${design.familyName} de ${place}. ${design.familyDescription ?? ""}`.trim());
    parts.push(`Uma criação da ${BRAND}, que leva a identidade de cada lugar do Brasil para a camiseta. ${material === "Algodão" ? "Malha 100% algodão" : "Malha de algodão"}, produzida sob demanda e entregue pela Reserva INK.`);
  }
  if (inkDescription.trim()) parts.push(inkDescription.trim());
  return clip(parts.join("\n\n").replace(/\s*\n\s*/g, " ").replace(/ {2,}/g, " "), 5000);
}

function productTypeOf(garment: string, design: DesignInfo | undefined): string {
  const path = [garment];
  if (design?.regionName) path.push(design.regionName);
  if (design?.cityName && design.stateName) path.push(design.stateName, design.cityName, design.familyName ?? "Outras estampas");
  else path.push("Outras estampas");
  return path.join(" > ");
}

export function buildMerchantFeed(inputs: FeedInputs): { header: string[]; rows: string[][]; stats: FeedStats } {
  const header = [...inputs.inkHeader, ...EXTRA_COLUMNS.filter((c) => !inputs.inkHeader.includes(c))];
  const stats: FeedStats = { rows: 0, coverImage: 0, placeholderFixed: 0, colorChanged: 0, kept: { noSource: 0, noCover: 0, colorUnsure: 0 }, classified: 0 };
  const rows: string[][] = [];

  for (const ink of inputs.inkRows) {
    const id = ink.id?.trim();
    if (!id) continue;
    const product = inputs.source.get(id);
    const design = inputs.design(id);
    const placeholder = isPlaceholderImage(ink.image_link ?? "");
    const verdict = product?.cover ? inputs.coverColors.get(product.cover) : undefined;
    // The cover replaces INK's image only when we know which color it shows (or when INK's own image is the "removed" placeholder,
    // which Google rejects anyway: then the cover with our best guess beats it). Otherwise INK's image, color and size stay together.
    const useCover = !!product?.cover && !!verdict && (verdict.confident || placeholder);
    const color = useCover ? product!.colors.find((c) => c.name === verdict!.color) : undefined;

    const out: Record<string, string> = { ...ink };
    const garment = product?.typeName ?? ink.custom_label_0 ?? "Camiseta";
    if (useCover && color) {
      out.image_link = product!.cover!;
      out.color = color.name;
      out.size = representativeSize(color.sizes) ?? ink.size ?? "";
      out.gender = genderOf(color.models) ?? ink.gender ?? "";
      stats.coverImage++;
      if (placeholder) stats.placeholderFixed++;
      if (color.name !== ink.color) stats.colorChanged++;
    } else if (!product) stats.kept.noSource++;
    else if (!product.cover) stats.kept.noCover++;
    else stats.kept.colorUnsure++;

    const typeId = product?.typeId ?? null;
    if (typeId === BODY_INFANTIL_TYPE_ID) out.google_product_category = BABY_ONE_PIECE_CATEGORY;
    if (typeId === BODY_INFANTIL_TYPE_ID) out.age_group = "infant";
    else if (typeId === INFANTIL_TYPE_ID) out.age_group = "kids";
    else if (typeId !== null) out.age_group = "adult";

    const material = /cinza/i.test(out.color ?? "") || /moletom/i.test(garment) ? "Algodão/Poliéster" : "Algodão";
    out.material = material;
    out.brand = BRAND;
    out.title = titleOf(garment, productName(ink, product, garment), out.color?.includes(",") ? "" : (out.color ?? ""), design);
    out.description = descriptionOf(garment, ink.description ?? "", design, material);
    out.product_type = productTypeOf(garment, design);
    out.custom_label_0 = garment;
    out.custom_label_1 = design?.regionName ?? "Sem região";
    out.custom_label_2 = design?.familyName ?? "Outras estampas";
    out.custom_label_3 = salesTier(product);
    out.custom_label_4 = design?.uf ?? "Sem UF";
    if (design?.familyName) stats.classified++;

    rows.push(header.map((column) => out[column] ?? ""));
    stats.rows++;
  }
  return { header, rows, stats };
}
