/**
 * Form → configuration for the "Assistente" screen. Pure. The editor posts its answers as one JSON field; nothing here trusts it: every row is rebuilt
 * field by field, the order is the list's order, and the result goes through the same strict validator the publisher uses (`validateAssistant`).
 */
import { ASSISTANT_ACTIONS, ASSISTANT_ANSWER_MAX, ASSISTANT_GREETING_MAX, ASSISTANT_KEYWORDS_MAX, ASSISTANT_LABEL_MAX, ASSISTANT_QUESTION_MAX, ASSISTANT_TOPIC_MAX, MAX_ASSISTANT_ANSWERS, MAX_ASSISTANT_TOPICS, validateAssistant, type AssistantAction, type AssistantAnswer, type AssistantConfig } from "../site-config/assistant-schema";
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

/**
 * `label` empty = the default text. `topics`: the editor's fields as typed (empty ones left out, so all empty = no shortcuts); absent = not part of
 * this form (the panel's preview), and the configuration keeps the default ones.
 */
export function assistantFromForm(rows: unknown, fields: { enabled: boolean; whatsapp: string; greeting: string; label?: string; topics?: unknown }, scope: Scope): Parsed<AssistantConfig> {
  if (!Array.isArray(rows)) return { ok: false, errors: ["Lista de respostas inválida. Recarregue a página e tente de novo."] };
  if (fields.topics !== undefined && !Array.isArray(fields.topics)) return { ok: false, errors: ["Lista de temas inválida. Recarregue a página e tente de novo."] };
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
  const label = line(fields.label);
  if (label) config.label = label;
  // Where each kept topic was typed: an error names the owner's field, not its place after the empty ones are left out.
  const typedAt: number[] = [];
  if (Array.isArray(fields.topics)) {
    config.topics = [];
    fields.topics.forEach((raw, i) => {
      const topic = line(raw);
      if (topic) { config.topics?.push(topic); typedAt.push(i); }
    });
  }
  const checked = validateAssistant(config, scope);
  const byField = (error: string) => error.replace(/\.topics\[(\d+)\]/, (_, k: string) => `.topics[${typedAt[Number(k)] ?? k}]`);
  return checked.ok ? { ok: true, value: checked.value } : { ok: false, errors: checked.errors.map((e) => readableAssistantError(byField(e))) };
}

/** `assistant.answers[1].answer: …` → `Resposta 2: …`, something the owner can act on. */
export function readableAssistantError(error: string): string {
  if (error.includes(".whatsapp")) return "O WhatsApp precisa ter DDD e número, como (48) 98808-2581 (ou fica vazio).";
  if (error.includes(".greeting")) return `A mensagem de abertura tem de 1 a ${ASSISTANT_GREETING_MAX} caracteres, em uma linha (ou fica vazia).`;
  if (error.includes(".label")) return `O texto do botão tem de 1 a ${ASSISTANT_LABEL_MAX} caracteres, em uma linha (ou fica vazio).`;
  const topic = /\.topics\[(\d+)\]/.exec(error);
  if (topic) return `Tema fixo ${Number(topic[1]) + 1}: ${error.endsWith("duplicate") ? "repete outro tema." : `até ${ASSISTANT_TOPIC_MAX} caracteres, em uma linha.`}`;
  if (error.includes(".topics")) return `No máximo ${MAX_ASSISTANT_TOPICS} temas fixos.`;
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
