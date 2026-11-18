"use client";

import type { EmblaCarouselType } from "embla-carousel";
import { useCallback, useSyncExternalStore } from "react";

/** Whether an Embla carousel can still scroll each way. Its position is an external system, so the arrows subscribe to it (as ProductCarousel's do). */
export function useEmblaArrows(embla: EmblaCarouselType | undefined): { canPrev: boolean; canNext: boolean } {
  const subscribe = useCallback(
    (notify: () => void) => {
      if (!embla) return () => {};
      embla.on("select", notify).on("reInit", notify).on("scroll", notify);
      return () => {
        embla.off("select", notify).off("reInit", notify).off("scroll", notify);
      };
    },
    [embla],
  );
  const canPrev = useSyncExternalStore(subscribe, () => embla?.canScrollPrev() ?? false, () => false);
  const canNext = useSyncExternalStore(subscribe, () => embla?.canScrollNext() ?? true, () => true);
  return { canPrev, canNext };
}
