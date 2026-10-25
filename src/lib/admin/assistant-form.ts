/**
 * Form → configuration for the "Assistente" screen. Pure. The editor posts its answers as one JSON field; nothing here trusts it: every row is rebuilt
 * field by field, the order is the list's order, and the result goes through the same strict validator the publisher uses (`validateAssistant`).
 */
import { ASSISTANT_ACTIONS, ASSISTANT_ANSWER_MAX, ASSISTANT_GREETING_MAX, ASSISTANT_KEYWORDS_MAX, ASSISTANT_QUESTION_MAX, MAX_ASSISTANT_ANSWERS, validateAssistant, type AssistantAction, type AssistantAnswer, type AssistantConfig } from "../site-config/assistant-schema";
import { PROMO_ID } from "../site-config/promotions-schema";
import type { Scope } from "../site-config/schema";
import { promotionId, type Parsed } from "./promotions-form";

/** One row as the editor holds it (all strings: half-typed values must survive a re-render). */
export type AssistantRow = { id: string; enabled: boolean; question: string; answer: string; keywords: string; action: string };

const line = (v: unknown): string => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "");
/** The answer keeps its line breaks (at most one empty line in a row); spaces inside a line collapse. */
export const answerText = (v: unknown): string =>
  typeof v === "string"
    ? v.replace(/\r\n?/g, "\n").split("\n").map((l) => l.replace(/[ \t ]+/g, " ").trim()).join("\n").replace(/\n{3,}/g, "\n\n").trim()
    : "";
/** "5548988082581", "+55 (48) 98808-2581", "(48) 98808-2581" → digits with the country code. "" stays "". */
export function whatsappDigits(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  return digits.length === 10 || digits.length === 11 ? `55${digits}` : digits;
}

export function assistantFromForm(rows: unknown, fields: { enabled: boolean; whatsapp: string; greeting: string }, scope: Scope): Parsed<AssistantConfig> {
  if (!Array.isArray(rows)) return { ok: false, errors: ["Lista de respostas inválida. Recarregue a página e tente de novo."] };
  if (rows.length > MAX_ASSISTANT_ANSWERS) return { ok: false, errors: [`No máximo ${MAX_ASSISTANT_ANSWERS} respostas por região.`] };
  const taken = new Set<string>(rows.map((r) => (r && typeof r === "object" ? line((r as Record<string, unknown>).id) : "")).filter((id) => PROMO_ID.test(id)));
  const seen = new Set<string>();
  const answers: AssistantAnswer[] = rows.map((raw, i) => {
    const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const question = line(r.question);
    let id = line(r.id);
    if (!PROMO_ID.test(id) || seen.has(id)) id = promotionId(question, new Set([...taken, ...seen]));
    seen.add(id);
    const answer: AssistantAnswer = { id, enabled: r.enabled === true, question, answer: answerText(r.answer), order: i + 1 };
    const keywords = line(r.keywords);
    if (keywords) answer.keywords = keywords;
    const action = line(r.action);
    if ((ASSISTANT_ACTIONS as readonly string[]).includes(action)) answer.action = action as AssistantAction;
    return answer;
  });
  const config: AssistantConfig = { enabled: fields.enabled, answers };
  const whatsapp = whatsappDigits(fields.whatsapp.trim());
  if (whatsapp) config.whatsapp = whatsapp;
  const greeting = line(fields.greeting);
  if (greeting) config.greeting = greeting;
  const checked = validateAssistant(config, scope);
  return checked.ok ? { ok: true, value: checked.value } : { ok: false, errors: checked.errors.map(readableAssistantError) };
}

/** `assistant.answers[1].answer: …` → `Resposta 2: …`, something the owner can act on. */
export function readableAssistantError(error: string): string {
  if (error.includes(".whatsapp")) return "O WhatsApp precisa ter DDD e número, como (48) 98808-2581 (ou fica vazio).";
  if (error.includes(".greeting")) return `A mensagem de abertura tem de 1 a ${ASSISTANT_GREETING_MAX} caracteres, em uma linha (ou fica vazia).`;
  const m = /answers\[(\d+)\]\.?(\w*)/.exec(error);
  if (!m) return error.includes("at most") ? `No máximo ${MAX_ASSISTANT_ANSWERS} respostas por região.` : `Assistente: ${error.replace(/^[^:]*:\s*/, "")}`;
  const who = `Resposta ${Number(m[1]) + 1}`;
  const say: Record<string, string> = {
    question: `a pergunta precisa ter de 1 a ${ASSISTANT_QUESTION_MAX} caracteres, em uma linha.`,
    answer: `a resposta precisa ter de 1 a ${ASSISTANT_ANSWER_MAX} caracteres (sem < e >).`,
    keywords: `as outras palavras têm até ${ASSISTANT_KEYWORDS_MAX} caracteres, em uma linha.`,
    action: "escolha um botão da lista.",
  };
  return `${who}: ${say[m[2]] ?? error.replace(/^[^:]*:\s*/, "")}`;
}
