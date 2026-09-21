"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Sticky header that is quiet at the top of the page (no rule, taller) and becomes a solid,
 * slightly shorter bar once the page scrolls. A sentinel + IntersectionObserver avoids scroll listeners.
 */
export function HeaderShell({ children }: { children: React.ReactNode }) {
  const sentinel = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const node = sentinel.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => setScrolled(!entry.isIntersecting), { threshold: 0 });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <div ref={sentinel} aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-20" />
      <header data-scrolled={scrolled} className="site-header sticky top-0 z-40">
        {children}
      </header>
    </>
  );
}
