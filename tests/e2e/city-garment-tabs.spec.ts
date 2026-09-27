import { expect, test } from "./fixtures";

/**
 * The city page's garment-type selector (MD "seletor de peças na página da cidade"). Real fixture data
 * this round: Tijucas/SC, family Traço, is the only city with more than the classic piece in Sul's local
 * snapshot (docs/storefront/city-garment-tabs-round.md) — the MD's own Caso A/D acceptance city.
 */
test.describe("city page: garment-type tabs", () => {
  test("given Tijucas/SC, when the page loads, then the classic tab is selected and the other real families still show as before", async ({ page }) => {
    await page.goto("/sul/sc/tijucas");
    const tablist = page.getByRole("tablist", { name: "Tipo de peça" });
    await expect(tablist).toBeVisible();
    await expect(page.getByRole("tab", { name: /Camiseta clássica/ })).toHaveAttribute("aria-selected", "true");
    // A family untouched by this round's fixture data (Ponto de Origem has no garment siblings) — same direct-to-INK link as before.
    await expect(page.getByRole("link", { name: /Comprar Ponto de Origem de Tijucas na loja/ })).toHaveAttribute(
      "href",
      "https://www.usesul.com.br/usesul/product/tijucas-origem-sc",
    );
  });

  test("given the Algodão Peruano tab, when clicked, then the Traço card switches to that exact real INK product (Caso A/D: no modal, no intermediate PDP)", async ({ page }) => {
    await page.goto("/sul/sc/tijucas");
    await page.getByRole("tab", { name: /Algodão Peruano/ }).click();
    await expect(page).toHaveURL(/\?peca=peruano$/);

    const card = page.getByRole("link", { name: "Comprar Traço Algodão Peruano de Tijucas na loja" });
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute("href", "https://www.usesul.com.br/usesul/product/tijucas-traco-sc-20a63a8d-8f58-4af9-be66-260b735abf53");
    await expect(page.getByText("R$ 139,90").first()).toBeVisible();

    // No other family gets a fabricated Peruano card (MD Caso C) — Ponto de Origem has no such piece.
    await expect(page.getByRole("link", { name: /Ponto de Origem.*Algodão Peruano/ })).toHaveCount(0);
  });

  test("given a tab has been picked, when the same URL is opened fresh, then the choice is restored (shareable/bookmarkable ?peca=)", async ({ page }) => {
    await page.goto("/sul/sc/tijucas?peca=body-infantil");
    await expect(page.getByRole("tab", { name: /Body Infantil/ })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("link", { name: "Comprar Traço Body Infantil de Tijucas na loja" })).toHaveAttribute(
      "href",
      "https://www.usesul.com.br/usesul/product/tijucas-traco-sc-47e0a902-d9f8-4a5e-9296-9592b07c704d",
    );
  });

  test("given a city with no real garment-type data (the common case this round), when opened, then no tab bar is shown at all", async ({ page }) => {
    await page.goto("/sul/rs/torres");
    await expect(page.getByRole("tablist", { name: "Tipo de peça" })).toHaveCount(0);
  });

  test("given a phone viewport, when the tabs render, then they scroll horizontally without the page itself overflowing", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto("/sul/sc/tijucas");
    await expect(page.getByRole("tablist", { name: "Tipo de peça" })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBe(0);
    // Tijucas' Traço batch has no Oversized sibling (real data gap, confirmed live) — that tab must not exist at all.
    await expect(page.getByRole("tab", { name: /Oversized/ })).toHaveCount(0);
    await page.getByRole("tab", { name: /Regata/ }).click();
    await expect(page).toHaveURL(/\?peca=regata$/);
  });

  test("given the keyboard, when arrow keys move focus across tabs, then the panel switches without a mouse", async ({ page }) => {
    await page.goto("/sul/sc/tijucas");
    await page.getByRole("tab", { name: /Camiseta clássica/ }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("tab", { name: /Algodão Peruano/ })).toHaveAttribute("aria-selected", "true");
    await expect(page).toHaveURL(/\?peca=peruano$/);
  });

  /**
   * Norte and Centro-Oeste are intentionally NOT launched in this project's default e2e config — `sul.spec.ts`
   * itself asserts `/norte` 404s here, matching real production today (only Sul's INK catalog is public;
   * see the CMS rollout notes). Their garment-tab data is real (docs/storefront/city-garment-catalog-rollout.md,
   * Xambioá/TO and Água Boa/MT both have the full 9-piece batch) but is verified at the data layer instead
   * (tests/unit/garments.test.ts's `Catalog#garmentTabsForCity` cases), not through an HTTP page load that
   * would 404 by design — a real HTTP-level check needs `SITE_CONFIG_HOME=on` plus a published bundle
   * marking those regions launched, outside this round's scope to wire into the e2e harness.
   */
});