import type { Metadata } from "next";

export const metadata: Metadata = { title: "Estúdio de estampas", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
export default function StudioLayout({ children }: { children: React.ReactNode }) { return children; }
