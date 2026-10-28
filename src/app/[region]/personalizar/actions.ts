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
import { choiceLabel, choiceOfTemplate, MAX_FAMILY_ARTS, offersChoice, studioTemplateIds } from "@/lib/customization/studio-arts";
import type { PrintProject } from "@/lib/print-studio/model";
import { isTerminal, PRODUCT_TYPE, productJobKey, productName, publicJob, type PublicProductJob } from "@/lib/customization/ink-products";
import { inkProductClientFor, missingProductTable, productStoreOrNull, startProductJob } from "@/lib/customization/products-server";
import { needsReview } from "@/lib/customization/review-words";

export type SubmitResult =
  | { ok: true; reference: string; shortReference: string; summary: SummaryLine[]; channels: string[]; duplicate: boolean; expiresAt: string; modelVersion: number }
  | { ok: false; errors: FieldError[]; message: string };

/**
 * Registers ONE personalization request with the customer's contact (name + WhatsApp and/or e-mail + the confirmation). The browser's checks are a
 * convenience: the model is read again from the PUBLISHED configuration and the values and the contact are validated again here. They are stored in the
 * request table only: never in a log, an analytics event, a URL or an error message, and what comes back is masked (never the full contact). It asks for
 * nothing else (no address, tax id or payment data) and it does NOT send anything to INK, to the customer or to the team: someone reads the queue.
 */
export async function submitCustomizationAction(input: { region: string; slug: string; idempotencyKey: string; fields?: unknown; lines?: unknown; artwork?: { templateId: string; layers?: unknown; fields?: unknown; also?: unknown }; contact?: ContactInput; replaces?: string }): Promise<SubmitResult> {
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
    // A family order: other arts or versions of the same model with the same answers (only for bases with fields, e.g. the surname).
    const also = input.artwork.also;
    if (also !== undefined) {
      const ids = Array.isArray(also) ? also : [];
      const picks = ids.map((id) => (typeof id === "string" ? choiceOfTemplate(model, id) : null));
      const keys = [choice, ...picks].map((c) => (c ? `${model.studioArts!.indexOf(c.art)}:${c.art.versions.indexOf(c.version)}` : ""));
      if (!Array.isArray(also) || ids.length > MAX_FAMILY_ARTS - 1 || !artwork.artwork.fields || picks.some((c) => !c) || new Set(keys).size !== keys.length) return fail("A lista de artes do pedido mudou. Recarregue a página antes de enviar.");
      const more = [];
      for (const pick of picks as NonNullable<(typeof picks)[number]>[]) {
        const extra = await loadArtworkBase(pick.templateId).catch(() => null);
        if (!extra) return fail("Uma das artes do pedido não está disponível agora. Tente novamente mais tarde.");
        const checkedExtra = validateArtworkInput(extra, pick.templateId, { fields: input.artwork.fields });
        if (!checkedExtra.ok) return fail("Confira os textos da arte.", checkedExtra.errors);
        more.push({ ...checkedExtra.artwork, choice: choiceLabel(pick) });
      }
      if (more.length) checked.values.moreArtwork = more;
    }
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

export type StartProductsResult =
  | { ok: true; items: PublicProductJob[] }
  | { ok: false; errors: FieldError[]; message: string; fallback: boolean };

/** New products a day, all customers together, before the page falls back to the request flow (the products are permanent at INK). */
const dailyCap = (): number => {
  const n = Number(process.env.CUSTOMIZATION_PRODUCTS_DAILY_CAP);
  return Number.isInteger(n) && n > 0 ? n : 300;
};

/**
 * Direct purchase: for each art of the order (one, or a family's several) finds the product already made for the same name or queues a new one, and
 * returns at once; the products are made after the response (`startProductJob`) and the waiting page follows them. Same checks as a request (the
 * published model, the immutable bases, the fields), no contact asked. `fallback: true` means "offer the request to the team": the model has no
 * direct purchase here, the name needs a person's look, the day's ceiling was reached or the table is not there yet.
 */
export async function startProductsAction(input: { region: string; slug: string; artwork?: { templateId?: unknown; fields?: unknown; also?: unknown } }): Promise<StartProductsResult> {
  const fail = (message: string, fallback = false, errors: FieldError[] = []): StartProductsResult => ({ ok: false, errors, message, fallback });
  const found = publishedFor(String(input.region));
  const model = found ? liveCustomizer(found.bundle.docs[found.region], String(input.slug)) : undefined;
  if (!found || !model) return fail("Este modelo não está disponível.");
  const direct = model.directPurchase;
  const store = productStoreOrNull();
  const client = inkProductClientFor(found.region);
  if (!model.studioArts?.length || !direct?.enabled || !store || !client) return fail("A criação automática não está disponível agora.", true);
  const forwarded = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!allow(`czp:${forwarded}`, 10, 10 * 60_000) || !allow(`czpd:${forwarded}`, 40, 24 * 60 * 60_000)) return fail("Muitas tentativas seguidas. Aguarde alguns minutos.");

  const ids = [input.artwork?.templateId, ...(Array.isArray(input.artwork?.also) ? input.artwork.also : input.artwork?.also === undefined ? [] : [null])];
  const picks = ids.map((id) => (typeof id === "string" ? choiceOfTemplate(model, id) : null));
  const keys = picks.map((c) => (c ? `${model.studioArts!.indexOf(c.art)}:${c.art.versions.indexOf(c.version)}` : ""));
  if (picks.some((c) => !c) || ids.length > MAX_FAMILY_ARTS || new Set(keys).size !== keys.length) return fail("A arte deste modelo mudou. Recarregue a página antes de continuar.");

  const items: { pick: NonNullable<(typeof picks)[number]>; fields: Record<string, string> }[] = [];
  for (const pick of picks as NonNullable<(typeof picks)[number]>[]) {
    const base = await loadArtworkBase(pick.version.templateId).catch(() => null);
    if (!base) return fail("Esta arte não está disponível agora. Tente novamente mais tarde.", true);
    const checked = validateArtworkInput(base, pick.version.templateId, { fields: input.artwork?.fields });
    if (!checked.ok) return fail("Confira o que você escreveu.", false, checked.errors);
    if (!checked.artwork.fields?.length) return fail("Esta arte não pode ser criada automaticamente.", true);
    items.push({ pick, fields: Object.fromEntries(checked.artwork.fields.map((f) => [f.id, f.value])) });
  }
  if (items.some(({ fields }) => needsReview(Object.values(fields).join(" ")))) return fail("Este nome passa pela nossa equipe antes de virar camiseta. Deixe o seu contato e a gente manda o link.", true);
  const prices = items.map(({ pick }) => ((pick.version.garment ?? "camiseta") === "infantil" ? direct.kidsPrice : direct.price));
  if (prices.some((p) => !p)) return fail("A criação automática não está disponível para esta versão.", true);

  try {
    if ((await store.countCreatedSince(new Date(Date.now() - 24 * 60 * 60_000))) >= dailyCap()) return fail("Hoje a criação automática chegou ao limite. Deixe o seu contato e a gente manda o link.", true);
    const out: PublicProductJob[] = [];
    for (const [i, { pick, fields }] of items.entries()) {
      const garment = pick.version.garment ?? "camiseta";
      const lightTemplateId = pick.version.lightTemplateId ?? null;
      const artLabel = choiceLabel({ ...pick, light: false, templateId: pick.version.templateId });
      let { job } = await store.findOrCreate({
        dedupeKey: productJobKey({ region: found.region, templateId: pick.version.templateId, lightTemplateId, garment, fields }),
        region: found.region, customizerId: model.id, customizerSlug: model.slug,
        name: productName(fields, model.name, artLabel), artLabel, fields,
        templateId: pick.version.templateId, lightTemplateId, garment, productTypeId: PRODUCT_TYPE[garment], price: prices[i]!,
      });
      // A job that failed before INK held anything is tried again for the next customer; one that needs a check stays with the team.
      if (job.status === "failed" && !job.inkProductId) job = (await store.update(job.id, { status: "queued", attempts: 0, error: null })) ?? job;
      if (!isTerminal(job.status)) startProductJob(job.id, found.region);
      out.push(publicJob(job));
    }
    return { ok: true, items: out };
  } catch (e) {
    return fail(missingProductTable(e) ? "A criação automática ainda não está disponível." : "Não foi possível começar agora. Tente de novo em instantes.", true);
  }
}
