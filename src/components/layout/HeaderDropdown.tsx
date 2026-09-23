"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/**
 * Thin behavioural wrapper around a native `<details>` dropdown — keeps its markup and built-in
 * accessibility (keyboard toggle, screen readers already understand `<details>`/`<summary>`) but fixes the
 * one thing native `<details>` doesn't do on its own: close when the person clicks or taps outside it. Used
 * by both header dropdowns ("Sul" region switcher and the "Regiões" quick-state menu) so the fix and the
 * behaviour are identical for both, not two competing implementations.
 *
 * - Outside pointerdown (mouse or touch) while open closes it, anywhere on the page — including over other
 *   content — without blocking the click that follows (a real close, not an invisible backdrop that eats
 *   the next interaction).
 * - Escape closes it and returns focus to the trigger (`<summary>`).
 * - A real route change (selecting an option, or navigating some other way while open) closes it too.
 * - Clicking the trigger itself still toggles normally — `<details>` already does that; this component
 *   never intercepts that click.
 * - Exactly one global pointerdown + one keydown listener per open dropdown, both removed on close/unmount.
 */
export function HeaderDropdown({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    function close() {
      const details = ref.current;
      if (details?.open) details.open = false;
    }

    function onPointerDown(event: PointerEvent) {
      const details = ref.current;
      if (details?.open && event.target instanceof Node && !details.contains(event.target)) {
        close();
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      const details = ref.current;
      if (event.key === "Escape" && details?.open) {
        close();
        details.querySelector("summary")?.focus();
      }
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  // A real navigation while the dropdown is open (selecting an option, or the browser's own back/forward)
  // closes it — it should never still be open on the page it navigated to.
  useEffect(() => {
    const details = ref.current;
    if (details?.open) details.open = false;
  }, [pathname]);

  return (
    <details ref={ref} className={className}>
      {children}
    </details>
  );
}
