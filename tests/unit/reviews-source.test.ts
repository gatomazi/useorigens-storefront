import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { InkReviewsPage } from "@/lib/reviews/parse";
import { HOME_READ_TIMEOUT_MS, READ_KEY_HEADER, REVIEWS_STALE_MS, cachedReviewsPage, clearReviewsCache, homeReviews, readInkReviews, readReviewsPage } from "@/lib/reviews/source";

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

  const card = (n: number) =>
    `<div class="flex flex-col md:flex-row"><div><div class="flex flex-row gap-1">${'<span class="text-yellow-300"></span>'.repeat(5)}</div>` +
    `<p class="text-gray-900 font-semibold leading-normal text-base">Pessoa ${n}</p></div><div><p class="text-base text-gray-500 leading-6 font-normal">Texto ${n}</p></div></div>`;
  const pageOf = (people: number[], next: number | null) =>
    `<div id="store_reviews_items">${people.map(card).join("")}${next ? `<turbo-frame id="store_reviews_pagination"><input type="hidden" name="page" value=${next}></turbo-frame>` : ""}</div>`;

  test("does not mix in the next pages when the home is already full", async () => {
    const fetcher = vi.fn(async () => response(pageOf([1, 2, 3, 4, 5, 6, 7], 2)));
    const result = await readInkReviews(fetcher as unknown as typeof fetch);
    expect(result.reviews).toHaveLength(7);
    expect(result.partial).toBeUndefined();
  });

  test("asks for all the pages at once: one slow page must not hold the next ones back", async () => {
    const pending: ((r: Response) => void)[] = [];
    const fetcher = vi.fn((_url: string) => new Promise<Response>((resolve) => pending.push(resolve)));
    const reading = readInkReviews(fetcher as unknown as typeof fetch);
    await Promise.resolve();
    expect(fetcher.mock.calls.map(([url]) => /page=(\d+)/.exec(url as string)?.[1] ?? "1")).toEqual(["1", "2", "3"]); // before any answered
    const pages = [pageOf([1, 2], 2), pageOf([3, 4], 3), pageOf([5, 6], 4)];
    pending.forEach((resolve, i) => resolve(response(pages[i])));
    expect((await reading).reviews.map((r) => r.author)).toEqual(["Pessoa 1", "Pessoa 2", "Pessoa 3", "Pessoa 4", "Pessoa 5", "Pessoa 6"]);
  });

  test("the home waits longer for a page than the modal does (nobody is waiting on the home's read)", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    const fetcher = vi.fn(async () => response(pageOf([1, 2, 3], null)));
    await readInkReviews(fetcher as unknown as typeof fetch);
    expect(timeout.mock.calls.map(([ms]) => ms)).toEqual([HOME_READ_TIMEOUT_MS, HOME_READ_TIMEOUT_MS, HOME_READ_TIMEOUT_MS]);
    timeout.mockClear();
    await readReviewsPage(1, fetcher as unknown as typeof fetch); // what the modal's list asks for
    expect(timeout.mock.calls.map(([ms]) => ms)).toEqual([6000]);
    expect(HOME_READ_TIMEOUT_MS).toBeGreaterThan(6000);
  });

  test("a page the home needs that fails ends the reading there, is logged, and marks the read as partial", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetcher = vi.fn(async (url: string) => {
      const n = Number(/page=(\d+)/.exec(url)?.[1] ?? 1);
      if (n === 2) throw new DOMException("timed out", "TimeoutError");
      return response(pageOf(n === 1 ? [1, 2] : [5, 6], n + 1));
    });
    const result = await readInkReviews(fetcher as unknown as typeof fetch);
    expect(result.reviews.map((r) => r.author)).toEqual(["Pessoa 1", "Pessoa 2"]); // page 3 is not appended over the gap
    expect(result.partial).toBe(true);
    expect(warn.mock.calls.some(([line]) => String(line).includes('"event":"reviews.page-error"') && String(line).includes('"page":2'))).toBe(true);
  });

  test("a later page that fails when the home did not need it is not a partial read", async () => {
    const fetcher = vi.fn(async (url: string) => {
      const n = Number(/page=(\d+)/.exec(url)?.[1] ?? 1);
      if (n === 3) throw new Error("INK responded 500");
      return response(pageOf(n === 1 ? [1, 2, 3, 4] : [5, 6, 7], n + 1));
    });
    const result = await readInkReviews(fetcher as unknown as typeof fetch);
    expect(result.reviews).toHaveLength(7);
    expect(result.partial).toBeUndefined();
  });

  test("page 1 failing is still an error, whatever the other pages did", async () => {
    const fetcher = vi.fn(async (url: string) => (/page=/.test(url) ? response(pageOf([1, 2, 3], null)) : response("<html>Just a moment...</html>", 403)));
    await expect(readInkReviews(fetcher as unknown as typeof fetch)).rejects.toThrow(/403/);
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

  test("a partial read (a page failed: fewer cards) does not take the cards off a fuller one still in the window", async () => {
    const t0 = 5_000_000;
    await cachedReviewsPage(t0, async () => good); // four featured cards
    const thinner = { ...good, reviews: good.reviews.slice(0, 2), partial: true as const };
    expect(await cachedReviewsPage(t0 + 60_000, async () => thinner)).toEqual(good);
    // the fuller one keeps its own age: after the window it is gone and the thinner read is what there is
    expect(await cachedReviewsPage(t0 + REVIEWS_STALE_MS + 1, async () => thinner)).toEqual({ ...good, reviews: good.reviews.slice(0, 2) });
  });

  test("a partial read with nothing better to fall back on is served as it is, without its flag", async () => {
    const thinner = { ...good, reviews: good.reviews.slice(0, 2), partial: true as const };
    const served = await cachedReviewsPage(1, async () => thinner);
    expect(served?.reviews).toHaveLength(2);
    expect(served).not.toHaveProperty("partial");
  });

  test("a partial read that is not thinner (the same cards) is simply the new read", async () => {
    await cachedReviewsPage(1, async () => good);
    const same = { ...good, count: 102, partial: true as const };
    expect((await cachedReviewsPage(2, async () => same))?.count).toBe(102);
  });
});

describe("homeReviews", () => {
  test("Sul's home gets the selection", async () => {
    const selected = await homeReviews("sul", async () => good);
    expect(selected?.reviews).toHaveLength(4);
    expect(selected?.photos).toHaveLength(5);
  });

  test("every region tells the reviews of the one store they all sell from", async () => {
    const read = vi.fn(async () => good);
    for (const region of ["sul", "norte", "centro-oeste"] as const) {
      const home = await homeReviews(region, read);
      expect(home?.count).toBe(100);
      expect(home?.reviews).toHaveLength(4);
    }
  });

  test("the kill switch silences every region and INK is not asked", async () => {
    vi.stubEnv("REVIEWS_HOME", "off");
    const read = vi.fn(async () => good);
    for (const region of ["sul", "norte", "centro-oeste"] as const) expect(await homeReviews(region, read)).toBeNull();
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
