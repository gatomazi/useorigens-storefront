/** Shared by the CMS, server pagination and the collection's interactive filters. Missing metadata never becomes an invented date or sale. */
export const PRODUCT_SORTS = ["collection", "newest", "best-selling", "price-asc", "price-desc"] as const;
export type ProductSort = (typeof PRODUCT_SORTS)[number];
export const PRODUCT_SORT_LABEL: Record<ProductSort, string> = { collection: "Ordem da coleção", newest: "Novidades", "best-selling": "Mais vendidas", "price-asc": "Menor preço", "price-desc": "Maior preço" };
export const isProductSort = (value: unknown): value is ProductSort => typeof value === "string" && (PRODUCT_SORTS as readonly string[]).includes(value);
export type ProductSortData = { id?: string; createdAt?: string | null; rawPrice?: number | null };
/** Fresh net sales in the storefront's existing 30-day window. Null means no usable snapshot. */
export type ProductSalesUnits = Readonly<Record<string, number>> | null;

/** Keep only the real ordering signals of this product when building storefront cards. */
export function productSortData(product: Pick<ProductSortData, "createdAt">): Pick<ProductSortData, "createdAt"> {
  return product.createdAt ? { createdAt: product.createdAt } : {};
}

/** Stable ties preserve the original collection/curation order. Unknown dates/prices go after known ones; missing sales count as zero. */
export function sortProducts<T extends ProductSortData>(items: readonly T[], sort: ProductSort = "collection", sales: ProductSalesUnits = null): T[] {
  if (sort === "collection") return [...items];
  if (sort === "best-selling" && sales === null) return [...items];
  const value = (item: T): number | null => {
    if (sort === "newest") {
      const date = item.createdAt ? Date.parse(item.createdAt) : NaN;
      return Number.isFinite(date) ? date : null;
    }
    if (sort === "best-selling") {
      const units = item.id ? sales?.[item.id] : 0;
      return typeof units === "number" && Number.isFinite(units) && units >= 0 ? units : 0;
    }
    return typeof item.rawPrice === "number" && Number.isFinite(item.rawPrice) ? item.rawPrice : null;
  };
  const direction = sort === "price-asc" ? 1 : -1;
  return items.map((item, index) => ({ item, index, value: value(item) })).sort((a, b) => a.value === null ? b.value === null ? a.index - b.index : 1 : b.value === null ? -1 : (a.value - b.value) * direction || a.index - b.index).map(({ item }) => item);
}
