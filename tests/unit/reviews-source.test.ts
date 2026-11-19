import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { InkReviewsPage } from "@/lib/reviews/parse";
import { READ_KEY_HEADER, REVIEWS_STALE_MS, cachedReviewsPage, clearReviewsCache, homeReviews, readInkReviews } from "@/lib/reviews/source";

const fixture = readFileSync(join(__dirname, "../fixtures/ink-reviews/reviews-page.html"), "utf8");

const THUMB = "https://gcp-mimis-blend.ink.rsvcloud.com//v1/transform/w=320,fmt=webp";
const photos = Array.from({ length: 5 }, (_, i) => ({ thumb: `${THUMB}/S${i}/x`, full: null }));
const reviews = Array.from({ length: 4 }, (_, i) => ({ author: `Cliente ${i}`, date: "1 de novembro de 2026", rating: 5, text: `Texto ${i}`, verified: true, photos: [] }));
const good: InkReviewsPage = { score: 5, count: 100, reviews, photos, nextPage: null };

beforeEach(() => {
  clearReviewsCache();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

const response = (body: string, status = 200) => new Response(body, { status, headers: { "content-type": "text/html" } });

/** The fixture's cards are a "page 1 with a next page"; page N is the same cards under other authors, so a merge has something new to add. */
const pageN = (n: number) => fixture.replace(/(?<=font-semibold leading-normal text-base">)([^<]+)</g, `$1 (p${n})<`).replace(/value=2>/, `value=${n + 1}>`);

describe("readInkReviews", () => {
  test("asks INK's public reviews page, sorted by recents, with Next's data cache lifetime", async () => {
    const fetcher = vi.fn(async () => response(fixture.replace('<input type="hidden" name="page" value=2>', "")));
    await readInkReviews(fetcher as unknown as typeof fetch);
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit & { next?: { revalidate?: number } }];
    expect(url).toMatch(/\/reviews\?sort=recents$/);
    expect(init.next?.revalidate).toBe(30 * 60);
    expect(init.cache).toBeUndefined(); // never no-store: it would make the ISR home dynamic
  });

  test("a non-200 (a Cloudflare 503, a challenge) throws instead of reading as 'no reviews'", async () => {
    const fetcher = vi.fn(async () => response("<html>Just a moment...</html>", 503));
    await expect(readInkReviews(fetcher as unknown as typeof fetch)).rejects.toThrow(/503/);
  });

  test("sends the read key header when REVIEWS_READ_KEY is set, and none when it is not", async () => {
    const page = fixture.replace('<input type="hidden" name="page" value=2>', "");
    const headersOf = async () => {
      const fetcher = vi.fn(async () => response(page));
      await readInkReviews(fetcher as unknown as typeof fetch);
      return (fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].headers as Record<string, string>;
    };
    vi.stubEnv("REVIEWS_READ_KEY", "");
    expect(await headersOf()).not.toHaveProperty(READ_KEY_HEADER);
    vi.stubEnv("REVIEWS_READ_KEY", "  segredo-de-teste \n");
    const withKey = await headersOf();
    expect(withKey[READ_KEY_HEADER]).toBe("segredo-de-teste"); // trimmed: a pasted newline would make Cloudflare's comparison fail
    expect(withKey["user-agent"]).toMatch(/^UseOrigensStorefront\//);
  });

  test("a Cloudflare challenge is named in the error (the production log's reason)", async () => {
    const fetcher = vi.fn(async () => new Response("", { status: 403, headers: { "cf-mitigated": "challenge" } }));
    await expect(readInkReviews(fetcher as unknown as typeof fetch)).rejects.toThrow("INK responded 403 (Cloudflare challenge)");
    const plain = vi.fn(async () => response("", 403));
    await expect(readInkReviews(plain as unknown as typeof fetch)).rejects.toThrow(/^INK responded 403$/);
  });

  test("a 200 that is not the reviews page throws", async () => {
    const fetcher = vi.fn(async () => response("<html><body>Manutenção</body></html>"));
    await expect(readInkReviews(fetcher as unknown as typeof fetch)).rejects.toThrow(/unexpected/);
  });

  test("reads the next pages while the home lacks cards, and stops at three", async () => {
    const asked: string[] = [];
    const fetcher = vi.fn(async (url: string) => {
      asked.push(url);
      const n = Number(/page=(\d+)/.exec(url)?.[1] ?? 1);
      return response(pageN(n));
    });
    const result = await readInkReviews(fetcher as unknown as typeof fetch);
    expect(asked.map((u) => /page=(\d+)/.exec(u)?.[1] ?? "1")).toEqual(["1", "2", "3"]);
    expect(result.reviews.map((r) => r.author)).toContain("Ana Paula M. (p3)");
    expect(result.reviews).toHaveLength(12); // four reviews a page, none repeated
  });

  test("a later page that fails ends the reading with what it has", async () => {
    const fetcher = vi.fn(async (url: string) => (url.includes("page=2") ? response("", 500) : response(pageN(1))));
    const result = await readInkReviews(fetcher as unknown as typeof fetch);
    expect(result.reviews).toHaveLength(4);
  });

  test("a review that shifted onto the next page (one was posted meanwhile) is not counted twice", async () => {
    const fetcher = vi.fn(async (url: string) => response(url.includes("page=") ? fixture.replace("value=2>", "value=3>") : fixture));
    const result = await readInkReviews(fetcher as unknown as typeof fetch);
    expect(result.reviews).toHaveLength(4); // the same four cards, asked three times
  });

  test("stops when the home is already full, even with a next page on offer", async () => {
    const card = (n: number) =>
      `<div class="flex flex-col md:flex-row"><div><div class="flex flex-row gap-1">${'<span class="text-yellow-300"></span>'.repeat(5)}</div>` +
      `<p class="text-gray-900 font-semibold leading-normal text-base">Pessoa ${n}</p></div><div><p class="text-base text-gray-500 leading-6 font-normal">Texto ${n}</p></div></div>`;
    const full = `<div id="store_reviews_items">${[1, 2, 3, 4, 5, 6, 7].map(card).join("")}<turbo-frame id="store_reviews_pagination"><input type="hidden" name="page" value=2></turbo-frame></div>`;
    const fetcher = vi.fn(async () => response(full));
    const result = await readInkReviews(fetcher as unknown as typeof fetch);
    expect(result.reviews).toHaveLength(7);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

describe("cachedReviewsPage", () => {
  test("serves the last good page while INK fails, until REVIEWS_STALE_MS", async () => {
    const t0 = 1_000_000;
    await cachedReviewsPage(t0, async () => good);
    const failing = async () => {
      throw new Error("INK responded 503");
    };
    expect(await cachedReviewsPage(t0 + REVIEWS_STALE_MS - 1, failing)).toEqual(good);
    expect(await cachedReviewsPage(t0 + REVIEWS_STALE_MS + 1, failing)).toBeNull();
  });

  test("nothing yet and INK failing: null, never a throw", async () => {
    expect(await cachedReviewsPage(0, async () => Promise.reject(new Error("boom")))).toBeNull();
  });

  test("a good read replaces the old one", async () => {
    await cachedReviewsPage(1, async () => good);
    const newer = { ...good, count: 101 };
    await cachedReviewsPage(2, async () => newer);
    expect(await cachedReviewsPage(3, async () => Promise.reject(new Error("x")))).toEqual(newer);
  });
});

describe("homeReviews", () => {
  test("Sul's home gets the selection", async () => {
    const selected = await homeReviews("sul", async () => good);
    expect(selected?.reviews).toHaveLength(4);
    expect(selected?.photos).toHaveLength(5);
  });

  test("a region whose prints are not what these reviews talk about gets nothing, and INK is not asked", async () => {
    const read = vi.fn(async () => good);
    expect(await homeReviews("norte", read)).toBeNull();
    expect(await homeReviews("centro-oeste", read)).toBeNull();
    expect(read).not.toHaveBeenCalled();
  });

  test("REVIEWS_HOME=off is the kill switch; anything else leaves it on", async () => {
    vi.stubEnv("REVIEWS_HOME", "off");
    const read = vi.fn(async () => good);
    expect(await homeReviews("sul", read)).toBeNull();
    expect(read).not.toHaveBeenCalled();
    vi.stubEnv("REVIEWS_HOME", "on");
    expect(await homeReviews("sul", read)).not.toBeNull();
  });

  test("INK unreadable and nothing remembered: the block is simply absent", async () => {
    expect(await homeReviews("sul", async () => Promise.reject(new Error("down")))).toBeNull();
  });
});
