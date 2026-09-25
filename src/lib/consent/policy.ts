import type { ConsentRecord } from "./store";

/**
 * Does Meta Pixel / GA4 measurement wait for the cookie banner? Business decision of the owner (2026-09-25): NO, by default, the same as the
 * INK store the visitor comes from (its tags fire before, and regardless of, its own cookie notice). The banner stays on screen and still
 * records the visitor's choice, but the choice no longer switches measurement on or off.
 *
 * The gate is kept as a build-time switch, not deleted: `NEXT_PUBLIC_MEASUREMENT_REQUIRES_CONSENT=true` restores the previous behaviour
 * (nothing is loaded or sent until "Aceitar", and it stops on reject/revoke). The strict-gate test suites run with it on; production
 * builds leave it unset. Written with the literal `process.env.NEXT_PUBLIC_*` so Next inlines it into the client bundle.
 */
export const measurementRequiresConsent = (): boolean => process.env.NEXT_PUBLIC_MEASUREMENT_REQUIRES_CONSENT === "true";

/** Whether Meta / GA4 may load and send events, given the visitor's stored decision (`null` = none yet). */
export function measurementAllowed(record: ConsentRecord | null): boolean {
  return measurementRequiresConsent() ? record?.choice === "accepted" : true;
}
