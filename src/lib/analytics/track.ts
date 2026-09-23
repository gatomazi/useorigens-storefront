/**
 * The one typed module every event-firing site imports — handlers call `trackSearch`/`trackSelectCity`/
 * `trackSelectState`/`trackGoToInk` and know nothing about `fbq`/`gtag`, consent state, or either provider's
 * own lifecycle (CLAUDE_ADENDO_4_EVENTOS_META_STOREFRONT.md §3, extended by CLAUDE_GA4_STOREFRONT_TRACKING.md
 * §10: "GA4 e Meta devem compartilhar, quando fizer sentido, o mesmo ponto de instrumentação... não criar
 * handlers diferentes espalhados pelo projeto"). Every function here is a safe no-op for whichever provider
 * isn't loaded (not accepted yet, ad blocked, its env var unset, or the global genuinely absent) — nothing is
 * queued for later, nothing throws, callers never need to check anything first, and one provider being absent
 * never skips the other.
 *
 * Meta's event contract stays exactly the four events already established (`PageView`, `Search`, `SelectCity`,
 * `GoToInk`) — nothing here adds a fifth. `trackSelectState` and the `select_item` half of `trackGoToInk` are
 * GA4-only, with no Meta equivalent by design. `Meta`'s own `PageView` lifecycle stays owned entirely by
 * `src/components/analytics/MetaPixel.tsx`; GA4's `page_view` lifecycle is owned the same way by
 * `GoogleAnalytics.tsx`, which calls `trackPageView` below rather than touching `window.gtag` directly.
 */

declare global {
  interface Window {
    fbq?: ((...args: unknown[]) => void) & { queue?: unknown[] };
    gtag?: (...args: unknown[]) => void;
  }
}

function fbqReady(): boolean {
  return typeof window !== "undefined" && typeof window.fbq === "function";
}
function gtagReady(): boolean {
  return typeof window !== "undefined" && typeof window.gtag === "function";
}

/** Search (Meta standard event) + `view_search_results` (GA4 recommended event) — the single conclusive
 * search gesture, never a keystroke. `region`/`resultsCount` are GA4-only extras (§5: "se esses dados já
 * estiverem disponíveis sem criar custo ou acoplamento desnecessário"); Meta's own Search payload is
 * unchanged by their presence. */
export function trackSearch(searchTerm: string, extra?: { region?: string; resultsCount?: number }): void {
  if (fbqReady()) {
    window.fbq!("track", "Search", { search_string: searchTerm });
  }
  if (gtagReady()) {
    window.gtag!("event", "view_search_results", {
      search_term: searchTerm,
      ...(extra?.region ? { region: extra.region } : {}),
      ...(extra?.resultsCount !== undefined ? { results_count: extra.resultsCount } : {}),
    });
  }
}

export type SelectCityParams = {
  city: string;
  state: string;
  region: string;
  /** Real IBGE municipality id already in the catalog, when known. */
  cityId?: string;
  /** GA4-only: a standardized source (src/lib/analytics/sources.ts) — never sent to Meta, whose SelectCity
   * contract (CLAUDE_ADENDO_4_EVENTOS_META_STOREFRONT.md) doesn't carry it. */
  source?: string;
};

/** SelectCity (Meta custom event) + `select_city` (GA4 custom event) — an explicit city choice: search/
 * autocomplete, the state page's city listing, a mesoregion/A–Z browser, or a city-to-city link. Never fired
 * for arriving at a city route directly (URL, reload, back/forward, SSR). */
export function trackSelectCity(params: SelectCityParams): void {
  if (fbqReady()) {
    window.fbq!("trackCustom", "SelectCity", {
      city: params.city,
      state: params.state,
      region: params.region,
      ...(params.cityId ? { city_id: params.cityId } : {}),
    });
  }
  if (gtagReady()) {
    window.gtag!("event", "select_city", {
      city: params.city,
      state: params.state,
      region: params.region,
      ...(params.cityId ? { city_id: params.cityId } : {}),
      ...(params.source ? { source: params.source } : {}),
    });
  }
}

export type SelectStateParams = {
  state: string;
  region: string;
  /** Standardized source (src/lib/analytics/sources.ts). */
  source?: string;
};

/** `select_state` (GA4 custom event) — an explicit state choice (Regiões menu, footer, home's state chooser).
 * Never fired for arriving at a state route directly by URL. GA4-only: Meta's four-event contract
 * (CLAUDE_ADENDO_4_EVENTOS_META_STOREFRONT.md) has no state-selection event and this round doesn't add one. */
export function trackSelectState(params: SelectStateParams): void {
  if (!gtagReady()) return;
  window.gtag!("event", "select_state", {
    state: params.state,
    region: params.region,
    ...(params.source ? { source: params.source } : {}),
  });
}

export type GoToInkParams = {
  /** The real INK product id (CityDesignBinding.inkProductId / MerchProduct.inkProductId) — never invented. */
  productId: string;
  /** Stable identifier for where the click happened (src/lib/analytics/sources.ts), e.g. "city_styles", "pdp",
   * "home_terra" — also GA4's `item_list_name`. */
  sourceSection: string;
  city?: string;
  state?: string;
  family?: string;
  /** Only when a confirmed price came from the current snapshot — never invented. */
  value?: number;
  /** GA4-only additions below — never sent to Meta's GoToInk payload, whose shape is unchanged from before. */
  productName?: string;
  /** The real, verified INK URL the click is about to open. */
  destinationUrl?: string;
};

/** GoToInk (Meta custom event) + `select_item` and `go_to_ink` (GA4: one recommended, one custom) — a real
 * click on a verified INK destination. Means forwarding/intent only, never ViewContent/AddToCart/
 * InitiateCheckout/Purchase on either provider (those stay exclusively the INK domain's own events).
 * `select_item` fires first (GA4's own recommended event for "chose a product in a listing", §8: "ANTES da
 * navegação para a INK"), immediately followed by `go_to_ink` — same click, same instrumentation point, never
 * two separate handlers for the same business action (§10). */
export function trackGoToInk(params: GoToInkParams): void {
  if (fbqReady()) {
    window.fbq!("trackCustom", "GoToInk", {
      product_id: params.productId,
      source_section: params.sourceSection,
      currency: "BRL",
      ...(params.city ? { city: params.city } : {}),
      ...(params.state ? { state: params.state } : {}),
      ...(params.family ? { family: params.family } : {}),
      ...(params.value !== undefined ? { value: params.value } : {}),
    });
  }
  if (gtagReady()) {
    window.gtag!("event", "select_item", {
      item_list_name: params.sourceSection,
      items: [
        {
          item_id: params.productId,
          ...(params.productName ? { item_name: params.productName } : {}),
          ...(params.family ? { item_category: params.family } : {}),
          ...(params.value !== undefined ? { price: params.value, currency: "BRL" } : {}),
        },
      ],
    });
    window.gtag!("event", "go_to_ink", {
      product_id: params.productId,
      source_section: params.sourceSection,
      ...(params.productName ? { product_name: params.productName } : {}),
      ...(params.city ? { city: params.city } : {}),
      ...(params.state ? { state: params.state } : {}),
      ...(params.family ? { family: params.family } : {}),
      ...(params.value !== undefined ? { value: params.value, currency: "BRL" } : {}),
      ...(params.destinationUrl ? { destination_url: params.destinationUrl } : {}),
    });
  }
}

export type PageViewParams = {
  pageLocation: string;
  pagePath: string;
  pageTitle?: string;
  region?: string;
};

/** `page_view` (GA4) — called by `GoogleAnalytics.tsx` only, which owns the dedup lifecycle (once per real
 * load/SPA navigation, mirroring how `MetaPixel.tsx` owns Meta's own `PageView`) — never a per-business-action
 * call site. Not sent to Meta: its `PageView` lifecycle lives entirely in `MetaPixel.tsx`. */
export function trackPageView(params: PageViewParams): void {
  if (!gtagReady()) return;
  window.gtag!("event", "page_view", {
    page_location: params.pageLocation,
    page_path: params.pagePath,
    ...(params.pageTitle ? { page_title: params.pageTitle } : {}),
    ...(params.region ? { region: params.region } : {}),
  });
}
