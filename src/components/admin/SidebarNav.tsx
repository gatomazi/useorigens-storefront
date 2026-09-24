"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/admin", label: "Visão geral" },
  { href: "/admin/home", label: "Home · Seções" },
  { href: "/admin/colecoes", label: "Coleções" },
  { href: "/admin/publicar", label: "Publicar" },
  { href: "/admin/midia", label: "Mídia" },
];

export function SidebarNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Painel" className="flex flex-wrap gap-1.5 lg:flex-col lg:gap-1">
      {ITEMS.map((item) => {
        const active = item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`px-3 py-2 text-[0.9375rem] font-bold ${active ? "bg-white text-ink" : "text-white hover:bg-white/15"}`}
          >
            {item.label}
          </Link>
        );
      })}
      <a href="/sul" target="_blank" rel="noreferrer" className="px-3 py-2 text-[0.9375rem] font-bold text-white/80 hover:bg-white/15">
        Abrir a loja local ↗
      </a>
    </nav>
  );
}
