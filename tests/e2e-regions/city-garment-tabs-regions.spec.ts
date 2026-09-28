import { expect, test } from "../e2e/fixtures";
import { citiesWithPeruano, oracleAvailable } from "../e2e/garment-oracle";
import { REGIONS, type RegionSlug } from "../../src/lib/geo/regions";

/**
 * One real city per region, all OUTSIDE the pilot (Tijucas/SC, Xambioá/TO, Água Boa/MT), against the real
 * local catalog. Checks the tab, the exact piece (href + price), that the link stays inside the region's own
 * INK store (Norte never points to Sul and vice versa) and that a click goes straight to INK.
 */
test.skip(!oracleAvailable, "local catalog snapshot + garment index not present");

const PILOT = ["4218004", "1722107", "5100201"];
const HOST: Record<RegionSlug, string> = { sul: "www.usesul.com.br", norte: "www.usenorte.com.br", "centro-oeste": "www.usecentro.com.br" };

for (const region of ["sul", "norte", "centro-oeste"] as const) {
  const [subject] = oracleAvailable ? citiesWithPeruano(region, 3, PILOT) : [];

  test.describe(`${REGIONS[region].name}: ${subject?.city.name ?? "no city"}`, () => {
    test.skip(!subject, "no city with enough pieces in the local data");
    const path = () => `/${region}/${subject.city.uf.toLowerCase()}/${subject.city.slug}`;

    test("given the region page, when the Peruano tab is picked, then every card is the exact piece of the region's own store", async ({ page }) => {
      const expected = subject.pieces.filter((p) => p.typeSlug === "peruano");
      await page.goto(path());
      await expect(page.getByRole("tab", { name: /Camiseta clássica/ })).toHaveAttribute("aria-selected", "true");
      await page.getByRole("tab", { name: /Algodão Peruano/ }).click();
      await expect(page).toHaveURL(/\?peca=peruano$/);
      const panel = page.getByRole("tabpanel", { name: /Algodão Peruano/ });
      await expect(panel.getByRole("link")).toHaveCount(expected.length);
      for (const piece of expected) {
        expect(new URL(piece.href).host).toBe(HOST[region]);
        const card = panel.getByRole("link", { name: `Comprar ${piece.familyName} Algodão Peruano de ${subject.city.name} na loja` });
        await expect(card).toHaveAttribute("href", piece.href);
        await expect(card).toContainText(piece.priceText);
      }
      // No link on the whole page may leave the region's own INK store.
      const hrefs = await page.locator('a[href^="https://www.use"]').evaluateAll((els) => els.map((e) => (e as HTMLAnchorElement).href));
      expect(hrefs.length).toBeGreaterThan(0);
      for (const href of hrefs) expect(new URL(href).host).toBe(HOST[region]);
    });

    test("given a phone viewport, when the page renders, then the tabs do not overflow the page", async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 800 });
      await page.goto(path());
      await expect(page.getByRole("tablist", { name: "Tipo de peça" })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
    });

    test("given a piece card, when clicked, then the browser goes straight to the exact INK product", async ({ page }) => {
      const piece = subject.pieces.find((p) => p.typeSlug === "peruano")!;
      await page.route(`https://${HOST[region]}/**`, (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<title>INK stub</title>" }));
      await page.goto(`${path()}?peca=peruano`);
      await page.getByRole("link", { name: `Comprar ${piece.familyName} Algodão Peruano de ${subject.city.name} na loja` }).click();
      await page.waitForURL(piece.href);
    });
  });
}
