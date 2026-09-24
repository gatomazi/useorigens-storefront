"use client";

import { useEffect } from "react";

/**
 * Sets `data-hydrated="true"` on <html> once React has hydrated and every effect of the first commit (event listeners included) has
 * run. It is the concrete "the page is interactive" signal the E2E suite waits on (tests/e2e/fixtures.ts): a control being visible in
 * the server HTML does NOT mean its handler is installed yet, and a click before hydration is silently lost. No visual or behavioural
 * effect; rendered last in <body> so its effect runs after those of everything before it.
 */
export function HydrationSignal() {
  useEffect(() => {
    document.documentElement.dataset.hydrated = "true";
  }, []);
  return null;
}
