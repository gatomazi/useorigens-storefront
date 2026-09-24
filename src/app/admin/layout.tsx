import type { Metadata } from "next";
import { requireDevAdmin } from "@/lib/admin/require-dev-admin";
import "./admin.css";

export const metadata: Metadata = { title: "Painel local · Use Origens", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * Root of everything under /admin (the panel screens AND the preview). Reachable only on the developer's own machine (`requireDevAdmin`:
 * development server, ADMIN_DEV_MODE=true, loopback host, no proxy headers); anything else is a 404 before a pixel is drawn. The panel's
 * own chrome lives in the (panel) group, so the preview page (a bare render of the storefront components) does not inherit it.
 */
export default async function AdminRootLayout({ children }: { children: React.ReactNode }) {
  await requireDevAdmin();
  return <div className="admin">{children}</div>;
}
