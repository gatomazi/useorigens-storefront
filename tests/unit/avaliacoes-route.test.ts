import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { InkReviewsPage } from "@/lib/reviews/parse";
import { readReviewsPage } from "@/lib/reviews/source";
import { GET } from "@/app/api/avaliacoes/route";

vi.mock("@/lib/reviews/source", () => ({ homeReviewsEnabled: vi.fn(() => process.env.REVIEWS_HOME !== "off"), readReviewsPage: vi.fn() }));

const page = (nextPage: number | null): InkReviewsPage => ({
  score: 4.9,
  count: 151,
  nextPage,
  photos: [],
  reviews: [{ author: "Ana P.", date: "1 de novembro de 2026", rating: 2, text: "", verified: true, photos: [] }],
});
const get = (query = "") => GET(new Request(`http://localhost/api/avaliacoes${query}`));

beforeEach(() => vi.spyOn(console, "warn").mockImplementation(() => {}));
afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("GET /api/avaliacoes", () => {
  test("a page of the list, unfiltered (a 2-star, stars-only review is in it), publicly cacheable", async () => {
    vi.mocked(readReviewsPage).mockResolvedValue(page(2));
    const res = await get("?page=1");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("public");
    expect(await res.json()).toMatchObject({ page: 1, score: 4.9, count: 151, nextPage: 2, reviews: [{ author: "Ana P.", rating: 2, text: "" }] });
    expect(readReviewsPage).toHaveBeenCalledWith(1);
  });

  test("no page means the first", async () => {
    vi.mocked(readReviewsPage).mockResolvedValue(page(2));
    await get();
    expect(readReviewsPage).toHaveBeenCalledWith(1);
  });

  test.each(["0", "-1", "abc", "1.5", "61", "1e2", "01x", ""])("page=%j is refused without asking INK", async (value) => {
    const res = await get(`?page=${value}`);
    expect(res.status).toBe(400);
    expect(readReviewsPage).not.toHaveBeenCalled();
  });

  test("nextPage is only ever the page right after this one, and never past the cap", async () => {
    vi.mocked(readReviewsPage).mockResolvedValueOnce(page(9));
    expect((await (await get("?page=1")).json()).nextPage).toBeNull();
    vi.mocked(readReviewsPage).mockResolvedValueOnce(page(61));
    expect((await (await get("?page=60")).json()).nextPage).toBeNull();
    vi.mocked(readReviewsPage).mockResolvedValueOnce(page(null));
    expect((await (await get("?page=31")).json()).nextPage).toBeNull();
  });

  test("INK failing is a 502 that nothing caches, not a throw", async () => {
    vi.mocked(readReviewsPage).mockRejectedValue(new Error("INK responded 503"));
    const res = await get("?page=2");
    expect(res.status).toBe(502);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  test("REVIEWS_HOME=off: 404, and INK is not asked", async () => {
    vi.stubEnv("REVIEWS_HOME", "off");
    const res = await get("?page=1");
    expect(res.status).toBe(404);
    expect(readReviewsPage).not.toHaveBeenCalled();
  });
});
