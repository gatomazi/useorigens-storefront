"use server";

import { headers } from "next/headers";
import { allow } from "@/lib/admin/auth/rate-limit";
import { expiryFrom, hashToken, IDEMPOTENCY_KEY, retentionDays, tokenFor, TOKEN_SHAPE } from "@/lib/customization/requests";
import { requestSecret, requestStoreOrNull } from "@/lib/customization/server";
import { snapshotOf, summaryOf, validateSubmission, type FieldError, type SummaryLine } from "@/lib/customization/validate";
import { publishedFor } from "@/lib/pages/public";
import { liveCustomizer } from "@/lib/site-config/pages";

export type SubmitResult =
  | { ok: true; reference: string; summary: SummaryLine[]; duplicate: boolean; expiresAt: string; modelVersion: number }
  | { ok: false; errors: FieldError[]; message: string };

/**
 * Registers ONE personalization request. The browser's checks are a convenience: the model is read again from the PUBLISHED configuration and
 * the values are validated again here. It stores the typed values in the request table only: never in a log, an analytics event or a URL, and it
 * asks for nothing else (no address, phone, tax id or payment data). It does NOT send anything to INK.
 */
export async function submitCustomizationAction(input: { region: string; slug: string; idempotencyKey: string; fields?: unknown; lines?: unknown; replaces?: string }): Promise<SubmitResult> {
  const fail = (message: string, errors: FieldError[] = []): SubmitResult => ({ ok: false, errors, message });
  const found = publishedFor(String(input.region));
  const model = found ? liveCustomizer(found.bundle.docs[found.region], String(input.slug)) : undefined;
  if (!found || !model) return fail("Este modelo não está disponível.");
  if (typeof input.idempotencyKey !== "string" || !IDEMPOTENCY_KEY.test(input.idempotencyKey)) return fail("Recarregue a página e tente de novo.");
  const forwarded = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!allow(`cz:${forwarded}`, 10, 10 * 60_000)) return fail("Muitas tentativas seguidas. Aguarde alguns minutos.");
  const store = requestStoreOrNull();
  const secret = requestSecret();
  if (!store || !secret) return fail("O envio de solicitações não está disponível neste ambiente.");
  const checked = validateSubmission(model, { fields: input.fields, lines: input.lines });
  if (!checked.ok) return fail("Confira os campos destacados.", checked.errors);
  const token = tokenFor(secret, found.region, input.idempotencyKey);
  const replaces = typeof input.replaces === "string" && TOKEN_SHAPE.test(input.replaces) ? hashToken(input.replaces) : undefined;
  try {
    const { record, duplicate } = await store.create({
      region: found.region,
      idempotencyKey: input.idempotencyKey,
      tokenHash: hashToken(token),
      snapshot: snapshotOf(model),
      values: checked.values,
      expiresAt: expiryFrom(new Date(), retentionDays()),
      ...(replaces ? { replacesTokenHash: replaces } : {}),
    });
    return { ok: true, reference: token, summary: summaryOf(record.snapshot, record.values), duplicate, expiresAt: record.expiresAt, modelVersion: record.customizerVersion };
  } catch {
    // The reason is deliberately not logged with the values; the store's own failure has no customer text in its message.
    return fail("Não foi possível registrar agora. Tente novamente em instantes.");
  }
}
