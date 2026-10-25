import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { assistantFromForm, readableAssistantError, whatsappDigits, type AssistantRow } from "@/lib/admin/assistant-form";
import { applyOp } from "@/lib/admin/draft-ops";
import { diffDocs } from "@/lib/admin/diff";
import { assistantEnabled } from "@/lib/assistant/flag";
import { followUp, isSensitive, rankAnswers, replyTo, searchAttempts, searchTerms, typingDelay, whatsappUrl, type AssistantReply, type AssistantSources, type DesignFind } from "@/lib/assistant/engine";
import { closestPlace, editDistance } from "@/lib/assistant/sources";
import type { PreparedGlobalDoc } from "@/lib/search/global";
import { mergeInkFaq, parseInkFaq, suggestedFor } from "@/lib/assistant/ink-faq";
import { liveAnswers, validateAssistant, type AssistantAnswer, type AssistantConfig } from "@/lib/site-config/assistant-schema";
import { sanitizeBundle } from "@/lib/site-config/sanitize";
import { validateScopeDoc, type ScopeDoc } from "@/lib/site-config/schema";
import { buildSeedBundle } from "@/lib/site-config/seed";

const seed = () => buildSeedBundle({ metaPixelId: null, ga4MeasurementId: null });
const ctx = { newId: () => "t1" };
const fixture = (name: string) => readFileSync(join(__dirname, "../fixtures/ink-faq", name), "utf8");

const tecido: AssistantAnswer = { id: "tecido", enabled: true, order: 1, question: "Qual é o tecido das camisetas?", answer: "Algodão 30.1 penteado.", keywords: "tecido, algodão, malha, material" };
const prazo: AssistantAnswer = { id: "prazo", enabled: true, order: 2, question: "Qual o tempo de envio e entrega do meu pedido?", answer: "A produção leva de 2 a 5 dias úteis.", keywords: "prazo, demora, quando chega, dias úteis" };
const troca: AssistantAnswer = { id: "troca", enabled: true, order: 3, question: "Como é o processo de troca?", answer: "Até 30 dias depois de receber.", keywords: "troca, trocar, tamanho errado", action: "orders" };
const rastreio: AssistantAnswer = { id: "rastreio", enabled: true, order: 4, question: "Como eu acompanho minha entrega?", answer: "Pelo e-mail da compra ou em Meus pedidos.", keywords: "rastreio, rastrear, acompanhar", action: "tracking" };
const pagamento: AssistantAnswer = { id: "pagamento", enabled: false, order: 5, question: "Quais formas de pagamento são aceitas?", answer: "Pix e cartão.", keywords: "pagamento, pix, boleto" };
const answers = [tecido, prazo, troca, rastreio];
const config: AssistantConfig = { enabled: true, whatsapp: "5548988082581", answers: [...answers, pagamento] };

const floripa: DesignFind = { match: "place", title: "Estampas de Florianópolis:", items: [{ title: "Ponto de Origem", context: "Florianópolis · SC", image: "https://gcp-images.majestic.ink.rsvcloud.com/x.webp", price: 109.9, href: "https://loja.useorigens.com.br/useorigens/product/florianopolis-origem", productId: "1" }], links: [{ kind: "page", label: "Ver Florianópolis", href: "https://www.useorigens.com.br/sul/sc/florianopolis" }] };
const asked: string[][] = [];
const sources = (whatsapp: string | null = "5548988082581"): AssistantSources => ({
  findDesigns: (terms) => {
    asked.push([...terms]);
    return terms.includes("floripa") ? floripa : null;
  },
  ordersUrl: "https://loja.useorigens.com.br/useorigens/orders",
  trackingUrl: "https://loja.useorigens.com.br/useorigens/orders/trackings",
  whatsapp,
});
const ask = (message: string, s = sources()) => replyTo(message, answers, s, "Oi!");

describe("assistente: o motor de respostas (sem IA)", () => {
  test("a greeting opens with the store's line and its first questions as suggestions", () => {
    const r = ask("oi");
    expect(r.kind).toBe("greeting");
    expect(r.text).toBe("Oi!");
    expect(r.suggestions).toEqual(["Tem estampa da minha cidade?", tecido.question, prazo.question, troca.question]);
    expect(ask("").kind).toBe("greeting");
  });

  test("a CPF, a card number or a password is refused, never echoed and never forwarded to WhatsApp", () => {
    for (const m of ["meu cpf é 123.456.789-00", "12345678900", "cartão 4111 1111 1111 1111", "minha senha é abc", "cvv 123"]) {
      expect(isSensitive(m)).toBe(true);
      const r = ask(m);
      expect(r.kind).toBe("refuse");
      expect(JSON.stringify(r)).not.toMatch(/123|4111|abc/);
      expect(r.links?.some((l) => l.kind === "whatsapp")).toBe(false);
    }
    expect(isSensitive("tem de Floripa?")).toBe(false);
    expect(isSensitive("pedido 48291")).toBe(false);
  });

  test("an order question goes to INK's order pages (the chat never looks an order up), with the store's tracking answer when there is one", () => {
    const r = ask("cadê meu pedido? ainda não chegou");
    expect(r.kind).toBe("order");
    expect(r.links?.map((l) => l.kind)).toEqual(["tracking", "orders", "whatsapp"]);
    expect(ask("como rastrear minha encomenda").text).toBe(rastreio.answer);
    expect(replyTo("onde está meu pedido", [], sources(), "Oi!").text).toMatch(/Meus pedidos/);
  });

  test("an exchange question answers with the store's words and the button to ask for it", () => {
    const r = ask("quero trocar o tamanho");
    expect(r.kind).toBe("order");
    expect(r.text).toBe(troca.answer);
    expect(r.links?.[0]).toEqual({ kind: "orders", label: "Pedir troca ou devolução", href: "https://loja.useorigens.com.br/useorigens/orders" });
  });

  test("a question of the base gets its answer word for word, plus its button; the keywords weigh more than the question", () => {
    expect(ask("qual o tecido?")).toMatchObject({ kind: "answer", text: tecido.answer });
    expect(ask("quanto tempo demora pra chegar").text).toBe(prazo.answer);
    const ranked = rankAnswers("de que material é a malha", answers);
    expect(ranked[0].answer.id).toBe("tecido");
    expect(liveAnswers(config).map((a) => a.id)).toEqual(["tecido", "prazo", "troca", "rastreio"]);
  });

  test("asking for a person opens the WhatsApp with the question written; without a number it says what it can do", () => {
    const r = ask("quero falar com atendente");
    expect(r.kind).toBe("handoff");
    expect(r.links?.[0].href).toBe(whatsappUrl("5548988082581", "quero falar com atendente"));
    expect(decodeURIComponent(r.links?.[0].href ?? "")).toContain("Olá! Vim pela loja e tenho uma dúvida: quero falar com atendente");
    expect(ask("quero falar com atendente", sources(null)).links ?? []).toEqual([]);
  });

  test("a place, a theme or a design: the words without 'tem', 'camiseta de'…; synonyms and the singular are tried after", () => {
    expect(searchTerms("Tem camiseta de Floripa?")).toEqual(["floripa"]);
    expect(searchTerms("quero uma estampa da minha mamãe")).toEqual(["mamae"]);
    expect(searchAttempts(["mamae"])).toEqual([["mamae"], ["mae"]]);
    expect(searchAttempts(["pais"])).toEqual([["pais"], ["pai"]]);
    expect(searchAttempts(["abelha"])).toEqual([["abelha"], ["abelh"]]);
    const r = ask("Tem camiseta de Floripa?");
    expect(r).toMatchObject({ kind: "designs", text: floripa.title, items: floripa.items, links: floripa.links });
  });

  test("nothing found: says so with the person's own words and offers the WhatsApp; never a made-up product", () => {
    const r = ask("tem estampa de unicórnio?");
    expect(r.kind).toBe("not-found");
    expect(r.text).toBe("Não encontrei estampas com “unicórnio” na loja. Se quiser, a nossa equipe ajuda pelo WhatsApp.");
    expect(r.items).toBeUndefined();
    expect(ask("tem estampa da minha cidade?").kind).toBe("ask");
    expect(ask("vocês fazem atacado para empresas?")).toMatchObject({ kind: "fallback", links: [{ kind: "whatsapp" }] });
  });
});

describe("assistente: a mini inteligência (sem IA)", () => {
  test("small talk is answered kindly and never searched; a greeting before the question is taken off", () => {
    expect(ask("valeu!")).toMatchObject({ kind: "chat", text: "Por nada! Se precisar de mais alguma coisa, é só chamar." });
    expect(ask("muito obrigada")).toMatchObject({ kind: "chat" });
    expect(ask("tchau")).toMatchObject({ kind: "chat", text: "Até mais! Quando quiser, estou por aqui." });
    expect(ask("beleza")).toMatchObject({ kind: "chat" });
    expect(ask("oi, tem de Floripa?")).toMatchObject({ kind: "designs", text: floripa.title });
    expect(ask("boa tarde! qual o tecido?")).toMatchObject({ kind: "answer", text: tecido.answer });
  });

  test("a word said twice is a name (quero-quero, the bird), not 'I want'", () => {
    expect(searchTerms("quero quero")).toEqual(["quero", "quero"]);
    expect(searchTerms("tem estampa de quero-quero?")).toEqual(["quero", "quero"]);
    expect(searchTerms("quero uma camiseta")).toEqual([]);
  });

  test("price and size without the store's answer: where it is, never a number made up", () => {
    expect(ask("quanto custa?")).toMatchObject({ kind: "ask", text: expect.stringMatching(/^O preço aparece em cada estampa/) });
    expect(ask("quanto custa a de floripa?")).toMatchObject({ kind: "designs", text: "Estampas de Florianópolis, com o preço de cada uma:" });
    expect(ask("qual tamanho eu peço?")).toMatchObject({ kind: "answer", text: expect.stringMatching(/Guia de medidas/), links: [{ kind: "whatsapp" }] });
  });

  test("follow-ups are answered from the previous answer: 'tem mais?' = all of them; 'sim' after an offer = the WhatsApp", () => {
    const designs: AssistantReply = { v: 1, kind: "designs", text: "Encontrei:", links: [{ kind: "search", label: "Ver as 13 estampas", href: "https://www.useorigens.com.br/sul/busca?q=mae" }] };
    expect(followUp("tem mais?", designs)).toEqual({ v: 1, kind: "designs", text: "Todas estão nesta página:", links: designs.links });
    expect(followUp("mostra mais", designs)?.links?.[0].kind).toBe("search");
    const offer = ask("tem estampa de unicórnio?");
    expect(followUp("sim", offer)).toMatchObject({ kind: "handoff", links: [{ kind: "whatsapp" }] });
    expect(followUp("sim", designs)).toBeNull();
    expect(followUp("tem de Tijucas?", designs)).toBeNull();
    expect(followUp("mais", null)).toBeNull();
  });

  test("typing delay: never instant, never slow, a bit longer for longer answers", () => {
    expect(typingDelay({ text: "Oi" })).toBe(700);
    expect(typingDelay({ text: "x".repeat(80) })).toBe(1170);
    expect(typingDelay({ text: "x".repeat(900) })).toBe(1800);
  });

  test("a place typed wrong: the one close name ('curitiva' → Curitiba), never a guess between two", () => {
    expect(editDistance("curitiva", "curitiba", 2)).toBe(1);
    expect(editDistance("florianopoles", "florianopolis", 2)).toBe(1);
    expect(editDistance("joivnille", "joinville", 2)).toBe(1);
    expect(editDistance("abc", "xyzw", 1)).toBe(2);
    const place = (title: string, ...names: string[]) => ({ doc: { title, kind: "locality" }, names, strong: [], weak: [] }) as unknown as PreparedGlobalDoc;
    const places = [place("Curitiba", "curitiba"), place("Curitibanos", "curitibanos"), place("Tijucas", "tijucas"), place("Tijucas do Sul", "tijucas do sul")];
    expect(closestPlace(places, "curitiva")).toEqual({ name: "curitiba", title: "Curitiba" });
    expect(closestPlace(places, "tijuca")).toEqual({ name: "tijucas", title: "Tijucas" });
    expect(closestPlace(places, "curitiba")).toBeNull();
    expect(closestPlace(places, "abc")).toBeNull();
    expect(closestPlace([place("Ita", "itaa"), place("Itb", "itab")], "itac")).toBeNull();
  });
});

describe("assistente: configuração, formulário e publicação", () => {
  test("the validator is strict (ids, texts without markup, WhatsApp with the country code) and belongs to a region", () => {
    expect(validateAssistant(config, "sul").ok).toBe(true);
    expect(validateAssistant({ enabled: true, answers: [] }, "sul").ok).toBe(true);
    expect(validateAssistant(config, "global").ok).toBe(false);
    expect(validateAssistant({ ...config, whatsapp: "48988082581" }, "sul").ok).toBe(false);
    expect(validateAssistant({ ...config, answers: [{ ...tecido, answer: "<b>oi</b>" }] }, "sul").ok).toBe(false);
    expect(validateAssistant({ ...config, answers: [tecido, { ...prazo, id: "tecido" }] }, "sul").ok).toBe(false);
    expect(validateAssistant({ ...config, answers: [{ ...tecido, answer: "Linha 1\nLinha 2" }] }, "sul").ok).toBe(true);
  });

  test("the form rebuilds every row: ids from the question, the list's order, the phone as digits, readable errors", () => {
    const row = (p: Partial<AssistantRow>): AssistantRow => ({ id: "", enabled: true, question: "Qual o prazo?", answer: "De 2 a 5 dias úteis.", keywords: "", action: "", ...p });
    const r = assistantFromForm([row({ action: "orders" }), row({ question: "Qual o prazo?", answer: "  Linha 1  \r\n\r\n\r\n Linha 2 " })], { enabled: true, whatsapp: "(48) 98808-2581", greeting: "" }, "sul");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.whatsapp).toBe("5548988082581");
    expect(r.value.answers.map((a) => [a.id, a.order, a.action])).toEqual([["qual-o-prazo", 1, "orders"], ["qual-o-prazo-2", 2, undefined]]);
    expect(r.value.answers[1].answer).toBe("Linha 1\n\nLinha 2");
    expect(r.value.greeting).toBeUndefined();
    const bad = assistantFromForm([row({ answer: "" })], { enabled: true, whatsapp: "123", greeting: "" }, "sul");
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors).toEqual(["O WhatsApp precisa ter DDD e número, como (48) 98808-2581 (ou fica vazio).", "Resposta 1: a resposta precisa ter de 1 a 900 caracteres (sem < e >)."]);
    expect(whatsappDigits("+55 48 98808-2581")).toBe("5548988082581");
    expect(readableAssistantError("doc.assistant.answers[3].question: x")).toMatch(/^Resposta 4: a pergunta/);
  });

  test("saving changes only `assistant`, the publish screen lists it, and an invalid published one is dropped (no chat), never the region", () => {
    const sul = structuredClone(seed().docs.sul);
    const r = applyOp(sul, { type: "set-assistant", assistant: config }, ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.doc.assistant).toEqual(config);
    expect(validateScopeDoc(r.doc).ok).toBe(true);
    const texts = diffDocs(sul, r.doc).filter((c) => c.kind === "assistant").map((c) => c.text);
    expect(texts[0]).toMatch(/^Assistente: ligado/);
    expect(texts).toContain('Assistente: resposta "Qual é o tecido das camisetas?" adicionada');
    const off = applyOp(r.doc, { type: "set-assistant", assistant: { ...config, enabled: false } }, ctx);
    expect(off.ok && diffDocs(r.doc, off.doc).map((c) => c.text)).toEqual(["Assistente: desligado (a INK volta a mostrar o “Ajuda?” e o WhatsApp dela)"]);
    expect(applyOp(structuredClone(seed().docs.global), { type: "set-assistant", assistant: config }, ctx).ok).toBe(false);

    const bundle = seed();
    const raw = structuredClone(bundle) as unknown as { docs: Record<string, ScopeDoc & { assistant?: unknown }> };
    raw.docs.sul.assistant = { enabled: true, answers: [{ ...tecido, answer: "<script>" }] };
    const read = sanitizeBundle(raw, bundle);
    expect(read.bundle?.docs.sul.assistant).toBeUndefined();
    expect(read.bundle?.docs.sul.home).toBeDefined();
    expect(read.diagnostics.some((d) => /assistant is invalid/.test(d))).toBe(true);
  });

  test("ASSISTANT=off is the deploy ceiling", () => {
    expect(assistantEnabled({})).toBe(true);
    expect(assistantEnabled({ ASSISTANT: "off" })).toBe(false);
    expect(assistantEnabled({ ASSISTANT: " OFF " })).toBe(false);
  });
});

describe("assistente: as perguntas que a loja já publicou na INK", () => {
  test("reads the questions and answers of the real markup (cópia reduzida de /faq e /exchanges_and_returns), once each", () => {
    const faq = parseInkFaq(fixture("faq.html"), "faq");
    const trocas = parseInkFaq(fixture("exchanges_and_returns.html"), "trocas");
    expect(faq).toHaveLength(10);
    expect(faq[0]).toEqual({ question: "Qual é o tecido das camisetas?", answer: expect.stringMatching(/^O tecido das camisetas é Algodão 30\.1 Penteado\./), page: "faq" });
    expect(trocas.map((e) => e.question)).toEqual(["Como funciona o processo de devolução e reembolso?", "Como é o processo de troca?"]);
    const merged = mergeInkFaq(faq, trocas);
    expect(merged).toHaveLength(10);
    for (const e of merged) expect(e.answer).not.toMatch(/[<>]|\s{2}|\n/);
    expect(faq[0].answer).toContain("com exceção da cinza -mescla");
    expect(merged.every((e) => validateAssistant({ enabled: true, answers: [{ id: "x", enabled: true, order: 1, question: e.question, answer: e.answer }] }, "sul").ok)).toBe(true);
    expect(parseInkFaq("<html><body>sem faq</body></html>", "faq")).toEqual([]);
  });

  test("suggests the words people use and the right button for the usual questions", () => {
    expect(suggestedFor("Como é o processo de troca?")).toEqual({ keywords: expect.stringContaining("trocar"), action: "orders" });
    expect(suggestedFor("Como eu acompanho minha entrega?").action).toBe("tracking");
    expect(suggestedFor("Vocês têm loja física?")).toEqual({ keywords: "" });
  });
});
