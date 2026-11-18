import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { reviewKey } from "@/lib/reviews/key";
import { FEATURED_MIN_RATING, HOME_PHOTOS_MAX, HOME_REVIEWS_MAX, MIN_CARDS, MIN_PHOTOS, isFeatured, parseInkReviews, selectHomeReviews, type InkReview, type InkReviewsPage } from "@/lib/reviews/parse";

const fixture = readFileSync(join(__dirname, "../fixtures/ink-reviews/reviews-page.html"), "utf8");

const THUMB = "https://gcp-mimis-blend.ink.rsvcloud.com//v1/transform/w=320,fmt=webp";
const original = (n: number) => `https://gcp-images.majestic.ink.rsvcloud.com/images/review_image/${String(n).padStart(32, "a")}.jpg`;
const thumbOf = (n: number) => `${THUMB}/SIG${n}/${Buffer.from(original(n)).toString("base64url")}`;

describe("parseInkReviews: the summary", () => {
  test("score and total, as INK writes them (a dot decimal, a dot thousands separator)", () => {
    const page = parseInkReviews(fixture);
    expect(page.score).toBe(4.9);
    expect(page.count).toBe(1151);
  });

  test("a page without the summary has none of it", () => {
    const page = parseInkReviews("<html><body><div id='store_reviews_items'></div></body></html>");
    expect(page.score).toBeNull();
    expect(page.count).toBeNull();
  });

  test("a score outside 0–5 is not taken", () => {
    expect(parseInkReviews('<div id="rating"><p class="text-4xl"> 50 </p></div>').score).toBeNull();
  });
});

describe("parseInkReviews: the cards", () => {
  const { reviews } = parseInkReviews(fixture);

  test("reads each card's rating from its stars, never a default", () => {
    expect(reviews.map((r) => [r.author, r.rating])).toEqual([
      ["Ana Paula M.", 5],
      ["Marta P.", 2],
      ["Carlos E.", 5],
      ["Beatriz S.", 4],
    ]);
  });

  test("a review of stars only is still a review (the full list shows it), with empty text", () => {
    const carlos = reviews.find((r) => r.author === "Carlos E.");
    expect(carlos).toMatchObject({ rating: 5, text: "" });
    expect(isFeatured(carlos!)).toBe(false);
  });

  test("two stars-only reviews of one person on one day are two reviews (no de-duplication inside a page)", () => {
    const card = fixture.slice(fixture.indexOf("<!-- 3."), fixture.indexOf("<!-- 4."));
    expect(parseInkReviews(fixture.replace(card, card + card)).reviews.filter((r) => r.author === "Carlos E.")).toHaveLength(2);
  });

  test("a card whose stars cannot be counted (four spans) is dropped, not read as 5", () => {
    expect(reviews.find((r) => r.author === "Sem Nota R.")).toBeUndefined();
  });

  test("text: entities decoded, source line breaks and <br> are plain spaces", () => {
    expect(reviews[0].text).toBe("Ótima qualidade & caimento. Gostei d'a estampa! Chegou antes do prazo.");
    expect(reviews[3].text).toBe("Tecido bom. Só demorou um pouco.");
  });

  test("date: month lower-cased, leading zero dropped", () => {
    expect(reviews.map((r) => r.date)).toEqual(["17 de novembro de 2026", "3 de setembro de 2026", "1 de setembro de 2026", "28 de agosto de 2026"]);
  });

  test("'Compra verificada' is read per card", () => {
    expect(reviews.map((r) => r.verified)).toEqual([true, true, false, false]);
  });

  test("each review carries the photos sent with it, on INK's own host only", () => {
    expect(reviews.map((r) => r.photos.length)).toEqual([0, 1, 0, 0]);
    expect(reviews[1].photos[0].thumb).toContain("SIGNATURE-A2");
    expect(reviews[1].photos[0].full).toBe("https://gcp-images.majestic.ink.rsvcloud.com/images/review_image/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa2.jpeg");
  });

  test("an overlong text is cut with an ellipsis", () => {
    const long = "palavra ".repeat(200).trim();
    const html = fixture.replace("Tecido bom.<br>Só demorou um pouco.", long);
    const text = parseInkReviews(html).reviews[3].text;
    expect(text.length).toBeLessThanOrEqual(700);
    expect(text.endsWith("…")).toBe(true);
  });

  test("markup it does not recognise gives nothing, not a throw", () => {
    expect(parseInkReviews("").reviews).toEqual([]);
    expect(parseInkReviews("<html><body>Just a moment...</body></html>")).toEqual({ score: null, count: null, reviews: [], photos: [], nextPage: null });
  });
});

describe("parseInkReviews: the photos", () => {
  const { photos } = parseInkReviews(fixture);

  test("each photo once (INK repeats them; one is also inside a card), in page order", () => {
    expect(photos).toHaveLength(4);
    expect(photos.map((p) => p.thumb.match(/SIGNATURE-(A\d)/)?.[1])).toEqual(["A1", "A2", "A3", "A4"]);
  });

  test("the original is the base64 address in the thumbnail's last segment, only on INK's image host", () => {
    expect(photos[0].full).toBe("https://gcp-images.majestic.ink.rsvcloud.com/images/review_image/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1.jpg");
    expect(photos[1].full).toBe("https://gcp-images.majestic.ink.rsvcloud.com/images/review_image/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa2.jpeg");
  });

  test("an original that cannot be read, or sits on another host, is null; the thumbnail stays", () => {
    expect(photos[2].full).toBeNull();
    expect(photos[3].full).toBeNull();
  });

  test("a picture on another host, and an image that is not a review photo, are never taken", () => {
    expect(photos.some((p) => p.thumb.includes("evil.example"))).toBe(false);
    expect(photos.some((p) => p.thumb.includes("SIGNATURE-LOGO"))).toBe(false);
  });

  test("only https on INK's thumbnail host", () => {
    const html = `<img src="http://gcp-mimis-blend.ink.rsvcloud.com//v1/x/y" alt="Foto enviada na avaliação"><img src="https://gcp-mimis-blend.ink.rsvcloud.com.evil.example/x" alt="Foto enviada na avaliação">`;
    expect(parseInkReviews(html).photos).toEqual([]);
  });
});

describe("parseInkReviews: pagination", () => {
  test("the page INK's 'Ver mais' asks for (an unquoted value, as INK writes it)", () => {
    expect(parseInkReviews(fixture).nextPage).toBe(2);
  });

  test("null on the last page", () => {
    expect(parseInkReviews(fixture.replace('<input type="hidden" name="page" value=2>', "")).nextPage).toBeNull();
  });
});

const review = (n: number, rating = 5, text = `Texto ${n}`): InkReview => ({ author: `Cliente ${n}`, date: "1 de novembro de 2026", rating, text, verified: true, photos: [] });
const photo = (n: number) => ({ thumb: thumbOf(n), full: original(n) });
const page = (reviews: InkReview[], photos = Array.from({ length: 5 }, (_, i) => photo(i))): InkReviewsPage => ({ score: 5, count: 100, reviews, photos, nextPage: null });

describe("selectHomeReviews", () => {
  test("features only what has FEATURED_MIN_RATING stars, in page order, up to HOME_REVIEWS_MAX", () => {
    const reviews = [review(1, 2), ...Array.from({ length: 10 }, (_, i) => review(i + 2, i % 2 === 0 ? 5 : FEATURED_MIN_RATING))];
    const selected = selectHomeReviews(page(reviews));
    expect(selected?.reviews).toHaveLength(HOME_REVIEWS_MAX);
    expect(selected?.reviews.every((r) => r.rating >= FEATURED_MIN_RATING)).toBe(true);
    expect(selected?.reviews[0].author).toBe("Cliente 2");
  });

  test("a review of stars only is never a card, whatever its rating", () => {
    const reviews = [review(1, 5, ""), review(2, 5, ""), ...Array.from({ length: MIN_CARDS }, (_, i) => review(i + 3))];
    const selected = selectHomeReviews(page(reviews));
    expect(selected?.reviews).toHaveLength(MIN_CARDS);
    expect(selected?.reviews.every((r) => r.text !== "")).toBe(true);
  });

  test("the summary stays the store's whole truth, however the cards are chosen", () => {
    const selected = selectHomeReviews(page([review(1, 1), review(2), review(3), review(4)]));
    expect(selected).toMatchObject({ score: 5, count: 100 });
  });

  test("fewer than MIN_CARDS featured cards: no cards block, the photos can still stand", () => {
    const selected = selectHomeReviews(page(Array.from({ length: MIN_CARDS - 1 }, (_, i) => review(i))));
    expect(selected?.reviews).toEqual([]);
    expect(selected?.photos).toHaveLength(5);
  });

  test("fewer than MIN_PHOTOS photos: no strip, the cards can still stand", () => {
    const selected = selectHomeReviews(page(Array.from({ length: 4 }, (_, i) => review(i)), Array.from({ length: MIN_PHOTOS - 1 }, (_, i) => photo(i))));
    expect(selected?.photos).toEqual([]);
    expect(selected?.reviews).toHaveLength(4);
  });

  test("too little of both: nothing", () => {
    expect(selectHomeReviews(page([review(1)], [photo(1)]))).toBeNull();
  });

  test("at most HOME_PHOTOS_MAX photos", () => {
    const selected = selectHomeReviews(page([], Array.from({ length: HOME_PHOTOS_MAX + 20 }, (_, i) => photo(i))));
    expect(selected?.photos).toHaveLength(HOME_PHOTOS_MAX);
  });
});

describe("reviewKey", () => {
  const base = { author: "Ana P.", date: "1 de novembro de 2026", text: "", photos: [] as InkReview["photos"] };
  const photo = (n: number) => ({ thumb: thumbOf(n), full: original(n) });

  test("the same review is the same key", () => {
    expect(reviewKey({ ...base })).toBe(reviewKey({ ...base, author: "ana p." }));
  });

  test("two stars-only reviews of one person on one day with different photos are two keys", () => {
    expect(reviewKey({ ...base, photos: [photo(1)] })).not.toBe(reviewKey({ ...base, photos: [photo(2)] }));
  });

  test("a different text is a different key", () => {
    expect(reviewKey({ ...base, text: "Gostei" })).not.toBe(reviewKey({ ...base, text: "Adorei" }));
  });
});
