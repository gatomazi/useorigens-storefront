import { afterEach, describe, expect, test, vi } from "vitest";
import { fetchResults } from "@/lib/search/fetch-results";
import type { GlobalSearchResponse } from "@/lib/search/global";

afterEach(() => vi.unstubAllGlobals());

describe("global search client freshness", () => {
  test("repeating a query reads the new published answer instead of retaining the previous results", async () => {
    const on: GlobalSearchResponse = {
      query: "imbitu", region: "sul", total: 1, others: [],
      groups: [{ group: "designs", total: 1, items: [{ key: "imbituba", kind: "design", region: "sul", title: "Imbituba · Ponto de Origem", subtitle: "", href: "/sul/sc/imbituba/ponto-de-origem", tag: "Estampa" }] }],
    };
    const off: GlobalSearchResponse = { query: "imbitu", region: "sul", total: 0, groups: [], others: [] };
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);

    for (const answer of [on, off, on]) {
      fetch.mockResolvedValueOnce(Response.json(answer));
      const signal = new AbortController().signal;
      expect(await fetchResults("sul", "imbitu", signal)).toEqual(answer);
      expect(fetch).toHaveBeenLastCalledWith("/api/busca?region=sul&q=imbitu", { signal, cache: "no-store" });
    }
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  test("failed and aborted requests can be retried with the same query", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockRejectedValueOnce(new DOMException("Aborted", "AbortError"))
      .mockResolvedValueOnce(Response.json({ query: "imbitu", region: "sul", total: 0, groups: [], others: [] }));
    vi.stubGlobal("fetch", fetch);
    await expect(fetchResults("sul", "imbitu", new AbortController().signal)).rejects.toThrow("search 503");
    const controller = new AbortController();
    controller.abort();
    await expect(fetchResults("sul", "imbitu", controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    await expect(fetchResults("sul", "imbitu", new AbortController().signal)).resolves.toMatchObject({ total: 0 });
    expect(fetch).toHaveBeenCalledTimes(3);
  });
});
