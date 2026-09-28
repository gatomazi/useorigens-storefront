import { expect, test } from "./fixtures";
import { citiesWithPeruano, cityWithoutPieces, oracleAvailable, type ExpectedPiece } from "./garment-oracle";

/**
 * The city page's garment-type selector, against the REAL local catalog (snapshot + garment index) with the
 * expectations derived independently by `garment-oracle.ts`. Sul only here (the only launched region in this
 * project's default e2e config); Norte and Centro-Oeste run in `playwright.regions.config.ts`.
 * Tijucas/SC is the original pilot city; the full-coverage round also checks a city outside the pilot.
 */
test.skip(!oracleAvailable, "local catalog snapshot + garment index not present");

const TIJUCAS = "4218004";
const cityPath = (c: { uf: string; slug: string }) => `/sul/${c.uf.toLowerCase()}/${c.slug}`;
const peruano = (pieces: ExpectedPiece[]) => pieces.filter((p) => p.typeSlug === "peruano");

const [pilot] = citiesWithPeruano("sul", 1).filter(({ city }) => city.id === TIJUCAS);
const [outside] = citiesWithPeruano("sul", 4, [TIJUCAS]);

for (const [label, subject] of [
  ["pilot city (Tijucas/SC)", pilot],
  ["a city outside the pilot", outside],
] as const) {
  test.describe(`city page: garment-type tabs — ${label}`, () => {
    test.skip(!subject, "no such city in the local data");

    test("given the page loads, when rendered, then the classic tab is selected and its cards link straight to INK", async ({ page }) => {
      await page.goto(cityPath(subject.city));
      await expect(page.getByRole("tablist", { name: "Tipo de peça" })).toBeVisible();
      await expect(page.getByRole("tab", { name: /Camiseta clássica/ })).toHaveAttribute("aria-selected", "true");
      await expect(page.getByRole("link", { name: /^Comprar .* de .* na loja$/ }).first()).toHaveAttribute("href", /^https:\/\/www\.usesul\.com\.br\//);
    });

    test("given the Algodão Peruano tab, when clicked, then each card is that family's exact piece (real href and price) and no family gets a made-up card", async ({ page }) => {
      const expected = peruano(subject.pieces);
      await page.goto(cityPath(subject.city));
      await page.getByRole("tab", { name: /Algodão Peruano/ }).click();
      await expect(page).toHaveURL(/\?peca=peruano$/);

      const panel = page.getByRole("tabpanel", { name: /Algodão Peruano/ });
      await expect(panel.getByRole("link")).toHaveCount(expected.length);
      for (const piece of expected) {
        const card = panel.getByRole("link", { name: `Comprar ${piece.familyName} Algodão Peruano de ${subject.city.name} na loja` });
        await expect(card).toHaveAttribute("href", piece.href);
        await expect(card).toContainText(piece.priceText);
      }
    });

    test("given a tab was picked, when the same URL is opened fresh, then the choice is restored (?peca= is shareable)", async ({ page }) => {
      await page.goto(`${cityPath(subject.city)}?peca=peruano`);
      await expect(page.getByRole("tab", { name: /Algodão Peruano/ })).toHaveAttribute("aria-selected", "true");
    });

    test("given a phone viewport, when the tabs render, then they scroll horizontally without the page overflowing", async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 800 });
      await page.goto(cityPath(subject.city));
      await expect(page.getByRole("tablist", { name: "Tipo de peça" })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
      await page.getByRole("tab", { name: /Regata/ }).click();
      await expect(page).toHaveURL(/\?peca=regata$/);
    });

    test("given the keyboard, when the arrow key moves focus across tabs, then the panel switches without a mouse", async ({ page }) => {
      await page.goto(cityPath(subject.city));
      await page.getByRole("tab", { name: /Camiseta clássica/ }).focus();
      await page.keyboard.press("ArrowRight");
      await expect(page.getByRole("tab", { name: /Algodão Peruano/ })).toHaveAttribute("aria-selected", "true");
    });

    test("given a piece card, when clicked, then the browser goes straight to that exact INK product (no modal, no storefront PDP in between)", async ({ page }) => {
      const [piece] = peruano(subject.pieces);
      const visited: string[] = [];
      await page.route("https://www.usesul.com.br/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<title>INK stub</title>" }));
      page.on("framenavigated", (frame) => {
        if (frame === page.mainFrame()) visited.push(frame.url());
      });
      await page.goto(`${cityPath(subject.city)}?peca=peruano`);
      await page.getByRole("link", { name: `Comprar ${piece.familyName} Algodão Peruano de ${subject.city.name} na loja` }).click();
      await page.waitForURL(piece.href);
      expect(visited.at(-1)).toBe(piece.href);
      // Everything before the INK hop is the city page itself: no PDP or any other storefront page in between.
      expect(visited.slice(0, -1).every((u) => new URL(u).pathname === cityPath(subject.city))).toBe(true);
    });
  });
}

test.describe("city page: fallback when a city has no pieces", () => {
  const bare = oracleAvailable ? cityWithoutPieces("sul") : undefined;
  test.skip(!bare, "every Sul city in the local data has at least one piece");

  test("given a city whose families have no pieces in the index, when opened, then no tab bar is shown and the classic grid still renders", async ({ page }) => {
    await page.goto(cityPath(bare!));
    await expect(page.getByRole("tablist", { name: "Tipo de peça" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /^Comprar .* de .* na loja$/ }).first()).toBeVisible();
  });
});
