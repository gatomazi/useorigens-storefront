"use client";

import { useEffect, useRef } from "react";

/**
 * One row of header links that never breaks the header: the row is one line tall and wraps, so a link that does not fit falls to a second, clipped line.
 * This marks those links `data-overflow` (styled `invisible`), which also takes them out of the tab order and the accessibility tree. Order the children
 * by priority: the last ones go first. Measured again whenever the row or a link changes size (window, fonts).
 */
export function PriorityLinks({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const list = ref.current;
    if (!list) return;
    const update = () => {
      const items = [...list.children] as HTMLElement[];
      const firstLine = items[0]?.offsetTop ?? 0;
      for (const item of items) item.toggleAttribute("data-overflow", item.offsetTop > firstLine);
    };
    const observer = new ResizeObserver(update);
    observer.observe(list);
    for (const item of list.children) observer.observe(item);
    update();
    return () => observer.disconnect();
  }, [children]);

  return (
    <ul ref={ref} className={className}>
      {children}
    </ul>
  );
}
