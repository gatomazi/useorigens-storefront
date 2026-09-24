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

import { hasAnalyticsConsent } from "@/lib/consent/store";
import type { CartItemsBucket, MirrorAgeBucket, OrigensEntryPoint } from "./origens-events";

declare global {
  interface Window {
    fbq?: ((...args: unknown[]) => void) & { queue?: unknown[] };
    gtag?: (...args: unknown[]) => void;
  }
}

// Every helper also requires a live "accepted" decision: after "Preferências de privacidade" → Rejeitar the SDK
// globals stay on `window` for the rest of the session, so their mere presence is not consent. Tracking is
// best-effort — a provider that throws must never break the click/navigation that triggered it.
function fbqReady(): boolean {
  return typeof window !== "undefined" && typeof window.fbq === "function" && hasAnalyticsConsent();
}
function gtagReady(): boolean {
  return typeof window !== "undefined" && typeof window.gtag === "function" && hasAnalyticsConsent();
}
function sendFbq(...args: unknown[]): void {
  try {
    window.fbq!(...args);
  } catch {
    // Blocked/broken SDK (ad blocker, extension): tracking is best-effort, navigation must go on.
  }
}
function sendGtag(...args: unknown[]): void {
  try {
    window.gtag!(...args);
  } catch {
    // Same as sendFbq.
  }
}

/** Search (Meta standard event) + `view_search_results` (GA4 recommended event) — the single conclusive
 * search gesture, never a keystroke. `region`/`resultsCount` are GA4-only extras (§5: "se esses dados já
 * estiverem disponíveis sem criar custo ou acoplamento desnecessário"); Meta's own Search payload is
 * unchanged by their presence. */
export function trackSearch(searchTerm: string, extra?: { region?: string; resultsCount?: number }): void {
  if (fbqReady()) {
    sendFbq("track", "Search", { search_string: searchTerm });
  }
  if (gtagReady()) {
    sendGtag("event", "view_search_results", {
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
    sendFbq("trackCustom", "SelectCity", {
      city: params.city,
      state: params.state,
      region: params.region,
      ...(params.cityId ? { city_id: params.cityId } : {}),
    });
  }
  if (gtagReady()) {
    sendGtag("event", "select_city", {
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
  sendGtag("event", "select_state", {
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
    sendFbq("trackCustom", "GoToInk", {
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
    sendGtag("event", "select_item", {
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
    sendGtag("event", "go_to_ink", {
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
  sendGtag("event", "page_view", {
    page_location: params.pageLocation,
    page_path: params.pagePath,
    ...(params.pageTitle ? { page_title: params.pageTitle } : {}),
    ...(params.region ? { region: params.region } : {}),
  });
}

// ── Use Origens cart-bridge events v1 (GA4 custom events, docs/expansao-cinco-produtos-analytics.md) ───────────────────────────────
// GA4-only (no Meta equivalent, and never a Meta Purchase/InitiateCheckout: the visitor only opened the cart). Same consent gate and
// best-effort rule as everything above. The parameters are a closed set of low-cardinality enums: never the cart token, the snapshot,
// a URL, free text or an identifier. `transport_type: "beacon"` lets a click that leaves the domain still deliver its event.
const REGION = "sul";

export function trackGoToCartClick(params: { cartItemsBucket: CartItemsBucket }): void {
  if (!gtagReady()) return;
  sendGtag("event", "origens_go_to_cart_click", { entry_point: "storefront_cart_mirror", region: REGION, cart_items_bucket: params.cartItemsBucket, transport_type: "beacon" });
}

/** One per opening of "Meu carrinho" with a valid snapshot on screen (the denominator of the click above); never the neutral/error state. */
export function trackCartMirrorView(params: { cartItemsBucket: CartItemsBucket; mirrorAgeBucket: MirrorAgeBucket }): void {
  if (!gtagReady()) return;
  sendGtag("event", "origens_cart_mirror_view", { entry_point: "storefront_cart_mirror", region: REGION, cart_items_bucket: params.cartItemsBucket, mirror_age_bucket: params.mirrorAgeBucket });
}

/** A real landing from one of our INK links. `productSlug` only when it is one of the five verified slugs (validated by the caller). */
export function trackStorefrontArrived(params: { entryPoint: OrigensEntryPoint; productSlug: string | null }): void {
  if (!gtagReady()) return;
  sendGtag("event", "origens_storefront_arrived", { entry_point: params.entryPoint, region: REGION, ...(params.productSlug ? { product_slug: params.productSlug } : {}) });
}

/**
 * Runs `send` once, as soon as analytics is really available (gtag defined AND consent accepted), for at most ~10 s; otherwise it is
 * dropped: nothing is queued beyond that, so a visitor who never accepts is never tracked later. Returns a cancel function.
 */
export function whenAnalyticsReady(send: () => void, intervalMs = 250, maxAttempts = 40): () => void {
  if (typeof window === "undefined") return () => undefined;
  let attempts = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const tick = () => {
    if (gtagReady()) {
      send();
      return;
    }
    if (++attempts < maxAttempts) timer = setTimeout(tick, intervalMs);
  };
  tick();
  return () => timer && clearTimeout(timer);
}
