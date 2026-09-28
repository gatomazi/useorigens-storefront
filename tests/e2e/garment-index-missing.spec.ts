import { expect, test } from "./fixtures";

/**
 * Opt-in: needs a server whose CATALOG_SNAPSHOT_DIR holds the catalog snapshot but NO garment-index.json.
 *   mkdir -p /tmp/no-garment-index && ln -sf "$PWD/data/generated/catalog-snapshot.json" /tmp/no-garment-index/ \
 *     && ln -sf "$PWD/data/generated/collections-snapshot.json" /tmp/no-garment-index/
 *   E2E_NO_GARMENT_INDEX=1 CATALOG_SNAPSHOT_DIR=/tmp/no-garment-index npx playwright test tests/e2e/garment-index-missing.spec.ts
 * Proves the optional index can be absent (rollback = delete the file) without touching the classic page.
 */
test.skip(process.env.E2E_NO_GARMENT_INDEX !== "1", "opt-in: run against a snapshot dir without garment-index.json");

test("given no garment index at all, when a city page opens, then it renders the classic grid with no tab bar and no error", async ({ page }) => {
  const response = await page.goto("/sul/sc/tijucas");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("tablist", { name: "Tipo de peça" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /^Comprar .* de Tijucas na loja$/ }).first()).toBeVisible();
});
