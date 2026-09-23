"use client";

import { createContext, useContext, useMemo, useSyncExternalStore } from "react";
import { clearConsent, getConsentSnapshot, getServerConsentSnapshot, subscribeConsent, writeConsent, type ConsentRecord } from "./store";

type ConsentContextValue = {
  /** null = no decision yet (never chosen, storage blocked, or an old version) — every consumer must treat
   * this the same as "rejected" for anything that sends data anywhere. */
  record: ConsentRecord | null;
  accept: () => void;
  reject: () => void;
  /** Forgets the decision (footer "Preferências de privacidade") — the banner reappears on the next render. */
  revoke: () => void;
};

const ConsentContext = createContext<ConsentContextValue | null>(null);

/**
 * Wraps the whole app (root layout) so the banner and the Pixel loader share one source of truth.
 * `useSyncExternalStore`'s server snapshot is always `null` ("no decision yet"), so nothing that depends on
 * consent can ever fire during the render that produces the initial HTML — only once this has actually
 * subscribed to the real client-side value.
 */
export function ConsentProvider({ children }: { children: React.ReactNode }) {
  const record = useSyncExternalStore(subscribeConsent, getConsentSnapshot, getServerConsentSnapshot);
  const value = useMemo<ConsentContextValue>(
    () => ({
      record,
      accept: () => writeConsent("accepted"),
      reject: () => writeConsent("rejected"),
      revoke: () => clearConsent(),
    }),
    [record],
  );
  return <ConsentContext.Provider value={value}>{children}</ConsentContext.Provider>;
}

export function useConsent(): ConsentContextValue {
  const ctx = useContext(ConsentContext);
  if (!ctx) throw new Error("useConsent must be used within ConsentProvider");
  return ctx;
}
