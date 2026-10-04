import type { DesignFamilyId } from "../catalog/families";
import type { CommerceStoreKey, RegionSlug } from "../geo/regions";

/**
 * O Pódio — internal model. Everything in this file is INTERNAL (unit counts, full rankings, unmapped items): it lives only in the
 * snapshot files on the Volume. What reaches a page is the lean projection in `public.ts`, which never carries a count.
 */

/** One order line reduced to what the ranking needs. Buyer, address, payment details and prices are dropped at parse time. */
export type PodioOrderItem = {
  itemId: string;
  quantity: number;
  refundedQuantity: number;
  freeQuantity: number;
  product: { id: string; name: string; tags: string[] };
};

export type PodioOrder = {
  orderId: string;
  /** ISO 8601 with offset, exactly as INK returned it (order creation). */
  createdAt: string;
  /** INK's (localized) payment status text, e.g. "Pago". */
  paymentStatus: string;
  isExchange: boolean;
  totalValue: number | null;
  items: PodioOrderItem[];
};

/** Where one sold unit counts. A missing `localityKey` or `family` means it only counts in the other ranking. */
export type ResolvedItem =
  | { ok: true; uf: string; localityKey: string | null; family: DesignFamilyId | null; via: "catalog" | "name" }
  | { ok: false; reason: UnmappedReason };

export type UnmappedReason = "not-a-city-design" | "unclassified-family" | "no-unambiguous-uf" | "outside-region";

/** Movement relative to the previous day's snapshot of the same region/UF/ranking. `null` everywhere when there is no such snapshot. */
export type Movement = { kind: "up" | "down"; by: number } | { kind: "same" } | { kind: "new"; from: number | null };

export type RankEntry = {
  /** Canonical id: a locality key (IBGE municipality id or DF administrative-region id) or a design family id. */
  id: string;
  /** Net eligible units. INTERNAL ONLY. */
  units: number;
  /** 1-based, unique (ties are broken deterministically, see `rank.ts`). */
  position: number;
  previousPosition: number | null;
  movement: Movement | null;
};

export type FamilyRankEntry = RankEntry & {
  /** Localities (same UF) whose products contributed to this family, most units first — candidates for the representative image. */
  representatives: string[];
};

export type StateRanking = { localities: RankEntry[]; families: FamilyRankEntry[] };

export type PodioExclusions = {
  notPaid: number;
  exchange: number;
  zeroValue: number;
  outsideWindow: number;
  duplicate: number;
};

export type PodioUnmapped = { productId: string; name: string; units: number; reason: UnmappedReason };

export type PodioSnapshot = {
  version: 1;
  region: RegionSlug;
  storeKey: CommerceStoreKey;
  /** D, the São Paulo calendar day the ranking is "as of" (YYYY-MM-DD). */
  referenceDate: string;
  /** [start, end) as instants: midnight of D−30 to midnight of D, America/Sao_Paulo. */
  window: { start: string; end: string };
  computedAt: string;
  /** Reference date of the snapshot used for movement/ties (always D−1), or null when there was none. */
  comparedWith: string | null;
  sync: {
    status: "complete";
    requests: number;
    ordersFetched: number;
    ordersEligible: number;
    unitsEligible: number;
    unitsMapped: number;
    excluded: PodioExclusions;
  };
  states: Record<string, StateRanking>;
  unmapped: PodioUnmapped[];
};

/** Last attempt per region, success or not — what lets a page say "atualização pendente" without guessing. */
export type PodioRunState = {
  version: 1;
  lastAttempt: { at: string; ok: boolean; referenceDate: string; error?: string };
  lastSuccess: { at: string; referenceDate: string } | null;
};
