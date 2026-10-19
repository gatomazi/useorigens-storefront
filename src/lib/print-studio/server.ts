import "server-only";
import path from "node:path";
import { adminDevDir } from "@/lib/admin/local-store";
import { siteConfigDir } from "@/lib/site-config/published";
import { printStore } from "./server-store";

export function serverPrintStore() {
  // Production shares the existing persistent CMS Volume, never the ephemeral application directory.
  const root = process.env.NODE_ENV !== "production" ? path.join(adminDevDir(), "estampas") : process.env.PRINT_STUDIO_DIR || path.join(siteConfigDir(), "estampas");
  if (!path.isAbsolute(root)) throw new Error("PRINT_STUDIO_DIR precisa ser um caminho absoluto no Volume persistente.");
  return printStore(root);
}
