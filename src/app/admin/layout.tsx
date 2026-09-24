import type { Metadata } from "next";
import { requireAdminSurface } from "@/lib/admin/auth/guard";
import "./admin.css";

export const metadata: Metadata = { title: "Painel · Use Origens", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * Root of everything under /admin (the login page, the panel screens AND the preview). The admin exists only where `requireAdminSurface`
 * says so: a development server on loopback (ADMIN_DEV_MODE) or the configured admin host of a fully configured production process;
 * anything else is a 404 before a pixel is drawn. Authentication is NOT decided here (the login page must be reachable): the panel group
 * and every page, action and route handler call `requireAdmin`. The panel's own chrome lives in the (panel) group, so the preview page
 * (a bare render of the storefront components, with no Meta/GA/consent) does not inherit it.
 */
export default async function AdminRootLayout({ children }: { children: React.ReactNode }) {
  await requireAdminSurface();
  return <div className="admin">{children}</div>;
}
