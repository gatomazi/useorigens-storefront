import { describe, expect, test } from "vitest";
import { filterConversations, filterEvents, isChannelFilter, isUserId, kindLabel, parseConversation, parseConversationList } from "@/lib/instagram/history";

const list = parseConversationList({
  retencao_dias: 10,
  bot_dm_modo: "shadow",
  conversas: [
    { usuario_id: "111", usuario: "maria", canais: ["instagram_dm"], lojas: ["Use Centro"], ultima_em: "2026-11-06T10:00:00-03:00", ultimo_texto: "tem GG?", ultimo_autor: "cliente", total: 3, handoffs: 0, sombra: 1 },
    { usuario_id: "222", canais: ["instagram_comentario"], ultima_em: "2026-11-06T09:00:00-03:00", ultimo_texto: "meu pedido não chegou", ultimo_autor: "bot", total: 2, handoffs: 1, sombra: 0, pausado_ate: "2026-11-07T09:00:00-03:00" },
    { usuario_id: "../admin", ultimo_texto: "ignorado" },
  ],
});

describe("the webhook history, as the panel reads it", () => {
  test("a list is parsed and ids that could escape a URL are dropped", () => {
    expect(list.botMode).toBe("shadow");
    expect(list.conversations.map((c) => c.userId)).toEqual(["111", "222"]);
    expect(list.conversations[1]).toMatchObject({ username: null, handoffs: 1, pausedUntil: "2026-11-07T09:00:00-03:00" });
    expect(isUserId("../admin")).toBe(false);
  });

  test("each conversation says which store account it came to (the webhook serves the three)", () => {
    expect(list.conversations[0].stores).toEqual(["Use Centro"]);
    expect(list.conversations[1].stores).toEqual([]);
    expect(parseConversation({ usuario_id: "111", lojas: ["Use Sul", 3, ""] })?.stores).toEqual(["Use Sul"]);
  });

  test("a reactivation shows as such; an unknown kind shows as it came", () => {
    expect(kindLabel("reativado")).toBe("Bot reativado");
    expect(kindLabel("novo_tipo")).toBe("novo_tipo");
  });

  test("garbage never breaks the page", () => {
    expect(parseConversationList(null)).toEqual({ retentionDays: 3, botMode: "off", conversations: [] });
    expect(parseConversation({ usuario_id: 5 })).toBeNull();
  });

  test("events keep who wrote them; an unknown author falls back to the customer", () => {
    const conv = parseConversation({
      usuario_id: "111",
      eventos: [
        { id: "a", em: "2026-11-06T10:00:00-03:00", canal: "instagram_dm", direcao: "entrada", autor: "cliente", tipo: "mensagem", usuario_id: "111", texto: "tem GG?" },
        { id: "b", em: "2026-11-06T10:00:15-03:00", canal: "instagram_dm", direcao: "saida", autor: "bot_sombra", tipo: "resposta_bot", usuario_id: "111", texto: "Temos sim!" },
        { id: "c", autor: "hacker", usuario_id: "111", texto: "x" },
      ],
    });
    expect(conv?.events.map((e) => e.author)).toEqual(["cliente", "bot_sombra", "cliente"]);
    expect(conv?.events[1]).toMatchObject({ direction: "saida", kind: "resposta_bot", text: "Temos sim!" });
  });

  test("filters: handoffs, shadow replies, paused bot and a search by @ or text", () => {
    const ids = (f: Parameters<typeof filterConversations>[1], q = "") => filterConversations(list.conversations, f, q).map((c) => c.userId);
    expect(ids("handoff")).toEqual(["222"]);
    expect(ids("sombra")).toEqual(["111"]);
    expect(ids("pausadas")).toEqual(["222"]);
    expect(ids("todas", "@MARIA")).toEqual(["111"]);
    expect(ids("todas", "pedido")).toEqual(["222"]);
  });

  test("channel filter: DMs (Instagram and Messenger) apart from comments (Instagram and Facebook)", () => {
    const ids = (c: Parameters<typeof filterConversations>[3]) => filterConversations(list.conversations, "todas", "", c).map((x) => x.userId);
    expect(ids("dm")).toEqual(["111"]);
    expect(ids("comentario")).toEqual(["222"]);
    expect(ids("todos")).toEqual(["111", "222"]);
    expect(isChannelFilter("dm")).toBe(true);
    expect(isChannelFilter("whatsapp")).toBe(false);

    const conv = parseConversation({
      usuario_id: "333",
      eventos: [
        { id: "1", canal: "instagram_comentario", usuario_id: "333", texto: "Curitiba ❤️" },
        { id: "2", canal: "instagram_dm", usuario_id: "333", texto: "link" },
        { id: "3", canal: "facebook_comentario", usuario_id: "333", texto: "Londrina" },
        { id: "4", canal: "messenger", usuario_id: "333", texto: "oi" },
      ],
    });
    expect(filterEvents(conv!.events, "dm").map((e) => e.id)).toEqual(["2", "4"]);
    expect(filterEvents(conv!.events, "comentario").map((e) => e.id)).toEqual(["1", "3"]);
  });
});
