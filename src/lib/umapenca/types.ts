import type { RegionSlug } from "../geo/regions";

/** The kinds of "outros artigos" the storefront shows, in display order. A feed item of any other kind is excluded, never guessed. */
export const ARTICLE_KINDS = ["caneca", "ecobag"] as const;
export type ArticleKind = (typeof ARTICLE_KINDS)[number];

export const ARTICLE_KIND_LABELS: Record<ArticleKind, { singular: string; plural: string }> = {
  caneca: { singular: "Caneca", plural: "Canecas" },
  ecobag: { singular: "Ecobag", plural: "Ecobags" },
};

/** One Uma Penca product, reduced from its Google Merchant feed entry. Everything is exactly what the feed said. */
export type UmaPencaArticle = {
  id: string;
  kind: ArticleKind;
  title: string;
  description: string;
  /** Verified https umapenca.com product page (see hosts.ts). */
  url: string;
  imageUrl: string;
  additionalImageUrls: string[];
  /** Regular price in BRL, or null when the feed gave none. */
  price: number | null;
  /** Promotional price in BRL, only when lower than `price`. */
  salePrice: number | null;
  color: string | null;
  /**
   * The region of the place the title names ("Caneca Lá de Palmas – TO" → norte), or null when it names none (shown in every region).
   * See region.ts. Absent in a snapshot written before the split: read as null until the next sync.
   */
  region?: RegionSlug | null;
  /** The UF of that place, when it is a single one. */
  uf?: string | null;
};

export type ExcludedArticle = { id: string; title: string; reason: string };

export type UmaPencaSnapshot = {
  version: 1;
  syncedAt: string;
  articles: UmaPencaArticle[];
};
