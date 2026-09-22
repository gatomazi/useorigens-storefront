"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Sticky header, always on the region's primary colour (white text/icons throughout, by inheritance): tall and
 * quiet at the top of the page, a touch shorter with a hairline once the page scrolls. A sentinel +
 * IntersectionObserver avoids scroll listeners.
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
      <header data-scrolled={scrolled} className="site-header sticky top-0 z-40 bg-region-primary text-white">
        {children}
      </header>
    </>
  );
}
