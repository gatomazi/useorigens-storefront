export type DesignFamilyId =
  | "legado"
  | "ponto-de-origem"
  | "coordenadas"
  | "tipografia"
  | "traco"
  | "territorio"
  | "feito-em"
  | "gentilico";

export type DesignFamily = {
  id: DesignFamilyId;
  name: string;
  /** One line, shown under the family name. */
  description: string;
  sortOrder: number;
  /** Family word as it appears in INK product names, normalized. Null when the name has no label. */
  inkLabel: string | null;
};

/**
 * The eight conceptual city design families, in storefront order. Order is commercial, not artificial size:
 * Ponto de Origem, Feito em and Coordenadas lead because they sell best; the rest follow at the same card size
 * (CLAUDE_STYLE_MODELS_LAYOUT_REFINEMENT.md — priority is communicated by order, never by a bigger card).
 */
export const DESIGN_FAMILIES: readonly DesignFamily[] = [
  { id: "ponto-de-origem", name: "Ponto de Origem", description: "Sua cidade marcada no mapa do estado.", sortOrder: 1, inkLabel: "origem" },
  { id: "feito-em", name: "Feito em", description: "Cidade e estado em composição tipográfica.", sortOrder: 2, inkLabel: null },
  { id: "coordenadas", name: "Coordenadas", description: "Nome e coordenadas da cidade.", sortOrder: 3, inkLabel: "coordenadas" },
  { id: "legado", name: "Legado", description: "Silhueta do estado com cidade e origem.", sortOrder: 4, inkLabel: "legado" },
  { id: "territorio", name: "Território", description: "Mapa do estado com a cidade em destaque.", sortOrder: 5, inkLabel: "territorio" },
  { id: "tipografia", name: "Tipografia", description: "O nome da cidade como protagonista.", sortOrder: 6, inkLabel: "tipografia" },
  { id: "traco", name: "Traço", description: "Contorno do estado em linha minimalista.", sortOrder: 7, inkLabel: "traco" },
  { id: "gentilico", name: "Gentílico", description: "O jeito de chamar quem é dali.", sortOrder: 8, inkLabel: "gentilico" },
];

const byId = new Map(DESIGN_FAMILIES.map((f) => [f.id, f]));
const byInkLabel = new Map(DESIGN_FAMILIES.flatMap((f) => (f.inkLabel ? [[f.inkLabel, f] as const] : [])));

export function familyById(id: string): DesignFamily | undefined {
  return byId.get(id as DesignFamilyId);
}

export function familyByInkLabel(normalizedLabel: string): DesignFamily | undefined {
  return byInkLabel.get(normalizedLabel);
}

/**
 * Primary-product selection inside one family. Lower number wins.
 * Order validated against real INK names (see ADR 0001): the plain product is always the card;
 * variants are alternatives shown only in the detailed view.
 */
const VARIANT_ORDER: Readonly<Record<string, readonly string[]>> = {
  "ponto-de-origem": ["base", "regional", "personalizado", "localidade", "distrito", "legenda", "explicativa"],
  coordenadas: ["base", "personalizado", "centro"],
  territorio: ["base", "desde"],
};

export function variantRank(family: DesignFamilyId, variant: string): number {
  const order = VARIANT_ORDER[family] ?? ["base"];
  const index = order.indexOf(variant);
  return index === -1 ? order.length + 10 : index;
}

/** Human label for a normalized variant key. */
export function variantLabel(variant: string): string {
  if (variant === "base") return "Principal";
  return variant.charAt(0).toUpperCase() + variant.slice(1);
}
