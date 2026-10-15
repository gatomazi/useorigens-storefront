import { devices, type Page } from "@playwright/test";
import { existsSync } from "node:fs";
import path from "node:path";
import { expect, normalizeFbq, test } from "../e2e/fixtures";

/**
 * Catalog UX V1: the flows the round changed, against the local snapshots. The city tests need the garment index (any Sul city with pieces);
 * the collection tests need the config-driven store (playwright.catalog-ux.config.ts) and the synced collections of the Sul store.
 */
const hasGarmentIndex = existsSync(path.join(process.cwd(), "data", "generated", "garment-index.json"));
const CITY = "/sul/sc/florianopolis";
const COLLECTION = "/sul/colecoes/seu-lugar";
// A phone, without `defaultBrowserType` (Playwright refuses it inside a describe): the viewport, touch, scale and user agent of an iPhone 13.
const { viewport: _vp, defaultBrowserType: _browser, ...iphone } = devices["iPhone 13"];
void _vp;
void _browser;
const PHONE = { ...iphone, viewport: { width: 390, height: 844 } };

const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

async function withFbqMock(page: Page): Promise<unknown[][]> {
  const calls: unknown[][] = [];
  await page.exposeFunction("__reportFbq", (args: unknown[]) => calls.push(normalizeFbq(args)));
  await page.addInitScript(() => {
    (window as unknown as { fbq: (...args: unknown[]) => void }).fbq = (...args: unknown[]) => (window as unknown as { __reportFbq: (args: unknown[]) => void }).__reportFbq(args);
  });
  return calls;
}
/** Keeps the document from unloading on the real INK link (a capture-phase preventDefault), so the mocked fbq call is never lost in the navigation. */
async function blockInkNavigation(page: Page) {
  await page.addInitScript(() => {
    document.addEventListener(
      "click",
      (e) => {
        const link = (e.target as HTMLElement | null)?.closest?.('a[href^="https://www.usesul.com.br"]');
        if (link) e.preventDefault();
      },
      true,
    );
  });
}
async function grantConsent(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("useorigens:consent:marketing", JSON.stringify({ choice: "accepted", version: 2, decidedAt: "2026-09-23T00:00:00.000Z" }));
  });
}

test.describe("city page: the piece rail", () => {
  test.skip(!hasGarmentIndex, "no local garment index");

  test("given a city with many pieces, when the page loads, then the rail is one line, only the classic grid is in the document and the caption names the piece", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(CITY);
    const tabs = page.getByRole("tab");
    expect(await tabs.count()).toBeGreaterThanOrEqual(3);
    const tops = await tabs.evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)));
    expect(new Set(tops).size, `one line of chips, got tops ${tops.join(",")}`).toBe(1);
    await expect(page.locator('[role="tabpanel"]')).toHaveCount(1);
    await expect(page.getByTestId("garment-caption")).toContainText(/\d estilos em Camiseta clássica/);
    // The grid under the rail uses the store's one card frame: a bordered block, no loose heart over the page.
    await expect(page.getByRole("tabpanel").locator("li a").first()).toHaveClass(/rounded-lg/);
  });

  test("given the Oversized chip, when chosen, then its grid is mounted, the caption follows, the URL carries ?peca= and the other grids stay unmounted", async ({ page }) => {
    await page.goto(CITY);
    await page.getByRole("tab", { name: /Oversized/ }).click();
    await expect(page).toHaveURL(/\?peca=oversized$/);
    await expect(page.getByTestId("garment-caption")).toContainText(/\d estilos em Oversized/);
    await expect(page.locator('[role="tabpanel"]')).toHaveCount(2); // classic (hidden) + Oversized
    await expect(page.getByRole("tabpanel", { name: /Oversized/ })).toBeVisible();
    await expect(page.getByRole("tabpanel", { name: /Oversized/ }).getByRole("link", { name: /Oversized de Florianópolis na loja$/ }).first()).toHaveAttribute("href", /usesul\.com\.br/);
  });

  test("given ?peca= in the address, when opened fresh, then that piece is selected after hydration", async ({ page }) => {
    await page.goto(`${CITY}?peca=regata`);
    await expect(page.getByRole("tab", { name: /Regata/ })).toHaveAttribute("aria-selected", "true");
  });

  test("given the grid scrolled, when the rail reaches the header, then it sticks right under it and never covers a card", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(CITY);
    await page.evaluate(() => window.scrollTo({ top: 900, behavior: "instant" }));
    await page.waitForTimeout(400);
    const rail = page.getByTestId("garment-rail");
    await expect(rail).toHaveAttribute("data-stuck", "true");
    const box = (await rail.boundingBox())!;
    const header = (await page.locator("header.site-header").boundingBox())!;
    expect(Math.abs(box.y - (header.y + header.height))).toBeLessThanOrEqual(6);
    expect(box.height).toBeLessThan(70);
  });

  test.describe("on a phone", () => {
    test.use(PHONE);
    test("given 390px, when the page loads and a chip is tapped, then nothing overflows, the rail scrolls sideways and the first product is near the first screen", async ({ page }) => {
      await page.goto(CITY);
      expect(await overflow(page)).toBe(0);
      const list = page.getByRole("tablist", { name: "Tipo de peça" });
      const scrollable = await list.evaluate((el) => el.scrollWidth > el.clientWidth);
      expect(scrollable).toBe(true);
      await page.getByRole("tab", { name: /Infantil/ }).first().click();
      await expect(page).toHaveURL(/\?peca=infantil$/);
      expect(await overflow(page)).toBe(0);
      const first = await page.locator(".photo").first().evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
      expect(first).toBeLessThan(560);
    });
  });

  test("given a piece card, when clicked, then GoToInk fires exactly once, from city_styles, and the link is the real INK product", async ({ page }) => {
    await grantConsent(page);
    const calls = await withFbqMock(page);
    await blockInkNavigation(page);
    await page.goto(`${CITY}?peca=oversized`);
    const card = page.getByRole("tabpanel", { name: /Oversized/ }).getByRole("link", { name: /Oversized de Florianópolis na loja$/ }).first();
    await expect(card).toHaveAttribute("href", /^https:\/\/www\.usesul\.com\.br\//);
    await card.click();
    await expect.poll(() => calls.filter((c) => c[1] === "GoToInk").length).toBe(1);
    expect(calls.filter((c) => c[1] === "GoToInk")[0][2]).toMatchObject({ source_section: "city_styles" });
  });
});

test.describe("collection page: compact header, filters and sort", () => {
  test("given the automatic collection page, when it loads on a desktop, then the header is short and the first product is inside the first screen", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(COLLECTION);
    const hero = page.locator("section").first();
    expect((await hero.boundingBox())!.height).toBeLessThanOrEqual(260);
    const first = await page.locator("[role=region] li .photo").first().evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
    expect(first).toBeLessThan(650);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/sul\/colecoes\/seu-lugar$/);
  });

  test("given the desktop bar, when a state, a style and the price order are chosen, then the grid shows only those, cheapest first, and clearing brings the page back", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(COLLECTION);
    await expect(page.getByTestId("collection-filter-bar")).toBeVisible();
    await page.getByTestId("filter-state").selectOption("SC");
    await expect(page.getByTestId("collection-status")).toContainText(/produtos com 1 filtro/);
    // The city facet appears once a state is chosen; the other states stay offered.
    await expect(page.getByTestId("filter-city")).toBeVisible();
    expect(await page.getByTestId("filter-state").locator("option").count()).toBeGreaterThan(2);
    await page.getByTestId("filter-family").selectOption("ponto-de-origem");
    await page.getByTestId("collection-sort").selectOption("price-asc");
    await expect(page.getByTestId("collection-status")).toContainText(/2 filtros, menor preço/);
    const cards = page.locator("[role=region] li");
    const contexts = await cards.locator(".t-place").allTextContents();
    expect(contexts.length).toBeGreaterThan(0);
    expect(contexts.every((c) => c.endsWith("· SC"))).toBe(true);
    const names = await cards.locator("h3").allTextContents();
    expect(new Set(names)).toEqual(new Set(["Ponto de Origem"]));
    const prices = (await cards.locator(".tabular-nums").allTextContents()).map((p) => Number(p.replace(/.*R\$\s?/, "").replace(".", "").replace(",", ".")));
    for (let i = 1; i < prices.length; i++) expect(prices[i]).toBeGreaterThanOrEqual(prices[i - 1]);
    // The address never changes: one cached page, its canonical kept.
    await expect(page).toHaveURL(/\/sul\/colecoes\/seu-lugar$/);
    await page.getByRole("button", { name: "Limpar filtros" }).click();
    await page.getByTestId("collection-sort").selectOption("collection");
    await expect(page.getByRole("navigation", { name: /Páginas de/ })).toBeVisible();
  });

  test.describe("on a phone", () => {
    test.use(PHONE);
    test("given 390px, when Filtrar opens the sheet and a state is chosen, then the count follows, the sheet closes on Ver produtos and nothing overflows", async ({ page }) => {
      await page.goto(COLLECTION);
      await expect(page.getByTestId("collection-filter-bar")).toBeHidden();
      await page.getByTestId("collection-filter-button").click();
      const sheet = page.getByRole("dialog", { name: "Filtrar" });
      await expect(sheet).toBeVisible();
      await sheet.getByRole("button", { name: /^Santa Catarina/ }).click();
      await expect(sheet.getByTestId("collection-filter-apply")).toContainText(/Ver [\d.]+ produtos/);
      await sheet.getByTestId("collection-filter-apply").click();
      await expect(sheet).toBeHidden();
      await expect(page.getByTestId("collection-filter-button")).toContainText("Filtrar · 1");
      await expect(page.getByTestId("collection-status")).toContainText(/1 filtro/);
      expect(await overflow(page)).toBe(0);
    });
  });
});

test.describe("home, menu and overlays", () => {
  test.describe("on a phone", () => {
    test.use(PHONE);
    test("given the home at 390px, when it loads, then title and search lead, a product card starts inside the first screen and the supporting text comes after", async ({ page }) => {
      await page.goto("/sul");
      const h1 = (await page.locator("h1").boundingBox())!;
      const search = (await page.getByRole("button", { name: /Busque sua cidade/ }).boundingBox())!;
      const card = (await page.locator("section[aria-labelledby=hero-title] li a").first().boundingBox())!;
      expect(h1.y).toBeLessThan(search.y);
      expect(search.y).toBeLessThan(card.y);
      expect(card.y).toBeLessThan(844);
      const caption = (await page.getByText(/Ou explore por estado/).boundingBox())!;
      expect(caption.y).toBeGreaterThan(card.y);
      expect(await overflow(page)).toBe(0);
    });

    test("given the cookie bar at 390px, when shown, then it is short, both buttons keep a 44px target, and it goes away completely after a choice", async ({ page }) => {
      await page.goto("/sul");
      const bar = page.locator("[data-consent-banner]");
      const box = (await bar.boundingBox())!;
      expect(box.height).toBeLessThanOrEqual(120);
      for (const name of ["Rejeitar", "Aceitar cookies"]) expect((await bar.getByRole("button", { name }).boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await bar.getByRole("button", { name: "Rejeitar" }).click();
      await expect(bar).toHaveCount(0);
    });

    test("given the coupon button at 390px, when the page scrolls down, then it tucks away from the cards, and comes back on a scroll up", async ({ page }) => {
      await page.goto("/sul");
      const fab = page.getByTestId("promo-fab");
      await expect(fab).toBeVisible();
      await page.mouse.wheel(0, 600);
      await page.mouse.wheel(0, 300);
      await expect(fab).toHaveAttribute("data-tucked", "true");
      await page.mouse.wheel(0, -300);
      await expect(fab).not.toHaveAttribute("data-tucked", "true");
    });

    test("given the phone menu, when opened, then the collections read in two columns and the menu is not one long column", async ({ page }) => {
      await page.goto("/sul");
      await page.getByRole("button", { name: "Abrir menu" }).click();
      const block = page.locator("[data-block=categories]");
      await expect(block).toBeVisible();
      const xs = await block.getByRole("link").evaluateAll((els) => els.slice(0, 4).map((el) => Math.round(el.getBoundingClientRect().x)));
      expect(new Set(xs).size).toBe(2);
      expect(await overflow(page)).toBe(0);
    });
  });

  test("given the desktop header, when read, then the states menu is called Estados, the home's Estados link is not repeated, and Categorias lists the collections", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/sul");
    const nav = page.getByRole("navigation", { name: "Principal" });
    await expect(nav.locator("summary", { hasText: "Estados" })).toBeVisible();
    await expect(nav.locator("summary", { hasText: "Regiões" })).toHaveCount(0);
    await expect(nav.getByRole("link", { name: "Estados", exact: true })).toHaveCount(0);
    await nav.locator("summary", { hasText: "Categorias" }).click();
    await expect(nav.getByRole("link", { name: "Seu Lugar" })).toBeVisible();
  });
});
