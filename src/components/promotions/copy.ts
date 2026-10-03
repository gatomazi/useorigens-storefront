/**
 * Copies a coupon code. The async Clipboard API first (secure context, user gesture); then the old `execCommand("copy")` on an off-screen, read-only
 * textarea (in-app browsers of Instagram/Facebook and older WebViews often lack the first). `false` when neither worked: the caller then selects the
 * code on screen so the visitor can copy it by hand. Never throws.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Permission refused or not a user gesture: try the fallback.
  }
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    // Off-screen and 16px: iOS zooms into a focused field under 16px; `readonly` keeps the keyboard closed.
    area.style.cssText = "position:fixed;top:0;left:-9999px;opacity:0;font-size:16px";
    const active = document.activeElement as HTMLElement | null;
    document.body.appendChild(area);
    area.select();
    area.setSelectionRange(0, text.length);
    const ok = document.execCommand("copy");
    area.remove();
    active?.focus?.({ preventScroll: true });
    return ok;
  } catch {
    return false;
  }
}

/** Selects the text of an element (the visible code), for a manual copy when copying failed. */
export function selectText(el: HTMLElement | null): void {
  if (!el) return;
  try {
    const range = document.createRange();
    range.selectNodeContents(el);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  } catch {
    // Nothing else to do: the code is on screen anyway.
  }
}
