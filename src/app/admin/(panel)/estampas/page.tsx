import type { Metadata } from "next";
import { requireAdmin } from "@/lib/admin/auth/guard";
import { PrintStudio } from "@/components/print-studio/PrintStudio";
import { availableStudioFonts } from "@/lib/print-studio/font-server";

export const metadata: Metadata = { title: "Estúdio de estampas", robots: { index: false, follow: false } };

export default async function PrintStudioPage() {
  const actor = await requireAdmin();
  return <PrintStudio owner={actor.role === "owner"} availableFonts={await availableStudioFonts()} />;
}
