import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test } from "../e2e/fixtures";
import { citiesWithPeruano, oracleAvailable } from "../e2e/garment-oracle";

/** Screenshots of real cities (outside the pilot) with the Peruano tab open. Only with EVIDENCE=1. */
test.skip(!process.env.EVIDENCE || !oracleAvailable, "evidence capture is opt-in (EVIDENCE=1)");

const OUT = path.resolve("docs/screenshots/city-garment-tabs-full");
const PILOT = ["4218004", "1722107", "5100201"];

for (const region of ["sul", "norte", "centro-oeste"] as const) {
  for (const viewport of [
    { name: "mobile-375", width: 375, height: 900 },
    { name: "desktop-1280", width: 1280, height: 900 },
  ]) {
    test(`${region} ${viewport.name}`, async ({ page }) => {
      const [subject] = citiesWithPeruano(region, 3, PILOT);
      mkdirSync(OUT, { recursive: true });
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto(`/${region}/${subject.city.uf.toLowerCase()}/${subject.city.slug}?peca=peruano`);
      await expect(page.getByRole("tab", { name: /Algodão Peruano/ })).toHaveAttribute("aria-selected", "true");
      await page.getByRole("tablist", { name: "Tipo de peça" }).scrollIntoViewIfNeeded();
      await page.evaluate(() => window.scrollBy(0, -120));
      await page.waitForLoadState("networkidle").catch(() => undefined);
      await page.screenshot({ path: path.join(OUT, `${region}-${subject.city.slug}-${viewport.name}.png`) });
    });
  }
}
