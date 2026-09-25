import { afterEach, describe, expect, test, vi } from "vitest";
import { measurementAllowed, measurementRequiresConsent } from "@/lib/consent/policy";
import type { ConsentRecord } from "@/lib/consent/store";

const record = (choice: "accepted" | "rejected"): ConsentRecord => ({ choice, version: 2, decidedAt: "2026-09-25T00:00:00.000Z" });
afterEach(() => vi.unstubAllEnvs());

describe("measurement policy (Meta + GA4 vs the cookie banner)", () => {
  test("given the default build (switch unset), when asked, then measurement does NOT wait for the banner: no decision, accepted and rejected all measure", () => {
    expect(measurementRequiresConsent()).toBe(false);
    for (const r of [null, record("accepted"), record("rejected")]) expect(measurementAllowed(r)).toBe(true);
  });

  test("given the strict gate switched on, when asked, then only an explicit accepted decision measures (the previous behaviour, kept as a switch)", () => {
    vi.stubEnv("NEXT_PUBLIC_MEASUREMENT_REQUIRES_CONSENT", "true");
    expect(measurementRequiresConsent()).toBe(true);
    expect(measurementAllowed(null)).toBe(false);
    expect(measurementAllowed(record("rejected"))).toBe(false);
    expect(measurementAllowed(record("accepted"))).toBe(true);
  });

  test("given any value other than the literal 'true', when asked, then the gate stays off (no accidental strictness or looseness by typo)", () => {
    for (const v of ["1", "TRUE", "yes", ""]) {
      vi.stubEnv("NEXT_PUBLIC_MEASUREMENT_REQUIRES_CONSENT", v);
      expect(measurementRequiresConsent(), v).toBe(false);
    }
  });

  test("given the default build, when the store's shared check runs in a browser, then it is true with no decision and after a rejection", async () => {
    vi.resetModules();
    const data = new Map<string, string>();
    vi.stubGlobal("window", { localStorage: { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) }, addEventListener() {}, removeEventListener() {} });
    const { hasAnalyticsConsent, writeConsent } = await import("@/lib/consent/store");
    expect(hasAnalyticsConsent()).toBe(true);
    writeConsent("rejected");
    expect(hasAnalyticsConsent()).toBe(true);
    vi.unstubAllGlobals();
  });
});
