import { describe, expect, test, vi } from "vitest";
import { buildStoreIndex } from "@/lib/catalog/indexer";
import { product } from "./fixtures";

vi.mock("@/lib/catalog/unificado/leitura", () => ({
  lerColecoes: async (_store: string, quer: (name: string) => boolean) => ({
    todas: [],
    paginas: [],
    membros: [
      { id: 1, name: "ZZ - SU", productIds: ["10"] },
      { id: 2, name: "ZZ - NO", productIds: ["20"] },
      { id: 3, name: "ZZ - CO", productIds: ["30"] },
      { id: 4, name: "Fala Daqui", productIds: ["20", "30"] },
    ].filter((m) => quer(m.name)),
  }),
}));

// Since 15/10/2026 use-sul also holds Norte and Centro-Oeste merchandise (the single store). In the regional catalog it must not show as Sul's.
describe("merchandise of another region in a regional store", () => {
  test("given the store's segmentation collections, then only ZZ - SU / ZZ - NO / ZZ - CO are read, as product → region", async () => {
    const { segmentationOf } = await import("@/lib/catalog/sync-service");
    expect([...(await segmentationOf("use-sul"))]).toEqual([["10", "sul"], ["20", "norte"], ["30", "centro-oeste"]]);
  });

  test("given Norte and Centro-Oeste merchandise in use-sul, then it is excluded as other-region; Sul's and unfiled merchandise stays", () => {
    const foreign = new Map([["10", "sul"], ["20", "norte"], ["30", "centro-oeste"]] as const);
    const index = buildStoreIndex("use-sul", [product("Made in Paraná", { id: "10" }), product("Made In Goiás", { id: "30" }), product("Égua não mana", { id: "20" }), product("Mas Bah!", { id: "40" })], "t", undefined, foreign);
    expect(index.merch.map((m) => m.inkProductId)).toEqual(["10", "40"]);
    expect(index.excluded.map((e) => [e.inkProductId, e.reason, e.detail])).toEqual([["30", "other-region", "centro-oeste"], ["20", "other-region", "norte"]]);
  });
});
