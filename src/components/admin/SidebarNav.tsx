"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/admin", label: "Visão geral" },
  { href: "/admin/home", label: "Home · Seções" },
  { href: "/admin/paginas", label: "Páginas" },
  { href: "/admin/personalizacao", label: "Personalização" },
  { href: "/admin/colecoes", label: "Coleções" },
  { href: "/admin/tracking", label: "Tracking" },
  { href: "/admin/publicar", label: "Publicar" },
  { href: "/admin/midia", label: "Mídia" },
];

/** `storeHref` is the public page of the region being edited; `null` while that region is still in preview (its public page is a 404). */
export function SidebarNav({ totalRequests = 0, owner = false, storeHref = "/sul", storeLabel = "Abrir a loja local ↗" }: { totalRequests?: number; owner?: boolean; storeHref?: string | null; storeLabel?: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Painel" className="flex flex-wrap gap-1.5 lg:flex-col lg:gap-1">
      {[...ITEMS, ...(owner ? [{ href: "/admin/usuarios", label: "Pessoas" }] : [])].map((item) => {
        const active = item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`px-3 py-2 text-[0.9375rem] font-bold ${active ? "bg-white text-ink" : "text-white hover:bg-white/15"}`}
          >
            {item.label}
            {item.href === "/admin/personalizacao" && (
              <span className="ml-2 inline-block min-w-[1.4rem] rounded-full bg-white px-1.5 text-center text-[0.75rem] font-extrabold text-ink" data-testid="pending-requests" title="Total de solicitações de personalização">{totalRequests}<span className="sr-only"> solicitações no total</span></span>
            )}
          </Link>
        );
      })}
      {storeHref ? (
        <a href={storeHref} target="_blank" rel="noreferrer" className="px-3 py-2 text-[0.9375rem] font-bold text-white/80 hover:bg-white/15">
          {storeLabel}
        </a>
      ) : (
        <span className="px-3 py-2 text-[0.8125rem] text-white/60">Região ainda em prévia: a loja pública só existe depois do lançamento.</span>
      )}
    </nav>
  );
}
