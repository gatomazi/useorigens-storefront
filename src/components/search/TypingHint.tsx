"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { firstTyping, HOLD_MS, nextTyping, typedText, TYPING_PREFIX, TYPING_STILL, TYPING_WORDS } from "@/lib/search/typing-hint";

const REDUCED = "(prefers-reduced-motion: reduce)";
const subscribeMotion = (onChange: () => void) => {
  const query = window.matchMedia?.(REDUCED);
  query?.addEventListener("change", onChange);
  return () => query?.removeEventListener("change", onChange);
};

/**
 * The words the phone header's search field "types" (lib/search/typing-hint.ts decides the rhythm). Decorative: the field's accessible name is the
 * still text, so this is hidden from screen readers. Starts with the first word whole (the server's render), pauses while the tab is hidden, and with
 * reduced motion shows every word at once, without a caret.
 */
export function TypingHint() {
  const [state, setState] = useState(() => firstTyping(TYPING_WORDS));
  const still = useSyncExternalStore(subscribeMotion, () => window.matchMedia?.(REDUCED).matches ?? false, () => false);

  useEffect(() => {
    if (still) return;
    let current = firstTyping(TYPING_WORDS);
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tick = () => {
      // A hidden tab stops typing; it picks up from the same letter when the tab is back.
      if (document.hidden) return;
      const { state: next, delay } = nextTyping(current, TYPING_WORDS);
      current = next;
      setState(next);
      timer = setTimeout(tick, delay);
    };
    const onVisible = () => {
      if (document.hidden) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(tick, HOLD_MS / 2);
    };
    timer = setTimeout(tick, HOLD_MS);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [still]);

  if (still) return <span aria-hidden="true">{TYPING_STILL}</span>;
  return (
    <span aria-hidden="true" data-typing-hint>
      {TYPING_PREFIX}
      {typedText(state, TYPING_WORDS)}
      <span className="typing-caret" />
    </span>
  );
}
