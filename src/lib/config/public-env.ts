// Client-safe env accessors: NEXT_PUBLIC_* vars only, inlined into the browser bundle at `next build` time
// by Next.js's own tooling wherever `process.env.NEXT_PUBLIC_*` appears literally in client code. Deliberately
// NOT `server-only` (unlike src/lib/config/env.ts) — this file is imported from client components.

/** Meta Pixel ID. Unset by default (no pixel in local dev unless explicitly set for diagnostics — see
 * docs/deploy/railway.md). Never hardcode the real ID here; it only ever comes from the env var. */
export function metaPixelId(): string | null {
  const id = process.env.NEXT_PUBLIC_META_PIXEL_ID;
  return id && id.length > 0 ? id : null;
}

/** GA4 Measurement ID (CLAUDE_GA4_STOREFRONT_TRACKING.md), same pattern as `metaPixelId()` above: unset by
 * default, never hardcoded, only ever read from the env var. */
export function gaMeasurementId(): string | null {
  const id = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
  return id && id.length > 0 ? id : null;
}
