"use client";

import { useConsent } from "@/lib/consent/ConsentProvider";

/**
 * Permanent footer access to change the analytics/marketing cookie choice (command: "colocar um acesso permanente a
 * Preferências de privacidade/cookies no rodapé"). Reuses the banner itself as the "preferences" UI — revoking
 * clears the stored decision, so ConsentBanner reappears and the person can choose again, rather than building
 * a second, separate settings panel for the same two-choice decision.
 */
export function PrivacyPreferencesLink() {
  const { revoke } = useConsent();
  return (
    <button type="button" onClick={revoke} className="link-line inline-flex text-left min-h-11 min-w-11 items-center text-[0.9375rem]">
      Preferências de privacidade
    </button>
  );
}
