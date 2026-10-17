"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

type Item = { href: string; label: string; active?: (pathname: string) => boolean; badge?: { count: number; testId: string; title: string; srLabel: string } };
type Group = { title?: string; items: Item[] };

const SOLICITACOES = "/admin/personalizacao/solicitacoes";
const isActive = (item: Item, pathname: string) => (item.active ? item.active(pathname) : pathname === item.href || pathname.startsWith(`${item.href}/`));

/**
 * The panel's menu, grouped by what the person is doing: the region's content, the catalog, the customer queue, marketing and configuration.
 * "Publicar" is not here: it sits in the top bar, with the count of what is waiting. On a phone the menu folds behind one button.
 * `storeHref` is the public page of the region being edited; `null` while that region is still in preview (its public page is a 404).
 */
export function SidebarNav({ pendingRequests = 0, owner = false, regionName = "Sul", storeHref = "/sul", storeLabel = "Abrir a loja local ↗" }: { pendingRequests?: number; owner?: boolean; regionName?: string; storeHref?: string | null; storeLabel?: string }) {
  const pathname = usePathname();
  // Open for the page it was opened on: following a link closes it, with no effect to sync.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;

  const groups: Group[] = [
    { items: [{ href: "/admin", label: "Visão geral", active: (p) => p === "/admin" }] },
    {
      title: `Conteúdo · ${regionName}`,
      items: [
        { href: "/admin/home", label: "Home" },
        { href: "/admin/estados", label: "Páginas de estado" },
        { href: "/admin/paginas", label: "Páginas" },
        { href: "/admin/navegacao", label: "Menu" },
        { href: "/admin/midia", label: "Mídia" },
      ],
    },
    {
      title: "Catálogo",
      items: [
        { href: "/admin/colecoes", label: "Coleções" },
        { href: "/admin/personalizacao", label: "Personalização", active: (p) => (p === "/admin/personalizacao" || p.startsWith("/admin/personalizacao/")) && !p.startsWith(SOLICITACOES) },
      ],
    },
    {
      title: "Atendimento",
      items: [{ href: SOLICITACOES, label: "Solicitações", badge: { count: pendingRequests, testId: "pending-requests", title: "Solicitações de personalização esperando a equipe", srLabel: "solicitações pendentes" } }],
    },
    {
      title: "Marketing",
      items: [
        { href: "/admin/promocoes", label: "Cupons e promoções" },
        { href: "/admin/faixa", label: "Faixa do topo" },
        { href: "/admin/tracking", label: "Tracking" },
      ],
    },
    {
      title: "Configuração",
      items: [
        { href: "/admin/aparencia", label: "Aparência" },
        { href: "/admin/tema-ink", label: "Tema da INK" },
        { href: "/admin/sincronizacao", label: "Sincronização" },
        ...(owner ? [{ href: "/admin/usuarios", label: "Pessoas" }] : []),
      ],
    },
  ];
  const current = groups.flatMap((g) => g.items).find((item) => isActive(item, pathname));

  return (
    <nav aria-label="Painel">
      <button type="button" className="flex w-full items-center justify-between gap-2 border border-white/40 px-3 py-2 text-left text-[0.9375rem] font-bold lg:hidden" aria-expanded={open} aria-controls="painel-menu" onClick={() => setOpenOn(open ? null : pathname)}>
        <span>Menu{current ? <span className="font-semibold text-white/80"> · {current.label}</span> : null}</span>
        <span aria-hidden="true">{open ? "▴" : "▾"}</span>
      </button>
      <div id="painel-menu" className={`${open ? "mt-3 flex" : "hidden"} flex-col gap-4 lg:mt-0 lg:flex`}>
        {groups.map((group, i) => (
          <div key={group.title ?? i} role={group.title ? "group" : undefined} aria-label={group.title}>
            {group.title && <p className="mb-1 px-3 text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-white/65" aria-hidden="true">{group.title}</p>}
            <ul className="flex flex-col gap-0.5">
              {group.items.map((item) => {
                const active = isActive(item, pathname);
                return (
                  <li key={item.href}>
                    <Link href={item.href} aria-current={active ? "page" : undefined} className={`flex items-center justify-between gap-2 px-3 py-1.5 text-[0.9375rem] font-bold ${active ? "bg-white text-ink" : "text-white hover:bg-white/15"}`}>
                      {item.label}
                      {item.badge && item.badge.count > 0 && (
                        <span className={`inline-block min-w-[1.4rem] rounded-full px-1.5 text-center text-[0.75rem] font-extrabold ${active ? "bg-ink text-white" : "bg-white text-ink"}`} data-testid={item.badge.testId} title={item.badge.title}>
                          {item.badge.count}
                          <span className="sr-only"> {item.badge.srLabel}</span>
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
        {storeHref ? (
          <a href={storeHref} target="_blank" rel="noreferrer" className="px-3 py-1.5 text-[0.9375rem] font-bold text-white/80 hover:bg-white/15">
            {storeLabel}
          </a>
        ) : (
          <span className="px-3 py-1.5 text-[0.8125rem] text-white/60">Região ainda em prévia: a loja pública só existe depois do lançamento.</span>
        )}
      </div>
    </nav>
  );
}
