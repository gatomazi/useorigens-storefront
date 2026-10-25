import { describe, expect, test } from "vitest";
import { replyTo, type AssistantReply } from "@/lib/assistant/engine";
import { maskQuestion, memoryQuestionStore, questionKey, questionReport, questionRow } from "@/lib/assistant/questions";
import type { AssistantAnswer } from "@/lib/site-config/assistant-schema";

const prazo: AssistantAnswer = { id: "prazo", enabled: true, order: 1, question: "Qual o prazo de entrega?", answer: "A produção leva de 2 a 5 dias úteis.", keywords: "prazo" };
const tecido: AssistantAnswer = { id: "tecido", enabled: true, order: 2, question: "Qual é o tecido?", answer: "Algodão 30.1 penteado." };
const answers = [prazo, tecido];
const reply = (kind: AssistantReply["kind"], text = "…", items = 0): AssistantReply => ({ v: 1, kind, text, items: Array.from({ length: items }, (_, i) => ({ title: `E${i}`, image: "https://x/y.webp", href: "https://x" })) });
const T0 = Date.parse("2026-10-25T12:00:00Z");

describe("what is kept of a question", () => {
  test("e-mails and runs of 6 digits or more are masked; short numbers stay", () => {
    expect(maskQuestion("meu email é ana.souza@gmail.com, fone (48) 98808-2581")).toBe("meu email é [e-mail], fone [número]");
    expect(maskQuestion("pedido 123456 para o CEP 88015-200")).toBe("pedido [número] para o CEP [número]");
    expect(maskQuestion("tem tamanho 12 ou 2 anos?")).toBe("tem tamanho 12 ou 2 anos?");
    expect(maskQuestion("  tem   de\nFloripa?  ")).toBe("tem de Floripa?");
  });

  test("one key for the same question written differently", () => {
    expect(questionKey("Tem de Floripa?")).toBe(questionKey("tem de floripa"));
    expect(questionKey("Tem estampa de Floripá?")).toBe(questionKey("tem de floripa!"));
    expect(questionKey("oi")).toBe("oi");
    expect(questionKey("[número]")).toBe("numero");
  });

  test("a refused message keeps only its kind, never its text", () => {
    const row = questionRow({ region: "sul", surface: "site", message: "meu cpf é 123.456.789-00", reply: reply("refuse"), answers, at: T0 });
    expect(row).toMatchObject({ question: null, questionKey: "", kind: "refuse" });
  });

  test("a password after small talk is refused by the engine too", () => {
    const sources = { findDesigns: () => null, ordersUrl: "https://x/orders", trackingUrl: "https://x/orders/trackings", whatsapp: null };
    expect(replyTo("tchau, minha senha é gato", answers, sources, "Oi!").kind).toBe("refuse");
  });

  test("a password or a CPF is never kept, even when the reply was small talk", () => {
    for (const message of ["tchau, minha senha é gato", "valeu meu cpf 123.456.789-00"]) {
      expect(questionRow({ region: "sul", surface: "site", message, reply: reply("chat"), answers, at: T0 })).toMatchObject({ question: null, questionKey: "", kind: "chat" });
    }
  });

  test("the base answer it used is found by its text; designs keep how many cards", () => {
    expect(questionRow({ region: "sul", surface: "ink", message: "quanto demora?", reply: reply("answer", prazo.answer), answers, at: T0 })).toMatchObject({ surface: "ink", answerId: "prazo", resultCount: 0 });
    expect(questionRow({ region: "sul", surface: "site", message: "tem de Floripa?", reply: reply("designs", "Estampas de Florianópolis:", 3), answers, at: T0 })).toMatchObject({ answerId: null, resultCount: 3, question: "tem de Floripa?" });
  });
});

describe("the panel's report", () => {
  test("groups the same question, lists the unanswered first and counts the use of each answer", async () => {
    const store = memoryQuestionStore();
    const ask = (message: string, r: AssistantReply, surface: "site" | "ink" = "site", at = T0) => store.record(questionRow({ region: "sul", surface, message, reply: r, answers, at }));
    await ask("tem de Gaspar?", reply("not-found"), "ink", T0);
    await ask("Tem de gaspar", reply("not-found"), "site", T0 + 1000);
    await ask("vocês fazem caneca personalizada?", reply("fallback"));
    await ask("quanto demora?", reply("answer", prazo.answer));
    await ask("oi", reply("greeting"));
    await ask("cpf 123.456.789-00", reply("refuse"));
    await store.record(questionRow({ region: "norte", surface: "site", message: "tem de Belém?", reply: reply("not-found"), answers, at: T0 }));

    const report = questionReport(await store.totals("sul", T0 - 1), await store.groups("sul", T0 - 1, 100), answers);
    expect(report.total).toBe(6);
    expect(report.bySurface).toEqual({ site: 5, ink: 1 });
    expect(report.unanswered.map((l) => [l.sample, l.count])).toEqual([["Tem de gaspar", 2], ["vocês fazem caneca personalizada?", 1]]);
    expect(report.top.map((l) => l.sample)).not.toContain("oi");
    expect(report.top.find((l) => l.answerIds.includes("prazo"))?.count).toBe(1);
    expect(report.answers).toEqual([{ id: "prazo", question: prazo.question, count: 1 }, { id: "tecido", question: tecido.question, count: 0 }]);
  });

  test("the totals stay exact when there are more distinct questions than the panel lists", async () => {
    const store = memoryQuestionStore();
    for (let i = 0; i < 30; i++) await store.record(questionRow({ region: "sul", surface: i % 3 === 0 ? "ink" : "site", message: `tem de cidade${i}?`, reply: reply(i % 2 ? "designs" : "not-found"), answers, at: T0 + i }));
    await store.record(questionRow({ region: "sul", surface: "site", message: "oi", reply: reply("greeting"), answers, at: T0 }));
    const groups = await store.groups("sul", T0 - 1, 5);
    expect(groups).toHaveLength(5);
    expect(groups.some((g) => g.kind === "greeting")).toBe(false);
    const report = questionReport(await store.totals("sul", T0 - 1), groups, answers);
    expect(report.total).toBe(31);
    expect(report.bySurface).toEqual({ site: 21, ink: 10 });
    expect(report.byKind).toMatchObject({ designs: 15, "not-found": 15, greeting: 1 });
  });

  test("the period and the retention cut what is old", async () => {
    const store = memoryQuestionStore();
    await store.record(questionRow({ region: "sul", surface: "site", message: "tem de Gaspar?", reply: reply("not-found"), answers, at: T0 - 100 * 86_400_000 }));
    await store.record(questionRow({ region: "sul", surface: "site", message: "tem de Ilhota?", reply: reply("not-found"), answers, at: T0 }));
    expect((await store.groups("sul", T0 - 30 * 86_400_000, 100)).map((g) => g.sample)).toEqual(["tem de Ilhota?"]);
    expect(await store.purgeBefore(T0 - 90 * 86_400_000)).toBe(1);
    expect(await store.groups("sul", 0, 100)).toHaveLength(1);
  });
});
