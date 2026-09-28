import { expect, test } from "./fixtures";
import { classicFamilies, oracleAvailable, piecesOfCity } from "./garment-oracle";
import { allCities } from "../../src/lib/geo/cities";
import { GARMENT_TYPES } from "../../src/lib/catalog/garments";

/**
 * Directed check of one Sul city whose families sit at different points of the crawl (verified when the Sul
 * pass was completed, docs/storefront/city-garment-catalog-rollout.md §7): Agudos do Sul/PR has families
 * collected before the last run (Gentílico, Feito em, Legado, Território: 9 pieces each), one collected in the
 * last run (Ponto de Origem: 9), one with an incomplete cluster (Coordenadas: 8 of 9) and two with no cluster
 * at all (Traço, Tipografia). Expectations come from the data files, not from the app.
 */
test.skip(!oracleAvailable, "local catalog snapshot + garment index not present");

const city = allCities().find((c) => c.uf === "PR" && c.slug === "agudos-do-sul");
const pieces = city ? piecesOfCity(city.id) : [];
test.skip(!city || pieces.length === 0, "Agudos do Sul/PR has no pieces in the local data");

test("given a city with families at different points of the crawl, when each tab is opened, then every card is that family's exact piece and families without a piece never get a card", async ({ page }) => {
  const families = classicFamilies(city!.id);
  const pieceFamilyIds = new Set(pieces.map((p) => p.familyId));
  const withoutPieces = families.filter((f) => !pieceFamilyIds.has(f.id));
  expect(withoutPieces.length).toBeGreaterThan(0); // Traço and Tipografia in the current data

  await page.goto(`/sul/pr/${city!.slug}`);
  await expect(page.getByRole("tab", { name: /Camiseta clássica/ })).toHaveAttribute("aria-selected", "true");

  for (const type of GARMENT_TYPES.filter((t) => t.id !== 1)) {
    const expected = pieces.filter((p) => p.typeId === type.id);
    const tab = page.getByRole("tab", { name: new RegExp(type.label.replace(/[()]/g, "\\$&")) });
    if (expected.length === 0) {
      await expect(tab).toHaveCount(0);
      continue;
    }
    await expect(tab).toContainText(`· ${expected.length}`);
    await tab.click();
    const panel = page.getByRole("tabpanel", { name: new RegExp(type.label.replace(/[()]/g, "\\$&")) });
    await expect(panel.getByRole("link")).toHaveCount(expected.length);
    for (const piece of expected) {
      const card = panel.getByRole("link", { name: `Comprar ${piece.familyName} ${type.label} de ${city!.name} na loja` });
      await expect(card).toHaveAttribute("href", piece.href);
      await expect(card).toContainText(piece.priceText);
    }
    for (const family of withoutPieces) {
      await expect(panel.getByRole("link", { name: new RegExp(`Comprar ${family.name} .* de ${city!.name}`) })).toHaveCount(0);
    }
  }

  // Families without any piece are still on the classic tab, pointing straight at INK.
  await page.getByRole("tab", { name: /Camiseta clássica/ }).click();
  const classic = page.getByRole("tabpanel", { name: /Camiseta clássica/ });
  for (const family of withoutPieces) {
    await expect(classic.getByRole("link", { name: `Comprar ${family.name} de ${city!.name} na loja` })).toHaveAttribute("href", /^https:\/\/www\.usesul\.com\.br\//);
  }
});
