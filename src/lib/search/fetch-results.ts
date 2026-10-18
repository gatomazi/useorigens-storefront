import type { RegionSlug } from "@/lib/geo/regions";
import type { GlobalSearchResponse } from "./global";

/** Every search reads the current published settings, including after reopening the dialog or repeating a query. */
export async function fetchResults(region: RegionSlug, q: string, signal: AbortSignal): Promise<GlobalSearchResponse> {
  const res = await fetch(`/api/busca?${new URLSearchParams({ region, q })}`, { signal, cache: "no-store" });
  if (!res.ok) throw new Error(`search ${res.status}`);
  return res.json() as Promise<GlobalSearchResponse>;
}
