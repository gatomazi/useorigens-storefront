"use server";

import { requireAdmin } from "@/lib/admin/auth/guard";
import { loadArtworkBase } from "@/lib/customization/artwork-server";
import type { PrintProject } from "@/lib/print-studio/model";

/** The admin preview of a draft model fetches its other bases here: the model may not be published yet, so the public loader would refuse them. */
export async function loadPreviewArtworkBaseAction(input: { region: string; slug: string; templateId: string }): Promise<PrintProject | null> {
  await requireAdmin();
  return typeof input.templateId === "string" ? loadArtworkBase(input.templateId).catch(() => null) : null;
}
