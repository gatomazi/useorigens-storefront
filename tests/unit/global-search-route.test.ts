import { afterEach, describe, expect, test, vi } from "vitest";
import { prepareGlobalDocs, type GlobalDoc } from "@/lib/search/global";
import { buildSeedBundle } from "@/lib/site-config/seed";
import { homeBundle, siteConfigHomeEnabled } from "@/lib/site-config/flag";
import { globalSearchIndex } from "@/lib/search/global-index";
import { GET } from "@/app/api/busca/route";

vi.mock("@/lib/site-config/flag", () => ({ homeBundle: vi.fn(), siteConfigHomeEnabled: vi.fn(() => true) }));
vi.mock("@/lib/search/global-index", () => ({ globalSearchIndex: vi.fn() }));
vi.mock("@/lib/regions/launched", () => ({ isRegionLaunched: (region: string) => region === "sul" }));

afterEach(() => vi.clearAllMocks());

describe("global search HTTP freshness", () => {
  test("the same query follows each published setting and cannot be reused by a browser or CDN", async () => {
    const doc = (kind: GlobalDoc["kind"], title: string): GlobalDoc => ({
      key: kind, kind, title, region: "sul", subtitle: "", href: "/sul/sc/imbituba", tag: kind, rank: 0,
      names: [title], strong: [], weak: [],
    });
    const byRegion = new Map([["sul" as const, prepareGlobalDocs([doc("locality", "Imbituba"), doc("design", "Imbituba · Ponto de Origem")])]]);
    vi.mocked(globalSearchIndex).mockReturnValue({ byRegion } as ReturnType<typeof globalSearchIndex>);
    vi.mocked(siteConfigHomeEnabled).mockReturnValue(true);
    const bundle = buildSeedBundle();
    vi.mocked(homeBundle).mockReturnValue(bundle);

    for (const designs of [true, false, true]) {
      if (designs) delete bundle.docs.global.search;
      else bundle.docs.global.search = { designs: false };
      const response = await GET(new Request("http://localhost/api/busca?region=sul&q=imbitu"));
      expect(response.status).toBe(200);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      const body = await response.json();
      expect(body.groups.map((g: { group: string }) => g.group)).toEqual(designs ? ["places", "designs"] : ["places"]);
      expect(body.total).toBe(designs ? 2 : 1);
    }
  });
});
