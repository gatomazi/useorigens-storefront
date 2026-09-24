import Link from "next/link";
import { requireDevAdmin } from "@/lib/admin/require-dev-admin";
import { regionThemeStyle } from "@/lib/theme/region-theme";
import { SidebarNav } from "@/components/admin/SidebarNav";

/**
 * The local CMS shell. Reachable only on the developer's own machine (`requireDevAdmin`: development server, ADMIN_DEV_MODE=true, loopback
 * host, no proxy headers); anything else is a 404 before a single pixel is drawn. No tracking scripts, no consent banner, no storefront chrome.
 */
export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  await requireDevAdmin();
  return (
    <div className="lg:grid lg:grid-cols-[15rem_1fr]" style={regionThemeStyle("sul")}>
      <aside className="on-ink flex flex-col gap-6 bg-region-primary px-5 py-5 lg:min-h-dvh lg:sticky lg:top-0 lg:h-dvh" style={{ background: "var(--region-primary)" }}>
        <Link href="/admin" className="block">
          <span className="block text-[1.6rem] font-extrabold uppercase leading-none tracking-wide [font-family:var(--font-display-stack)]">Use Origens</span>
          <span className="mt-1 block text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-white/70">Painel · local</span>
        </Link>
        <SidebarNav />
        <div className="mt-auto hidden text-[0.75rem] leading-snug text-white/70 lg:block">
          <p className="font-bold text-white">Ambiente de desenvolvimento</p>
          <p className="mt-1">Nada aqui altera a loja em produção. Rascunhos e publicações ficam em <code className="text-white">data/admin-dev/</code>.</p>
        </div>
      </aside>
      <div className="min-w-0">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-black/15 bg-white px-5 py-3 lg:px-8">
          <div className="flex items-center gap-3">
            <span className="a-label !mb-0">Região</span>
            <span className="a-badge ok">Sul</span>
            <span className="a-badge" title="Norte e Centro-Oeste estão no contrato, mas a home deles ainda não existe.">Norte · em breve</span>
            <span className="a-badge" title="Norte e Centro-Oeste estão no contrato, mas a home deles ainda não existe.">Centro-Oeste · em breve</span>
          </div>
          <span className="a-badge dev">Desenvolvimento local</span>
        </header>
        <main className="px-5 py-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
