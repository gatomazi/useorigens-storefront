/**
 * The questions the store already published on INK ("Perguntas frequentes" `/faq` and "Trocas e devoluções" `/exchanges_and_returns`), read from the
 * public pages' markup: `main.main-faq > section.questions > details > summary span` (the question) and the `<p>` after it (the answer). Pure, so the
 * tests run on a saved copy. Used only by the panel's "Trazer da INK" (the owner reviews before saving): the chat never reads INK while answering.
 */
import { ASSISTANT_ANSWER_MAX, ASSISTANT_QUESTION_MAX } from "../site-config/assistant-schema";

export type InkFaqEntry = { question: string; answer: string; page: "faq" | "trocas" };

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };
const decode = (s: string) => s.replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (all, name: string) => {
  const key = name.toLowerCase();
  if (ENTITIES[key] !== undefined) return ENTITIES[key];
  if (key.startsWith("#x")) return String.fromCodePoint(parseInt(key.slice(2), 16));
  if (key.startsWith("#")) return String.fromCodePoint(Number(key.slice(1)));
  return all;
});
// Text only: tags out, entities decoded, no `<`/`>` left (the assistant's answers refuse them), whitespace collapsed per paragraph.
// A newline in the HTML source is only a space on the page (INK's own answers break words across source lines); only <br> breaks a line.
const text = (html: string) => decode(html.replace(/\s+/g, " ").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]*>/g, " ")).replace(/[<>]/g, "").split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n");

export function parseInkFaq(html: string, page: InkFaqEntry["page"]): InkFaqEntry[] {
  const main = /<main[^>]*class=['"][^'"]*main-faq[^'"]*['"][^>]*>([\s\S]*?)<\/main>/i.exec(html)?.[1] ?? "";
  const out: InkFaqEntry[] = [];
  for (const block of main.matchAll(/<details\b[^>]*>([\s\S]*?)<\/details>/gi)) {
    const summary = /<summary\b[^>]*>([\s\S]*?)<\/summary>/i.exec(block[1]);
    if (!summary) continue;
    const question = text(summary[1]).replace(/\n/g, " ");
    const answer = block[1].slice((summary.index ?? 0) + summary[0].length).match(/<p\b[^>]*>[\s\S]*?<\/p>/gi)?.map(text).filter(Boolean).join("\n\n") ?? "";
    if (question && answer && question.length <= ASSISTANT_QUESTION_MAX) out.push({ question, answer: answer.slice(0, ASSISTANT_ANSWER_MAX).trim(), page });
  }
  return out;
}

/** Both pages' questions, the FAQ first; a question on both (devolução, troca) appears once. */
export function mergeInkFaq(...lists: InkFaqEntry[][]): InkFaqEntry[] {
  const seen = new Set<string>();
  const key = (q: string) => q.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  return lists.flat().filter((e) => !seen.has(key(e.question)) && (seen.add(key(e.question)), true));
}

/** Words people use for the usual store questions, offered with an imported answer (the owner can edit them). Empty when the topic is unknown. */
const TOPICS: { test: RegExp; keywords: string; action?: "orders" | "tracking" }[] = [
  { test: /tecido|malha|algod/i, keywords: "tecido, algodão, malha, material, composição, encolhe" },
  { test: /frete/i, keywords: "frete, valor do frete, cep, entrega grátis, frete grátis" },
  { test: /tempo de envio|prazo|entrega do meu pedido/i, keywords: "prazo, demora, quando chega, dias úteis, produção, entrega" },
  { test: /devolu|reembolso/i, keywords: "devolução, devolver, reembolso, estorno, arrependimento", action: "orders" },
  { test: /troca/i, keywords: "troca, trocar, tamanho errado, defeito, não serviu", action: "orders" },
  { test: /acompanh|rastre/i, keywords: "rastreio, rastrear, acompanhar, código de rastreio, onde está", action: "tracking" },
  { test: /pagamento|pagar/i, keywords: "pagamento, pix, cartão, boleto, parcelar, parcelamento" },
  { test: /aprova/i, keywords: "aprovação, pagamento aprovado, pendente, confirmação" },
  { test: /suporte|canais|contato/i, keywords: "suporte, contato, atendimento, falar, e-mail, instagram" },
  { test: /reserva/i, keywords: "reserva, reserva ink, quem produz, fábrica, qualidade" },
];
export function suggestedFor(question: string): { keywords: string; action?: "orders" | "tracking" } {
  const topic = TOPICS.find((t) => t.test.test(question));
  return topic ? { keywords: topic.keywords, ...(topic.action ? { action: topic.action } : {}) } : { keywords: "" };
}
