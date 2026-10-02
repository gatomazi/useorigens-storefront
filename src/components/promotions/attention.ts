/**
 * When the coupon button may give its small "wiggle". Pure, so the rhythm is unit-tested; the component only supplies the clock, the randomness and
 * what the page looks like right now. The button wants to be DISCOVERED, never to pull the visitor away from buying:
 *   - never continuous: the first nudge after ~4–6 s on the page, then at most one per ~12–18 s of inactivity, and at most three per page view;
 *   - never while the panel, a menu, a drawer or a dialog is open, while the visitor types, while the tab is hidden or the button is not shown;
 *   - never at all with `prefers-reduced-motion: reduce`, nor for the rest of the session once the visitor opened the panel, copied or closed it.
 */
export const FIRST_NUDGE_MS = [4000, 6000] as const;
export const REPEAT_NUDGE_MS = [12000, 18000] as const;
export const MAX_NUDGES = 3;
/** Total length of one wiggle (two quick oscillations), the CSS animation in globals.css. */
export const NUDGE_DURATION_MS = 560;
/** sessionStorage key: set once the visitor interacted, the button stays still for the rest of the session. */
export const QUIET_KEY = "origens:promo:quiet";

/** Delay before the next nudge, or `null` when this page view already had its share. `random` is in [0, 1). */
export function nudgeDelay(done: number, random: number): number | null {
  if (done >= MAX_NUDGES) return null;
  const [min, max] = done === 0 ? FIRST_NUDGE_MS : REPEAT_NUDGE_MS;
  return Math.round(min + Math.min(Math.max(random, 0), 1) * (max - min));
}

export type PageCalm = {
  panelOpen: boolean;
  /** A menu, drawer, search or dialog of the page is open. */
  overlayOpen: boolean;
  typing: boolean;
  hidden: boolean;
  /** The button itself is not on screen (hidden for a collision, the keyboard, ...). */
  buttonHidden: boolean;
  reducedMotion: boolean;
  quiet: boolean;
};

export const mayNudge = (s: PageCalm): boolean => !s.panelOpen && !s.overlayOpen && !s.typing && !s.hidden && !s.buttonHidden && !s.reducedMotion && !s.quiet;

/** A text field has the focus (the virtual keyboard is, or is about to be, open). */
export function isTypingTarget(el: Element | null): boolean {
  if (!el) return false;
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return true;
  if (el instanceof HTMLInputElement) return !["button", "checkbox", "radio", "submit", "reset", "range", "color", "file", "image"].includes(el.type);
  return el instanceof HTMLElement && el.isContentEditable;
}
