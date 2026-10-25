/**
 * Contract of the region's "Assistente" (types + strict validator): the help chat of the storefront and, through the Worker, of the INK pages, where it
 * takes the place of INK's own "Ajuda?" button and WhatsApp link. No AI: the answers are the store's own words (this base, edited in the panel), the
 * designs come from the storefront's catalog, orders go to INK's own pages, and what it cannot answer goes to the store's WhatsApp.
 * Dependency-light on purpose, like `top-bar-schema.ts`: `schema.ts` imports it, so it must not import anything that imports `schema.ts` back.
 */
import type { Scope, ValidationResult } from "./schema";
import { PROMO_ID } from "./promotions-schema";

/** The INK page an answer can offer as its button ("Trocar pedido" under the exchange answer). Absent = text only. */
export const ASSISTANT_ACTIONS = ["orders", "tracking"] as const;
export type AssistantAction = (typeof ASSISTANT_ACTIONS)[number];

export type AssistantAnswer = {
  id: string;
  enabled: boolean;
  /** The question as a customer would ask it; also the chip offered as a follow-up. */
  question: string;
  /** The store's answer, as typed (line breaks kept). Shown as text, never HTML. */
  answer: string;
  /** Other words people use for it ("devolver, reembolso"), comma separated. They weigh more than the words of the question. */
  keywords?: string;
  action?: AssistantAction;
  /** Owner's order (smaller first; the editor writes 1..n). The first ones are the suggestions of the opening message. */
  order: number;
};

export type AssistantConfig = {
  /** Off = no chat button anywhere (the INK keeps its own "Ajuda?" and WhatsApp). */
  enabled: boolean;
  /** The store's WhatsApp with country code, digits only (5548988082581). Absent = no hand-off button. */
  whatsapp?: string;
  /** The opening line. Absent = DEFAULT_ASSISTANT_GREETING. */
  greeting?: string;
  answers: AssistantAnswer[];
};

export const DEFAULT_ASSISTANT_GREETING = "Oi! Posso ajudar a achar a estampa da sua cidade ou tirar dúvidas sobre pedido, troca, frete e tamanhos.";
export const MAX_ASSISTANT_ANSWERS = 40;
export const ASSISTANT_QUESTION_MAX = 140;
export const ASSISTANT_ANSWER_MAX = 900;
export const ASSISTANT_KEYWORDS_MAX = 200;
export const ASSISTANT_GREETING_MAX = 200;
export const MAX_ASSISTANT_ORDER = 999;
/** Brazilian mobile or landline with the country code: 55 + DDD + 8 or 9 digits. */
export const ASSISTANT_WHATSAPP = /^55[1-9][0-9][0-9]{8,9}$/;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
// One line, printable, no markup (rendered as text; `<` and `>` refused anyway, like the top strip).
const CONTROL = /[\u0000-\u001f\u007f<>]/;
// The answer may keep line breaks (\n) and nothing else below 0x20.
const ANSWER_CONTROL = /[\u0000-\u0009\u000b-\u001f\u007f<>]/;
const ANSWER_KEYS = ["id", "enabled", "question", "answer", "keywords", "action", "order"];

const oneLine = (v: unknown, max: number): v is string => typeof v === "string" && v.trim().length > 0 && v === v.trim() && v.length <= max && !CONTROL.test(v);

function checkAnswer(errors: string[], path: string, v: unknown): void {
  if (!isRecord(v)) return void errors.push(`${path}: must be an object`);
  for (const key of Object.keys(v)) if (!ANSWER_KEYS.includes(key)) errors.push(`${path}.${key}: unknown field`);
  if (typeof v.id !== "string" || !PROMO_ID.test(v.id)) errors.push(`${path}.id: invalid`);
  if (typeof v.enabled !== "boolean") errors.push(`${path}.enabled: must be boolean`);
  if (!oneLine(v.question, ASSISTANT_QUESTION_MAX)) errors.push(`${path}.question: a text of 1 to ${ASSISTANT_QUESTION_MAX} characters, one line`);
  const answer = v.answer;
  if (typeof answer !== "string" || answer.trim().length === 0 || answer !== answer.trim() || answer.length > ASSISTANT_ANSWER_MAX || ANSWER_CONTROL.test(answer)) {
    errors.push(`${path}.answer: a text of 1 to ${ASSISTANT_ANSWER_MAX} characters`);
  }
  if (v.keywords !== undefined && !oneLine(v.keywords, ASSISTANT_KEYWORDS_MAX)) errors.push(`${path}.keywords: up to ${ASSISTANT_KEYWORDS_MAX} characters, one line`);
  if (v.action !== undefined && !(ASSISTANT_ACTIONS as readonly unknown[]).includes(v.action)) errors.push(`${path}.action: orders or tracking`);
  if (typeof v.order !== "number" || !Number.isInteger(v.order) || v.order < 0 || v.order > MAX_ASSISTANT_ORDER) errors.push(`${path}.order: an integer from 0 to ${MAX_ASSISTANT_ORDER}`);
}

/** An empty base is valid: the assistant still finds designs, opens the order pages and hands off to WhatsApp. */
export function validateAssistant(input: unknown, scope: Scope, path = "assistant"): ValidationResult<AssistantConfig> {
  if (scope === "global") return { ok: false, errors: [`${path}: belongs to a region`] };
  if (!isRecord(input)) return { ok: false, errors: [`${path}: must be { enabled, answers: [...] }`] };
  const errors: string[] = [];
  for (const key of Object.keys(input)) if (!["enabled", "whatsapp", "greeting", "answers"].includes(key)) errors.push(`${path}.${key}: unknown field`);
  if (typeof input.enabled !== "boolean") errors.push(`${path}.enabled: must be boolean`);
  if (input.whatsapp !== undefined && (typeof input.whatsapp !== "string" || !ASSISTANT_WHATSAPP.test(input.whatsapp))) errors.push(`${path}.whatsapp: digits with the country code, like 5548988082581`);
  if (input.greeting !== undefined && !oneLine(input.greeting, ASSISTANT_GREETING_MAX)) errors.push(`${path}.greeting: a text of 1 to ${ASSISTANT_GREETING_MAX} characters, one line`);
  if (!Array.isArray(input.answers) || input.answers.length > MAX_ASSISTANT_ANSWERS) return { ok: false, errors: [...errors, `${path}.answers: a list of at most ${MAX_ASSISTANT_ANSWERS} answers`] };
  const ids = new Set<string>();
  input.answers.forEach((answer, i) => {
    checkAnswer(errors, `${path}.answers[${i}]`, answer);
    if (isRecord(answer) && typeof answer.id === "string") {
      if (ids.has(answer.id)) errors.push(`${path}.answers[${i}].id: duplicate`);
      ids.add(answer.id);
    }
  });
  return errors.length === 0 ? { ok: true, value: input as AssistantConfig } : { ok: false, errors };
}

/** The answers the chat uses, in the owner's order. */
export const liveAnswers = (config: AssistantConfig | undefined): AssistantAnswer[] => (config?.answers ?? []).filter((a) => a.enabled).sort((a, b) => a.order - b.order);
