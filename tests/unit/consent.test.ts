import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

// Minimal window stub (localStorage + addEventListener/removeEventListener) — no jsdom/happy-dom dependency
// needed for what store.ts actually touches. Fresh per test via vi.resetModules() so the module's own
// `cached` variable (an internal cache, not exported) never leaks a value between tests.
function stubWindow() {
  const data = new Map<string, string>();
  const listeners = new Map<string, Set<(e: unknown) => void>>();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (k: string) => (data.has(k) ? data.get(k)! : null),
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k),
    },
    addEventListener: (type: string, fn: (e: unknown) => void) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(fn);
    },
    removeEventListener: (type: string, fn: (e: unknown) => void) => {
      listeners.get(type)?.delete(fn);
    },
  });
  return { data, listeners };
}

beforeEach(() => {
  vi.resetModules();
  // These tests exercise the consent MECHANISM, i.e. the strict gate (production builds leave it off: see measurement-policy.test.ts).
  vi.stubEnv("NEXT_PUBLIC_MEASUREMENT_REQUIRES_CONSENT", "true");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("consent store", () => {
  test("given nothing decided yet, when read, then the snapshot is null (never presumed as consent)", async () => {
    stubWindow();
    const { getConsentSnapshot } = await import("@/lib/consent/store");
    expect(getConsentSnapshot()).toBeNull();
  });

  test("given accept is written, when read back, then it round-trips with a version and a timestamp", async () => {
    stubWindow();
    const { writeConsent, getConsentSnapshot } = await import("@/lib/consent/store");
    writeConsent("accepted");
    const record = getConsentSnapshot();
    expect(record?.choice).toBe("accepted");
    expect(record?.version).toBe(2);
    expect(typeof record?.decidedAt).toBe("string");
  });

  test("given reject is written, when read back, then it round-trips too", async () => {
    stubWindow();
    const { writeConsent, getConsentSnapshot } = await import("@/lib/consent/store");
    writeConsent("rejected");
    expect(getConsentSnapshot()?.choice).toBe("rejected");
  });

  test("given a stored record from a different (future) version, when read, then it is treated as no decision", async () => {
    const { data } = stubWindow();
    data.set("useorigens:consent:marketing", JSON.stringify({ choice: "accepted", version: 999, decidedAt: "2026-01-01T00:00:00.000Z" }));
    const { getConsentSnapshot } = await import("@/lib/consent/store");
    expect(getConsentSnapshot()).toBeNull();
  });

  test("given a v1 decision (Meta-only scope), when read, then it is treated as no decision so the wider scope is asked again", async () => {
    const { data } = stubWindow();
    data.set("useorigens:consent:marketing", JSON.stringify({ choice: "accepted", version: 1, decidedAt: "2026-01-01T00:00:00.000Z" }));
    const { getConsentSnapshot, hasAnalyticsConsent } = await import("@/lib/consent/store");
    expect(getConsentSnapshot()).toBeNull();
    expect(hasAnalyticsConsent()).toBe(false);
  });

  test("given accept then reject, when hasAnalyticsConsent is asked, then only the accepted state answers true", async () => {
    stubWindow();
    const { writeConsent, clearConsent, hasAnalyticsConsent } = await import("@/lib/consent/store");
    expect(hasAnalyticsConsent()).toBe(false);
    writeConsent("accepted");
    expect(hasAnalyticsConsent()).toBe(true);
    writeConsent("rejected");
    expect(hasAnalyticsConsent()).toBe(false);
    writeConsent("accepted");
    clearConsent();
    expect(hasAnalyticsConsent()).toBe(false);
  });

  test("given corrupted JSON in storage, when read, then it is treated as no decision, never a crash", async () => {
    const { data } = stubWindow();
    data.set("useorigens:consent:marketing", "{not json");
    const { getConsentSnapshot } = await import("@/lib/consent/store");
    expect(() => getConsentSnapshot()).not.toThrow();
    expect(getConsentSnapshot()).toBeNull();
  });

  test("given an accepted decision, when cleared (footer 'Preferências de privacidade'), then it goes back to no decision", async () => {
    stubWindow();
    const { writeConsent, clearConsent, getConsentSnapshot } = await import("@/lib/consent/store");
    writeConsent("accepted");
    expect(getConsentSnapshot()).not.toBeNull();
    clearConsent();
    expect(getConsentSnapshot()).toBeNull();
  });

  test("given a subscriber, when the choice changes, then it is notified", async () => {
    stubWindow();
    const { writeConsent, subscribeConsent } = await import("@/lib/consent/store");
    let notified = 0;
    const unsubscribe = subscribeConsent(() => notified++);
    writeConsent("accepted");
    expect(notified).toBe(1);
    unsubscribe();
    writeConsent("rejected");
    expect(notified).toBe(1); // unsubscribed — no further notifications
  });

  test("given storage throws (private mode / blocked), when writing, then it never throws and the in-memory value still updates", async () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => {
          throw new Error("blocked");
        },
        setItem: () => {
          throw new Error("blocked");
        },
        removeItem: () => {
          throw new Error("blocked");
        },
      },
      addEventListener: () => {},
      removeEventListener: () => {},
    });
    const { writeConsent, getConsentSnapshot } = await import("@/lib/consent/store");
    expect(() => writeConsent("accepted")).not.toThrow();
    expect(getConsentSnapshot()?.choice).toBe("accepted");
  });
});
