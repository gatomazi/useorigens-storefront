"use server";

import { headers } from "next/headers";
import { allow } from "@/lib/admin/auth/rate-limit";
import { CONTACT_NOTICE_VERSION, maskedChannels, validateContact, type ContactInput } from "@/lib/customization/contact";
import { expiryFrom, hashToken, IDEMPOTENCY_KEY, retentionDays, shortRef, tokenFor, TOKEN_SHAPE } from "@/lib/customization/requests";
import { requestSecret, requestStoreOrNull } from "@/lib/customization/server";
import { snapshotOf, summaryOf, validateSubmission, type FieldError, type SummaryLine } from "@/lib/customization/validate";
import { publishedFor } from "@/lib/pages/public";
import { liveCustomizer } from "@/lib/site-config/pages";
import { validateArtworkInput } from "@/lib/customization/artwork";
import { loadArtworkBase } from "@/lib/customization/artwork-server";
import { choiceLabel, choiceOfTemplate, offersChoice, studioTemplateIds } from "@/lib/customization/studio-arts";
import type { PrintProject } from "@/lib/print-studio/model";

export type SubmitResult =
  | { ok: true; reference: string; shortReference: string; summary: SummaryLine[]; channels: string[]; duplicate: boolean; expiresAt: string; modelVersion: number }
  | { ok: false; errors: FieldError[]; message: string };

/**
 * Registers ONE personalization request with the customer's contact (name + WhatsApp and/or e-mail + the confirmation). The browser's checks are a
 * convenience: the model is read again from the PUBLISHED configuration and the values and the contact are validated again here. They are stored in the
 * request table only: never in a log, an analytics event, a URL or an error message, and what comes back is masked (never the full contact). It asks for
 * nothing else (no address, tax id or payment data) and it does NOT send anything to INK, to the customer or to the team: someone reads the queue.
 */
export async function submitCustomizationAction(input: { region: string; slug: string; idempotencyKey: string; fields?: unknown; lines?: unknown; artwork?: { templateId: string; layers?: unknown; fields?: unknown }; contact?: ContactInput; replaces?: string }): Promise<SubmitResult> {
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
  const checked = validateSubmission(model.studioArts?.length ? { ...model, fields: [], lineGroup: undefined } : model, { fields: input.fields, lines: input.lines });
  const contact = validateContact(input.contact && typeof input.contact === "object" ? input.contact : {});
  const errors = [...(checked.ok ? [] : checked.errors), ...(contact.ok ? [] : contact.errors)];
  if (!checked.ok || !contact.ok) return fail("Confira os campos destacados.", errors);
  if (model.studioArts?.length) {
    const choice = typeof input.artwork?.templateId === "string" ? choiceOfTemplate(model, input.artwork.templateId) : null;
    if (!input.artwork || !choice) return fail("A arte deste modelo mudou. Recarregue a página antes de enviar.");
    const base = await loadArtworkBase(choice.templateId).catch(() => null);
    if (!base) return fail("Esta base não está disponível agora. Tente novamente mais tarde.");
    const artwork = validateArtworkInput(base, choice.templateId, input.artwork);
    if (!artwork.ok) return fail("Confira os textos, fontes e cores da arte.", artwork.errors);
    checked.values.artwork = { ...artwork.artwork, ...(offersChoice(model) ? { choice: choiceLabel(choice) } : {}) };
  } else if (input.artwork) return fail("Este modelo não permite edição da arte. Recarregue a página.");
  const token = tokenFor(secret, found.region, input.idempotencyKey);
  const replaces = typeof input.replaces === "string" && TOKEN_SHAPE.test(input.replaces) ? hashToken(input.replaces) : undefined;
  try {
    const { record, duplicate } = await store.create({
      region: found.region,
      idempotencyKey: input.idempotencyKey,
      tokenHash: hashToken(token),
      snapshot: snapshotOf(model),
      values: checked.values,
      contact: { ...contact.contact, confirmedAt: new Date().toISOString(), noticeVersion: CONTACT_NOTICE_VERSION },
      expiresAt: expiryFrom(new Date(), retentionDays()),
      ...(replaces ? { replacesTokenHash: replaces } : {}),
    });
    return { ok: true, reference: token, shortReference: shortRef(record.id), summary: summaryOf(record.snapshot, record.values), channels: maskedChannels(record.contact ?? {}), duplicate, expiresAt: record.expiresAt, modelVersion: record.customizerVersion };
  } catch {
    // The reason is deliberately not logged with the values; the store's own failure has no customer text in its message.
    return fail("Não foi possível registrar agora. Tente novamente em instantes.");
  }
}

/**
 * One base of a live model, fetched when the customer picks another art, version or shirt colour: the page ships only the first base (each one
 * carries the full-size art). Only the model's own bases are served, never another saved template.
 */
export async function loadArtworkBaseAction(input: { region: string; slug: string; templateId: string }): Promise<PrintProject | null> {
  const found = publishedFor(String(input.region));
  const model = found ? liveCustomizer(found.bundle.docs[found.region], String(input.slug)) : undefined;
  if (!model || typeof input.templateId !== "string" || !studioTemplateIds(model).includes(input.templateId)) return null;
  const forwarded = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!allow(`czbase:${forwarded}`, 60, 10 * 60_000)) return null;
  return loadArtworkBase(input.templateId).catch(() => null);
}
