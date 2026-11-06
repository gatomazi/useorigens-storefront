import { afterEach, describe, expect, test, vi } from "vitest";
import { publishedAssistant } from "@/lib/assistant/sources";
import { GET } from "@/app/api/assistente/[region]/base/route";

vi.mock("@/lib/assistant/sources", () => ({ publishedAssistant: vi.fn() }));

const call = (region: string, token?: string) =>
  GET(new Request(`http://localhost/api/assistente/${region}/base`, { headers: token ? { authorization: `Bearer ${token}` } : {} }), { params: Promise.resolve({ region }) });

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("the Assistente base for the Instagram DM bot", () => {
  test("without the shared secret, or with the wrong one, it does not exist", async () => {
    vi.stubEnv("INSTAGRAM_HISTORY_SECRET", "");
    expect((await call("sul", "x")).status).toBe(404);
    vi.stubEnv("INSTAGRAM_HISTORY_SECRET", "segredo");
    expect((await call("sul")).status).toBe(404);
    expect((await call("sul", "errado")).status).toBe(404);
    expect((await call("lua", "segredo")).status).toBe(404);
    expect(publishedAssistant).not.toHaveBeenCalled();
  });

  test("with it: only enabled answers, in the panel's order, question and answer only", async () => {
    vi.stubEnv("INSTAGRAM_HISTORY_SECRET", "segredo");
    vi.mocked(publishedAssistant).mockReturnValue({
      enabled: false,
      whatsapp: "5548988082581",
      answers: [
        { id: "b", enabled: true, order: 2, question: "Qual é o tecido?", answer: "Algodão 30.1 penteado.", keywords: "tecido" },
        { id: "a", enabled: true, order: 1, question: "Qual o prazo?", answer: "De 2 a 5 dias úteis de produção.", action: "tracking" },
        { id: "c", enabled: false, order: 0, question: "Rascunho", answer: "não publicar" },
      ],
    });
    const res = await call("sul", "segredo");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({
      v: 1,
      region: "sul",
      whatsapp: "5548988082581",
      answers: [
        { question: "Qual o prazo?", answer: "De 2 a 5 dias úteis de produção." },
        { question: "Qual é o tecido?", answer: "Algodão 30.1 penteado." },
      ],
    });
  });

  test("nothing published yet: an empty base, not an error", async () => {
    vi.stubEnv("INSTAGRAM_HISTORY_SECRET", "segredo");
    vi.mocked(publishedAssistant).mockReturnValue(undefined);
    expect(await (await call("norte", "segredo")).json()).toEqual({ v: 1, region: "norte", whatsapp: null, answers: [] });
  });
});
