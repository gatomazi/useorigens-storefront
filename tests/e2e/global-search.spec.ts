import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

// Global search (docs/storefront/global-search-round.md) against the local catalog snapshot: places, designs grouped by product cluster, editorial
// results, navigation, Esc, fallback and small-screen layout. The default e2e server is Sul-only, with the CMS off.

async function openSearch(page: Page) {
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Buscar na Use Origens" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("combobox")).toBeFocused(); // initial focus in the field
  return dialog;
}

test.describe("global search", () => {
  test("13. a place: prefix finds Tijucas and Tijucas do Sul, labelled by state and mesoregion; choosing one opens its page", async ({ page }) => {
    await page.goto("/sul");
    const dialog = await openSearch(page);
    await dialog.getByRole("combobox").fill("tij");
    const places = dialog.locator('[data-result-kind="locality"]');
    await expect(places.nth(0)).toContainText("Tijucas");
    await expect(places.nth(0)).toContainText("Santa Catarina · Grande Florianópolis");
    await expect(places.nth(1)).toContainText("Tijucas do Sul");
    await places.nth(0).click();
    await page.waitForURL(/\/sul\/sc\/tijucas$/);
    await expect(dialog).toBeHidden(); // closes on navigation
  });

  test("accents either way: 'florianopolis' finds Florianópolis first", async ({ page }) => {
    await page.goto("/sul");
    const dialog = await openSearch(page);
    await dialog.getByRole("combobox").fill("florianopolis");
    await expect(dialog.getByRole("option").first()).toContainText("Florianópolis");
  });

  test("14. a design: 'bagé traço' is ONE result (never one per piece) and opens the design's own page", async ({ page }) => {
    await page.goto("/sul");
    const dialog = await openSearch(page);
    await dialog.getByRole("combobox").fill("bagé traço");
    const designs = dialog.locator('[data-result-kind="design"]');
    await expect(designs.first()).toContainText("Bagé · Traço");
    await expect(dialog.getByRole("option", { name: /Bagé · Traço/ })).toHaveCount(1);
    await expect(designs.first()).toContainText(/peças? disponíve(l|is)/);
    await designs.first().click();
    await page.waitForURL(/\/sul\/rs\/bage\/traco$/);
    await expect(page.locator("h1")).toBeVisible();
  });

  test("a family name lists that design across places, each place once", async ({ page }) => {
    await page.goto("/sul");
    const dialog = await openSearch(page);
    await dialog.getByRole("combobox").fill("traço");
    await expect(dialog.locator('[data-result-kind="design"]').first()).toBeVisible();
    const titles = await dialog.locator('[data-result-kind="design"]').allTextContents();
    expect(titles.length).toBeGreaterThan(0);
    const places = titles.map((t) => t.split(" · ")[0]);
    expect(new Set(places).size).toBe(places.length);
  });

  test("a city page offers 'Busque outra cidade' right under its styles; it opens the search sheet and leads to another city", async ({ page }) => {
    await page.goto("/sul/rs/bage");
    await expect(page.getByRole("heading", { name: "Busque outra cidade" })).toBeVisible();
    await page.getByRole("button", { name: /Cidade, estampa ou coleção/ }).click();
    const dialog = page.getByRole("dialog", { name: "Buscar na Use Origens" });
    await expect(dialog.getByRole("combobox")).toBeFocused();
    await dialog.getByRole("combobox").fill("pelot");
    await dialog.locator('[data-result-kind="locality"]').first().click();
    await page.waitForURL(/\/sul\/rs\/pelotas$/);
  });

  test("Esc closes the dialog (desktop)", async ({ page }) => {
    await page.goto("/sul");
    const dialog = await openSearch(page);
    await dialog.getByRole("combobox").fill("tij");
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });

  test("no results: a clear empty state with the region's states", async ({ page }) => {
    await page.goto("/sul");
    const dialog = await openSearch(page);
    await dialog.getByRole("combobox").fill("zzzxq");
    await expect(dialog.getByText("Não encontramos nada com esse nome.")).toBeVisible();
    await expect(dialog.getByRole("link", { name: "Santa Catarina" })).toBeVisible();
  });

  test("17. the search endpoint failing never breaks the page: an error with a retry that works", async ({ page }) => {
    let fail = true;
    await page.route("**/api/busca?**", (route) => (fail ? route.fulfill({ status: 503, body: "" }) : route.fallback()));
    await page.goto("/sul");
    const dialog = await openSearch(page);
    await dialog.getByRole("combobox").fill("tijucas");
    await expect(dialog.getByText("Não conseguimos buscar agora.")).toBeVisible();
    fail = false;
    await dialog.getByRole("button", { name: "Tentar de novo" }).click();
    await expect(dialog.locator('[data-result-kind="locality"]').first()).toContainText("Tijucas");
  });

  for (const width of [320, 375]) {
    test(`18. ${width} px: no horizontal overflow, results are at least 44 px tall`, async ({ page }) => {
      await page.setViewportSize({ width, height: 700 });
      await page.goto("/sul");
      const dialog = await openSearch(page);
      await dialog.getByRole("combobox").fill("tijucas");
      await expect(dialog.getByRole("option").first()).toBeVisible();
      const { overflow, minHeight } = await page.evaluate(() => {
        const d = document.querySelector("dialog[open]")!;
        const rows = [...d.querySelectorAll('[role="option"]')].map((o) => o.getBoundingClientRect().height);
        return { overflow: d.scrollWidth - d.clientWidth, minHeight: Math.min(...rows) };
      });
      expect(overflow).toBe(0);
      expect(minHeight).toBeGreaterThanOrEqual(44);
    });
  }
});
