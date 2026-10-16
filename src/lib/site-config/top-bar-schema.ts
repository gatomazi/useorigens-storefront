/**
 * Contract of the region's "Faixa do topo" (types + strict validator): the strip above the header of the storefront and, through the Worker, of the INK
 * pages. Dependency-light on purpose, like `promotions-schema.ts`: `schema.ts` imports it, so it must not import anything that imports `schema.ts` back.
 *
 * Each message is the owner's own words, with an optional window (Black Friday, "peça até 06/12 para receber no Natal") and two placeholders the store
 * fills in: `{producao}` (the INK production time set here, in business days) and `{faltam}` (the days left until the message ends).
 */
import type { Scope, ValidationResult } from "./schema";
import { isPromoInstant, PROMO_ID } from "./promotions-schema";

export type TopBarMessage = {
  id: string;
  enabled: boolean;
  /** One line, as typed, with optional `{producao}` / `{faltam}`. */
  text: string;
  /** Optional link: a page of this region's storefront (`/sul/h/natal`). The INK pages link to the same page on the storefront. */
  href?: string;
  /** Owner's order (smaller first; the editor writes 1..n). */
  order: number;
  /** Optional window, ISO 8601 with an explicit offset. Outside it the message is not shown. */
  startsAt?: string;
  endsAt?: string;
};

export type TopBarConfig = {
  /** Estimated INK production time, in business days (delivery depends on the CEP and is not promised here). Absent = `{producao}` cannot be used. */
  productionDays?: number;
  messages: TopBarMessage[];
};

export const MAX_TOP_BAR_MESSAGES = 10;
export const TOP_BAR_TEXT_MAX = 90;
/** Above this, the strip may wrap to two lines on a phone (a warning, never a block). */
export const TOP_BAR_TEXT_COMFORT = 60;
export const MAX_PRODUCTION_DAYS = 60;
export const MAX_TOP_BAR_ORDER = 999;
export const TOP_BAR_TOKENS = ["producao", "faltam"] as const;
export type TopBarToken = (typeof TOP_BAR_TOKENS)[number];

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
// Printable, single-line text only: it is rendered as text (never HTML). `<` and `>` are refused too (the INK side writes it with textContent anyway).
const CONTROL = /[\u0000-\u001f\u007f<>]/;
const MESSAGE_KEYS = ["id", "enabled", "text", "href", "order", "startsAt", "endsAt"];
const TOKEN = /\{([^{}]*)\}/g;

/** The placeholders a text uses, and any `{…}` that is not one of them. */
export function textTokens(text: string): { used: TopBarToken[]; unknown: string[] } {
  const used = new Set<TopBarToken>();
  const unknown: string[] = [];
  for (const m of text.matchAll(TOKEN)) {
    if ((TOP_BAR_TOKENS as readonly string[]).includes(m[1])) used.add(m[1] as TopBarToken);
    else unknown.push(m[0]);
  }
  return { used: [...used], unknown };
}

/** `/sul`, `/sul/h/natal`, `/sul/colecoes/presentes`: a page of THIS region, no host, no query, no traversal. */
export const topBarHrefOk = (href: unknown, region: string): href is string =>
  typeof href === "string" && href.length <= 120 && (href === `/${region}` || new RegExp(`^/${region}(/[a-z0-9-]+){1,4}$`).test(href));

function checkMessage(errors: string[], path: string, v: unknown, scope: Scope, productionDays: unknown): void {
  if (!isRecord(v)) return void errors.push(`${path}: must be an object`);
  for (const key of Object.keys(v)) if (!MESSAGE_KEYS.includes(key)) errors.push(`${path}.${key}: unknown field`);
  if (typeof v.id !== "string" || !PROMO_ID.test(v.id)) errors.push(`${path}.id: invalid`);
  if (typeof v.enabled !== "boolean") errors.push(`${path}.enabled: must be boolean`);
  const text = v.text;
  if (typeof text !== "string" || text.trim().length === 0 || text !== text.trim() || text.length > TOP_BAR_TEXT_MAX || CONTROL.test(text)) {
    errors.push(`${path}.text: a text of 1 to ${TOP_BAR_TEXT_MAX} characters, one line, no leading or trailing spaces`);
  } else {
    const tokens = textTokens(text);
    if (tokens.unknown.length > 0) errors.push(`${path}.text: unknown placeholder ${tokens.unknown[0]}`);
    if (tokens.used.includes("producao") && productionDays === undefined) errors.push(`${path}.text: {producao} needs the production time`);
    if (tokens.used.includes("faltam") && v.endsAt === undefined) errors.push(`${path}.text: {faltam} needs an end`);
  }
  if (v.href !== undefined && !topBarHrefOk(v.href, scope)) errors.push(`${path}.href: must be a page of this region, like /${scope}/h/natal`);
  if (typeof v.order !== "number" || !Number.isInteger(v.order) || v.order < 0 || v.order > MAX_TOP_BAR_ORDER) errors.push(`${path}.order: an integer from 0 to ${MAX_TOP_BAR_ORDER}`);
  if (v.startsAt !== undefined && !isPromoInstant(v.startsAt)) errors.push(`${path}.startsAt: a date and time with offset`);
  if (v.endsAt !== undefined && !isPromoInstant(v.endsAt)) errors.push(`${path}.endsAt: a date and time with offset`);
  if (isPromoInstant(v.startsAt) && isPromoInstant(v.endsAt) && Date.parse(v.endsAt) <= Date.parse(v.startsAt)) errors.push(`${path}.endsAt: must be after startsAt`);
}

/** No messages is valid: the storefront shows its default strip and the INK keeps its own. */
export function validateTopBar(input: unknown, scope: Scope, path = "topBar"): ValidationResult<TopBarConfig> {
  if (scope === "global") return { ok: false, errors: [`${path}: belongs to a region`] };
  if (!isRecord(input)) return { ok: false, errors: [`${path}: must be { messages: [...] }`] };
  const errors: string[] = [];
  for (const key of Object.keys(input)) if (key !== "messages" && key !== "productionDays") errors.push(`${path}.${key}: unknown field`);
  const days = input.productionDays;
  if (days !== undefined && (typeof days !== "number" || !Number.isInteger(days) || days < 1 || days > MAX_PRODUCTION_DAYS)) errors.push(`${path}.productionDays: an integer from 1 to ${MAX_PRODUCTION_DAYS}`);
  if (!Array.isArray(input.messages) || input.messages.length > MAX_TOP_BAR_MESSAGES) return { ok: false, errors: [...errors, `${path}.messages: a list of at most ${MAX_TOP_BAR_MESSAGES} messages`] };
  const ids = new Set<string>();
  input.messages.forEach((message, i) => {
    checkMessage(errors, `${path}.messages[${i}]`, message, scope, days);
    if (isRecord(message) && typeof message.id === "string") {
      if (ids.has(message.id)) errors.push(`${path}.messages[${i}].id: duplicate`);
      ids.add(message.id);
    }
  });
  return errors.length === 0 ? { ok: true, value: input as TopBarConfig } : { ok: false, errors };
}
