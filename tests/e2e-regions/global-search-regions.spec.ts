import { expect, test, type Page } from "@playwright/test";

// Global search with the CMS on and the three regions launched (tests/e2e-regions/fixtures/published.json, which carries a live "Dia dos Pais"
// hotpage in Sul): editorial results, the current region first, other regions after, and a smoke of the search in every region.

async function openSearch(page: Page, region: string) {
  await page.goto(`/${region}`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Buscar na Use Origens" });
  await expect(dialog).toBeVisible();
  return dialog;
}

test("15. a live hotpage is found by its title and opens", async ({ page }) => {
  const dialog = await openSearch(page, "sul");
  await dialog.getByRole("combobox").fill("pais");
  const hit = dialog.locator('[data-result-kind="page"]', { hasText: "Dia dos Pais" });
  await expect(hit).toBeVisible({ timeout: 30_000 });
  await hit.click();
  await page.waitForURL(/\/sul\/h\/dia-dos-pais$/);
});

test("11–12. from Norte, a Sul place comes in 'Em outras regiões', after Norte's own results", async ({ page }) => {
  const dialog = await openSearch(page, "norte");
  await dialog.getByRole("combobox").fill("tijucas");
  const others = dialog.getByRole("group", { name: "Em outras regiões" });
  await expect(others.getByRole("option").first()).toContainText("Tijucas", { timeout: 30_000 });
  await expect(others.getByRole("option").first()).toContainText("Sul");
});

for (const [region, query, expected] of [
  ["sul", "florianopolis", "Florianópolis"],
  ["norte", "boa vista", "Boa Vista"],
  ["centro-oeste", "aguas claras", "Águas Claras"],
] as const) {
  test(`smoke: the search works in ${region}`, async ({ page }) => {
    const dialog = await openSearch(page, region);
    await dialog.getByRole("combobox").fill(query);
    const first = dialog.locator('[data-result-kind="locality"]').first();
    await expect(first).toContainText(expected, { timeout: 30_000 });
    if (region === "centro-oeste") await expect(first).toContainText("Região Administrativa"); // never called a city
  });
}
