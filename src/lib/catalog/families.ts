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

/** The eight conceptual city design families, in storefront order. */
export const DESIGN_FAMILIES: readonly DesignFamily[] = [
  { id: "legado", name: "Legado", description: "Silhueta do estado, nome da cidade e nome do estado.", sortOrder: 1, inkLabel: "legado" },
  { id: "ponto-de-origem", name: "Ponto de Origem", description: "Mapa do estado dividido em municípios, com a cidade marcada.", sortOrder: 2, inkLabel: "origem" },
  { id: "coordenadas", name: "Coordenadas", description: "Rosa dos ventos com o nome e as coordenadas da cidade.", sortOrder: 3, inkLabel: "coordenadas" },
  { id: "tipografia", name: "Tipografia", description: "Só tipografia: o nome da cidade.", sortOrder: 4, inkLabel: "tipografia" },
  { id: "traco", name: "Traço", description: "Contorno do estado em uma linha, com o nome da cidade.", sortOrder: 5, inkLabel: "traco" },
  { id: "territorio", name: "Território", description: "Mapa do estado com as divisas em tom discreto e a cidade marcada.", sortOrder: 6, inkLabel: "territorio" },
  { id: "feito-em", name: "Feito em", description: "“Feito em” com o nome da cidade e do estado.", sortOrder: 7, inkLabel: null },
  { id: "gentilico", name: "Gentílico", description: "O gentílico da cidade, em texto simples.", sortOrder: 8, inkLabel: "gentilico" },
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
