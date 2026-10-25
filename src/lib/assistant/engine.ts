/**
 * The assistant's answer to one message. Pure and predictable, no AI (owner's decision, the same as the M10 of oria-worker):
 *  - security first: a CPF, card or password is refused before anything else (and the text is never echoed back);
 *  - order, tracking, exchange: INK's own pages (the chat never looks an order up and never asks who the person is);
 *  - "falar com alguém": the store's WhatsApp, with the question already written;
 *  - a question the store answered in the panel: that answer, word for word;
 *  - a place, a theme or a design: real designs from the storefront's catalog (`AssistantSources`, server-side);
 *  - nothing found: says so and offers the WhatsApp. It never makes up a price, a deadline or a policy.
 * The sources are injected, so this file has no server dependency and the same rules run in the tests and in the panel's preview.
 */
import type { AssistantAction, AssistantAnswer } from "../site-config/assistant-schema";

export const MAX_ASSISTANT_MESSAGE = 300;
export const ASSISTANT_SUGGESTIONS = 4;
export const ASSISTANT_ITEMS = 4;

/** A product or design card: a real photo, the INK price when the source has one, and its page (INK product or storefront page). */
export type AssistantItem = { title: string; context?: string; image: string; price?: number; href: string; /** The INK product, when the card opens one (GoToInk). */ productId?: string };
/** `page` = a page of the storefront; `collection` = a category page on INK (a category the storefront has no page for). */
export type AssistantLinkKind = "page" | "collection" | "orders" | "tracking" | "whatsapp" | "search";
export type AssistantLink = { kind: AssistantLinkKind; label: string; href: string };
export type AssistantReplyKind = "greeting" | "answer" | "designs" | "order" | "handoff" | "refuse" | "ask" | "not-found" | "fallback" | "chat";

/** `v: 1`, the contract of `/api/assistente/<region>` (the Worker re-validates every field before the INK page sees it). */
export type AssistantReply = {
  v: 1;
  kind: AssistantReplyKind;
  text: string;
  items?: AssistantItem[];
  links?: AssistantLink[];
  /** Follow-up questions offered as chips (questions of the store's base). */
  suggestions?: string[];
};

/** What the catalog found for a place, a collection or free words. `title` is the line above the cards. */
/** `match`: what was found (a place or a collection is a definite answer; loose designs may be bettered by another attempt). */
export type DesignFind = { match: "place" | "collection" | "designs" | "category" | "page"; title: string; items: AssistantItem[]; links: AssistantLink[] };

export type AssistantSources = {
  /** Designs for the words of a message (already stripped of "tem", "camiseta de"…), or null when nothing in the catalog matches. */
  findDesigns(terms: readonly string[]): DesignFind | null;
  /** INK's order pages of this store and the storefront's search; `whatsapp` = the number of the hand-off, null without one. */
  ordersUrl: string;
  trackingUrl: string;
  whatsapp: string | null;
};

export function fold(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

const STOP = new Set(
  "a o os as de da do das dos e em um uma uns umas para pra pro por com sem que qual quais quanto quantos como onde quando se no na nos nas ao aos eu voce voces vc vcs me te meu minha meus minhas seu sua seus suas tem ter tenho isso esse essa este esta ou mais menos muito pouco ja ainda oi ola boa bom dia tarde noite obrigado obrigada favor ai la aqui so tambem".split(" "),
);
/** Words of asking for something: they leave the terms sent to the catalog ("tem estampa de Floripa?" → "floripa"). */
const SEARCH_FILLERS = new Set(
  "quanto custa custam preco precos valor valores barato barata presente presentes vende vendem venda procuro procurando procura quero queria gostaria busco buscando buscar achar acho encontrar existe existem estampa estampas estampada estampado desenho desenhos tema temas modelo modelos peca pecas roupa roupas alguma algum algo loja site colecao colecoes linha cidade estado opcao opcoes".split(" "),
);
/** Garment types: never the theme ("camiseta de pai" → "pai"). Kept out of the terms: the catalog lists designs, not garments. */
const GARMENTS = new Set("camiseta camisetas camisa camisas blusa blusas moletom moletons body bodies cropped regata regatas oversized babylook infantil feminina feminino masculina masculino unissex caneca canecas bone bones".split(" "));
/** Common ways of saying the themes the catalog names otherwise. Each one is tried after the word itself. */
const SYNONYMS: Record<string, string[]> = {
  mamae: ["mae"], mainha: ["mae"], maezinha: ["mae"], papai: ["pai"], painho: ["pai"], paizao: ["pai"],
  vovo: ["avo"], vo: ["avo"], vozinha: ["avo"],
  cachorro: ["pet", "cachorro"], cachorra: ["pet"], dog: ["pet"], cao: ["pet"], gato: ["pet", "gato"], gata: ["pet"],
  namorado: ["casal"], namorada: ["casal"], marido: ["casal"], esposa: ["casal"], noivos: ["casal"],
  gaucho: ["gaucho", "rio grande do sul"], catarinense: ["santa catarina"], paranaense: ["parana"],
  chima: ["chimarrao"], mate: ["chimarrao"],
};

const SENSITIVE = /(\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b|\bcpf\b|cart[aã]o de cr[eé]dito|n[uú]mero do cart[aã]o|\bcvv\b|\bsenha\b|\b(?:\d[ -]?){13,19}\b)/i;
const ORDER_INTENT = /(meu pedido|minha compra|meus pedidos|rastre|rastreio|c[oó]digo de rastreio|status do pedido|onde est[aá] (o )?(meu|minha)|n[aã]o chegou|ainda n[aã]o recebi|atrasad|n[uú]mero do pedido|acompanhar (o )?(meu )?pedido|cancelar (o )?(meu )?pedido)/i;
const EXCHANGE_INTENT = /(troca|trocar|devolu|devolver|reembolso|estorno|veio errad|veio com defeito|defeito)/i;
const HUMAN_INTENT = /(falar com (algu[eé]m|uma pessoa|atendente|humano|voc[eê]s)|atendente|atendimento humano|whats|zap|telefone|ligar pra|contato)/i;
const PRODUCT_INTENT = /\b(procur|quero|queria|gostaria|busc|tem\b|t[eê]m\b|vende|camis|moletom|body|cropped|caneca|presente|estamp|desenho|tema|cole[cç]|modelo|pe[cç]a|roupa|infantil|feminin|masculin|oversized|cidade)/i;
const GREETING = /^(oi+|ol[aá]|opa|e a[ií]|bom dia|boa tarde|boa noite|hey|hello|eae|eai|tudo bem\??)[\s!.,?]*$/i;
/** A greeting before the question ("oi, tem de Floripa?"): taken off, the question is answered right away. */
const LEADING_GREETING = /^(oi+|ol[aá]|opa|e a[ií]|bom dia|boa tarde|boa noite|eae|eai)( tudo (bem|bom))?[\s!.,?]+(?=\S)/i;
const THANKS = /^(muito )?(obrigad[oa]|brigad[oa]|valeu|vlw|agrade[cç]o|obg)\b/i;
const BYE = /^(tchau|at[eé] (mais|logo|breve)|falou|flw|bye)\b/i;
const OK = /^(ok|okay|beleza|blz|show|top|legal|massa|perfeito|entendi|certo|bacana|maravilha|[oó]timo|boa)[\s!.]*$/i;
const PRICE_INTENT = /(quanto (custa|é|e|sai|fica)|pre[cç]o|valor|t[aá] quanto|barat)/i;
const SIZE_INTENT = /(tamanho|medida|tabela de medidas|veste|serve em mim|forma (grande|pequeno))/i;

/** A CPF, a card number, a CVV or a password: refused before the text leaves the browser (the server refuses it again). */
export const isSensitive = (message: string): boolean => SENSITIVE.test(message);

/** Words of a message without accents, punctuation and stopwords; long plurals reduced ("trocas" → "troca"). */
export function normalize(s: string): string[] {
  return fold(s)
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP.has(w))
    .map((w) => (w.length > 4 ? w.replace(/(oes|aes|s)$/, "") : w));
}

export type RankedAnswer = { answer: AssistantAnswer; score: number };

/** Each answer of the base scored by the words it shares with the message: keywords weigh 3, the question 2, the answer 1; a shared stem counts 1. */
export function rankAnswers(message: string, answers: readonly AssistantAnswer[]): RankedAnswer[] {
  const q = new Set(normalize(message));
  if (q.size === 0) return [];
  return answers
    .map((answer) => {
      const kw = new Set(normalize((answer.keywords ?? "").replace(/,/g, " ")));
      const qq = new Set(normalize(answer.question));
      const aa = new Set(normalize(answer.answer));
      let score = 0;
      for (const t of q) {
        if (kw.has(t)) score += 3;
        if (qq.has(t)) score += 2;
        if (aa.has(t)) score += 1;
        else if (t.length > 3 && [...kw, ...qq].some((w) => w.length > 3 && (w.startsWith(t.slice(0, 4)) || t.startsWith(w.slice(0, 4))))) score += 1;
      }
      return { answer, score: score / Math.sqrt(q.size) };
    })
    .filter((r) => r.score >= 1.2)
    .sort((a, b) => b.score - a.score || a.answer.order - b.answer.order);
}

/**
 * The words of a design search: the message without stopwords, "asking" words and garment types ("tem camiseta de Floripa?" → ["floripa"]). A word
 * said twice in a row is a name, never an "asking" word ("quero-quero", the bird).
 */
export function searchTerms(message: string): string[] {
  const words = fold(message).replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
  const doubled = (i: number) => words[i] === words[i - 1] || words[i] === words[i + 1];
  return words.filter((w, i) => w.length > 1 && (doubled(i) || (!STOP.has(w) && !SEARCH_FILLERS.has(w) && !GARMENTS.has(w)))).slice(0, 5);
}

/** The searches to try, in order: the words as typed, then each word's synonyms, then single words (longest first). */
export function searchAttempts(terms: readonly string[]): string[][] {
  if (terms.length === 0) return [];
  const out: string[][] = [[...terms]];
  const seen = new Set([terms.join(" ")]);
  const add = (list: string[]) => {
    const key = list.join(" ");
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(list);
  };
  const expanded = terms.map((t) => SYNONYMS[t]?.[0] ?? t);
  add(expanded);
  for (const t of terms) for (const s of SYNONYMS[t] ?? []) add([s]);
  // "pais" → "pai", "maes" → "mae": the designs name the singular.
  if (terms.some((t) => t.length > 3 && t.endsWith("s"))) add(terms.map((t) => (t.length > 3 && t.endsWith("s") ? t.slice(0, -1) : t)));
  if (terms.length > 1) for (const t of [...terms].sort((a, b) => b.length - a.length)) if (t.length >= 3) add([t]);
  // The catalog matches the start of a word: "abelha" does not find "Abelhinhas", "abelh" does.
  for (const t of [...terms].sort((a, b) => b.length - a.length)) if (t.length >= 6) add([t.slice(0, -1)]);
  return out.slice(0, 7);
}

const SECURITY_TEXT = "Por segurança, não mande CPF, dados de cartão nem senha por aqui. Para ver ou mudar um pedido, entre em Meus pedidos com o e-mail da compra.";
const ORDER_TEXT = "O status e o rastreio do seu pedido ficam em Meus pedidos: entre com o e-mail usado na compra. Se algo estiver errado, fale com a gente pelo WhatsApp.";
const EXCHANGE_TEXT = "Trocas e devoluções são pedidas em Meus pedidos: entre com o e-mail da compra, escolha o pedido e a peça.";
const HANDOFF_TEXT = "Claro! Fale com a nossa equipe pelo WhatsApp, a sua pergunta já vai escrita.";
const PRICE_TEXT = "O preço aparece em cada estampa e pode mudar com o modelo da peça. Me diga a cidade ou o tema que eu mostro as opções com o valor.";
const SIZE_TEXT = "Na página de cada peça tem o Guia de medidas, com a tabela do modelo escolhido. Se ficar em dúvida entre dois tamanhos, a nossa equipe ajuda pelo WhatsApp.";
const ASK_TEXT = "Escreva o nome da cidade ou do tema que você procura, por exemplo: Florianópolis, Tijucas, chimarrão ou mãe.";
const NO_WHATSAPP_TEXT = "Por aqui eu ajudo a achar estampas e respondo dúvidas de pedido, troca, frete e tamanhos.";

export function whatsappUrl(phone: string, message: string): string {
  const said = message.replace(/\s+/g, " ").trim().slice(0, MAX_ASSISTANT_MESSAGE);
  const text = said ? `Olá! Vim pela loja e tenho uma dúvida: ${said}` : "Olá! Vim pela loja e tenho uma dúvida.";
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}

/** The opening message: the store's line and its first questions as chips. */
export function greetingReply(greeting: string, answers: readonly AssistantAnswer[]): AssistantReply {
  return { v: 1, kind: "greeting", text: greeting, suggestions: ["Tem estampa da minha cidade?", ...answers.slice(0, ASSISTANT_SUGGESTIONS - 1).map((a) => a.question)] };
}

export function replyTo(rawMessage: string, answers: readonly AssistantAnswer[], sources: AssistantSources, greeting: string): AssistantReply {
  const message = rawMessage.replace(/\s+/g, " ").trim().slice(0, MAX_ASSISTANT_MESSAGE);
  const whatsapp = (text: string): AssistantLink[] => (sources.whatsapp ? [{ kind: "whatsapp", label: "Falar no WhatsApp", href: whatsappUrl(sources.whatsapp, text) }] : []);
  const orderLinks: AssistantLink[] = [
    { kind: "tracking", label: "Status do pedido", href: sources.trackingUrl },
    { kind: "orders", label: "Meus pedidos", href: sources.ordersUrl },
  ];
  const actionLink = (action: AssistantAction | undefined): AssistantLink[] =>
    action === "tracking" ? [orderLinks[0]] : action === "orders" ? [{ kind: "orders", label: "Abrir Meus pedidos", href: sources.ordersUrl }] : [];
  const related = (ranked: readonly RankedAnswer[], skip?: AssistantAnswer) => ranked.filter((r) => r.answer !== skip).slice(0, 2).map((r) => r.answer.question);

  if (message === "" || GREETING.test(message)) return greetingReply(greeting, answers);
  const leading = LEADING_GREETING.exec(message);
  if (leading) return replyTo(message.slice(leading[0].length), answers, sources, greeting);
  // Never echoed and never forwarded: not even into the WhatsApp text. Before small talk: "tchau, minha senha é…" is refused, not a goodbye.
  if (SENSITIVE.test(message)) return { v: 1, kind: "refuse", text: SECURITY_TEXT, links: [orderLinks[1]] };
  // Small talk: short and kind, never a search ("valeu" is not a design).
  const more = greetingReply(greeting, answers).suggestions;
  if (THANKS.test(message) && message.split(" ").length <= 4) return { v: 1, kind: "chat", text: "Por nada! Se precisar de mais alguma coisa, é só chamar.", suggestions: more };
  if (BYE.test(message)) return { v: 1, kind: "chat", text: "Até mais! Quando quiser, estou por aqui." };
  if (OK.test(message)) return { v: 1, kind: "chat", text: "Que bom! Posso ajudar com mais alguma coisa?", suggestions: more };

  const ranked = rankAnswers(message, answers);
  const best = ranked[0];
  const strong = best !== undefined && best.score >= 3;

  if (ORDER_INTENT.test(message)) {
    const own = best && (best.answer.action === "tracking" || best.score >= 3) ? best.answer : null;
    return { v: 1, kind: "order", text: own ? own.answer : ORDER_TEXT, links: [...orderLinks, ...whatsapp(message)] };
  }
  if (EXCHANGE_INTENT.test(message)) {
    const own = best && best.score >= 1.5 ? best.answer : null;
    return { v: 1, kind: "order", text: own ? own.answer : EXCHANGE_TEXT, links: [{ kind: "orders", label: "Pedir troca ou devolução", href: sources.ordersUrl }, ...whatsapp(message)], ...(own ? { suggestions: related(ranked, own) } : {}) };
  }
  if (HUMAN_INTENT.test(message) && !strong) {
    return sources.whatsapp ? { v: 1, kind: "handoff", text: HANDOFF_TEXT, links: whatsapp(message) } : { v: 1, kind: "fallback", text: NO_WHATSAPP_TEXT, suggestions: greetingReply(greeting, answers).suggestions };
  }
  if (strong) return { v: 1, kind: "answer", text: best.answer.answer, links: actionLink(best.answer.action), suggestions: related(ranked, best.answer) };
  // Size without the store's own answer: where the measurements are (every product page has them), and the team for a doubt.
  if (SIZE_INTENT.test(message)) return { v: 1, kind: "answer", text: SIZE_TEXT, links: whatsapp(message) };

  const terms = searchTerms(message);
  const price = PRICE_INTENT.test(message);
  const asked = PRODUCT_INTENT.test(message) || price;
  if (terms.length > 0) {
    const found = sources.findDesigns(terms);
    if (found && (found.items.length > 0 || found.links.length > 0)) return { v: 1, kind: "designs", text: price && found.items.some((i) => i.price) ? `${found.title.replace(/:$/, "")}, com o preço de cada uma:` : found.title, items: found.items.slice(0, ASSISTANT_ITEMS), links: found.links };
  }
  // Price without the store's own answer: what the pages already show, never a made-up number.
  if (price && terms.length === 0 && !best) return { v: 1, kind: "ask", text: PRICE_TEXT };
  if (asked && terms.length === 0) return { v: 1, kind: "ask", text: ASK_TEXT };
  if (best) return { v: 1, kind: "answer", text: best.answer.answer, links: actionLink(best.answer.action), suggestions: related(ranked, best.answer) };
  if (asked) {
    // The words as the person wrote them (with accents), only those that were searched.
    const said = message.split(/\s+/).map((w) => w.replace(/[^\p{L}\p{N}-]/gu, "")).filter((w) => w && terms.includes(fold(w)));
    const what = said.length > 0 ? ` com “${said.join(" ")}”` : "";
    return { v: 1, kind: "not-found", text: `Não encontrei estampas${what} na loja.${sources.whatsapp ? " Se quiser, a nossa equipe ajuda pelo WhatsApp." : ""}`, links: whatsapp(message) };
  }
  return {
    v: 1,
    kind: "fallback",
    text: sources.whatsapp ? "Não tenho essa resposta aqui. A nossa equipe responde pelo WhatsApp." : `Não tenho essa resposta aqui. ${NO_WHATSAPP_TEXT}`,
    links: whatsapp(message),
    suggestions: greetingReply(greeting, answers).suggestions,
  };
}

const MORE = /^(e )?(tem )?(mais|outras?|outros?|mostra mais|ver mais|quero ver mais|mais op[cç][oõ]es|ver todas?|todas?)[\s!?.]*$/i;
const YES = /^(sim|s|pode|pode ser|quero|claro|isso|ok|bora|vamos)[\s!.]*$/i;

/**
 * A follow-up the chat answers by itself, from the previous answer, without asking the server: "tem mais?" after designs = the link to all of them;
 * "sim" after an offer of the WhatsApp = the WhatsApp. Null = not a follow-up (the message goes to the server). Pure: the storefront's chat uses it, and
 * the INK loader repeats the same two rules.
 */
export function followUp(message: string, previous: AssistantReply | null): AssistantReply | null {
  if (!previous) return null;
  const text = message.replace(/\s+/g, " ").trim();
  const all = previous.links?.find((l) => l.kind === "search" || l.kind === "page" || l.kind === "collection");
  if (MORE.test(text) && previous.kind === "designs" && all) return { v: 1, kind: "designs", text: "Todas estão nesta página:", links: [all] };
  const whatsapp = previous.links?.find((l) => l.kind === "whatsapp");
  if (YES.test(text) && whatsapp && (previous.kind === "not-found" || previous.kind === "fallback" || previous.kind === "handoff" || previous.kind === "answer")) return { v: 1, kind: "handoff", text: "Combinado! Toque abaixo para falar com a nossa equipe.", links: [whatsapp] };
  return null;
}

/** How long "digitando…" stays before an answer: a little longer for longer texts, never slow (0,7 s to 1,8 s). */
export const typingDelay = (reply: Pick<AssistantReply, "text">): number => Math.min(1800, Math.max(700, 450 + reply.text.length * 9));
