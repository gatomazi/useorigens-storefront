import Link from "next/link";

/** Page numbers to show: first, last, and a window around the current one, with gaps as `null`. */
export function pageWindow(current: number, count: number): (number | null)[] {
  const wanted = new Set([1, count, current - 1, current, current + 1]);
  const pages = [...wanted].filter((p) => p >= 1 && p <= count).sort((a, b) => a - b);
  const out: (number | null)[] = [];
  pages.forEach((p, i) => {
    if (i > 0 && p - (pages[i - 1] ?? 0) > 1) out.push(null);
    out.push(p);
  });
  return out;
}

/**
 * "Anterior · 1 … 4 5 6 … 12 · Próxima" under a list that spans several pages (the text search, a collection page). `hrefOf` gives each page's
 * address; without it (the panel's preview, where the other pages have no address yet) the numbers are drawn as plain text, never a dead link.
 */
export function Pagination({ page, pageCount, hrefOf, label, dark = false, className = "mt-12" }: { page: number; pageCount: number; hrefOf?: (page: number) => string; label: string; dark?: boolean; className?: string }) {
  if (pageCount <= 1) return null;
  const ink = dark ? "border-white" : "border-ink";
  const current = dark ? "border-white bg-white text-ink" : "border-ink bg-ink text-white";
  const hover = dark ? "hover:bg-white hover:text-ink" : "hover:bg-ink hover:text-white";
  const step = dark ? "btn-light" : "btn-ghost";
  const cell = "inline-flex min-h-11 min-w-11 items-center justify-center border-2 px-3 font-semibold";
  return (
    <nav aria-label={label} className={`${className} flex flex-wrap items-center gap-2`}>
      {page > 1 && hrefOf && (
        <Link href={hrefOf(page - 1)} rel="prev" className={`${step} inline-flex min-h-11 items-center px-4`}>
          Anterior
        </Link>
      )}
      {pageWindow(page, pageCount).map((p, i) =>
        p === null ? (
          <span key={`gap-${i}`} aria-hidden="true" className="px-1">
            …
          </span>
        ) : p === page ? (
          <span key={p} aria-current="page" className={`${cell} ${current}`}>
            {p}
          </span>
        ) : hrefOf ? (
          <Link key={p} href={hrefOf(p)} className={`${cell} ${ink} ${hover}`}>
            {p}
          </Link>
        ) : (
          <span key={p} className={`${cell} ${ink}`}>
            {p}
          </span>
        ),
      )}
      {page < pageCount && hrefOf && (
        <Link href={hrefOf(page + 1)} rel="next" className={`${step} inline-flex min-h-11 items-center px-4`}>
          Próxima
        </Link>
      )}
    </nav>
  );
}
