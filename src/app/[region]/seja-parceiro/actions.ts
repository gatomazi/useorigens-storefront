"use server";

import { headers } from "next/headers";
import { allow } from "@/lib/admin/auth/rate-limit";
import { IDEMPOTENCY_KEY } from "@/lib/customization/requests";
import type { FieldError } from "@/lib/customization/validate";
import { isRegionSlug } from "@/lib/geo/regions";
import { PARTNER_NOTICE_VERSION, validatePartnerApplication, type PartnerInput } from "@/lib/partners/application";
import { missingTable, partnerStoreOrNull } from "@/lib/partners/server";
import { isRegionLaunched } from "@/lib/regions/launched";

export type PartnerSubmitResult = { ok: true; firstName: string } | { ok: false; errors: FieldError[]; message: string };

/**
 * Keeps ONE partner application. The browser's checks are a convenience: everything is validated again here. What was typed goes to the
 * partner_application table only (never a log, an analytics event, a URL or an error message), and nothing is sent to the person or to the team:
 * someone reads the queue in the panel ("Parceiros"). `website` is a field people never see: a robot that fills it gets a success and nothing is kept.
 */
export async function submitPartnerAction(input: PartnerInput & { region: string; idempotencyKey: string; website?: unknown }): Promise<PartnerSubmitResult> {
  const fail = (message: string, errors: FieldError[] = []): PartnerSubmitResult => ({ ok: false, errors, message });
  const region = String(input.region);
  if (!isRegionSlug(region) || !isRegionLaunched(region)) return fail("Recarregue a página e tente de novo.");
  if (typeof input.idempotencyKey !== "string" || !IDEMPOTENCY_KEY.test(input.idempotencyKey)) return fail("Recarregue a página e tente de novo.");
  const forwarded = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!allow(`partner:${forwarded}`, 5, 10 * 60_000)) return fail("Muitas tentativas seguidas. Aguarde alguns minutos.");
  const checked = validatePartnerApplication(input);
  if (!checked.ok) return fail("Confira os campos destacados.", checked.errors);
  const firstName = checked.values.name.split(" ")[0];
  if (typeof input.website === "string" && input.website.trim() !== "") return { ok: true, firstName };
  const store = partnerStoreOrNull();
  if (!store) return fail("As inscrições não estão disponíveis neste ambiente.");
  try {
    await store.create({ ...checked.values, region, idempotencyKey: input.idempotencyKey, noticeVersion: PARTNER_NOTICE_VERSION });
    return { ok: true, firstName };
  } catch (error) {
    // Only the cause, never what was typed. Before db/migrations/0010 is applied every submission fails the same way.
    console.warn(`[partners] application not kept: ${missingTable(error) ? "migration 0010 not applied" : "store error"}`);
    return fail("Não foi possível enviar agora. Tente novamente em instantes.");
  }
}
