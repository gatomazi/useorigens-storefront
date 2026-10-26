import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import type { GlobalSearchResponse } from "@/lib/search/global";

// Global search (docs/storefront/global-search-round.md) against the local catalog snapshot: places, designs grouped by product cluster, editorial
// results, navigation, Esc, fallback and small-screen layout. The default e2e server is Sul-only, with the CMS off.

async function openSearch(page: Page) {
  // The header's search: the icon from 640px, the field in the middle of the header on phones (only the one on screen has a role).
  await page.locator("header").getByRole("button", { name: /^(Buscar|Busque por lugar, tema ou coleção)$/ }).click();
  const dialog = page.getByRole("dialog", { name: "Buscar na Use Origens" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("combobox")).toBeFocused(); // initial focus in the field
  return dialog;
}

test.describe("global search", () => {
  for (const repeat of ["reopen", "clear"] as const) {
    test(`a published search setting is read again when repeating the same query (${repeat})`, async ({ page }) => {
      let designs = true;
      let requests = 0;
      await page.route("**/api/busca?**", async (route) => {
        requests++;
        const body: GlobalSearchResponse = {
          query: "imbitu", region: "sul", total: designs ? 4 : 2,
          groups: [
            { group: "places", total: 1, items: [{ key: "loc:4207304", kind: "locality", region: "sul", title: "Imbituba", subtitle: "Santa Catarina", href: "/sul/sc/imbituba", tag: "Cidade" }] },
            ...(designs ? [{ group: "designs" as const, total: 1, items: [{ key: "design:imbituba", kind: "design" as const, region: "sul" as const, title: "Imbituba · Ponto de Origem", subtitle: "10 peças disponíveis", href: "/sul/sc/imbituba/ponto-de-origem", tag: "Estampa" }] }] : []),
            { group: "editorial", total: 1, items: [{ key: "page:imbituba", kind: "page", region: "sul", title: "Imbituba e suas histórias", subtitle: "", href: "/sul/h/imbituba", tag: "Especial" }] },
          ],
          others: designs ? [{ key: "design:outra", kind: "design", region: "norte", title: "Imbituba · Feito em", subtitle: "", href: "/norte/h/imbituba", tag: "Estampa" }] : [],
        };
        await route.fulfill({ json: body });
      });
      await page.goto("/sul");
      let dialog = await openSearch(page);
      await dialog.getByRole("combobox").fill("imbitu");
      await expect(dialog.locator('[data-result-kind="design"]')).toHaveCount(2);

      for (const on of [false, true]) {
        designs = on; // The next API answer reflects a newly published global setting.
        const before = requests;
        if (repeat === "reopen") {
          await dialog.getByRole("button", { name: "Fechar busca" }).click();
          dialog = await openSearch(page);
        } else {
          await dialog.getByRole("combobox").fill("");
          await expect(dialog.getByRole("option")).toHaveCount(0);
        }
        await dialog.getByRole("combobox").fill("imbitu");
        await expect.poll(() => requests).toBeGreaterThan(before);
        await expect(dialog.locator('[data-result-kind="design"]')).toHaveCount(on ? 2 : 0);
        await expect(dialog.locator('[data-result-kind="locality"]')).toContainText("Imbituba");
        await expect(dialog.locator('[data-result-kind="page"]')).toContainText("Imbituba e suas histórias");
      }
    });
  }

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
