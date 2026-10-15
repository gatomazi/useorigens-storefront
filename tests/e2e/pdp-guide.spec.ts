import { expect, test, type Page } from "@playwright/test";

/**
 * The guided help on a design page ("Procurando sua cidade ou outra estampa?", src/components/catalog/PdpGuide.tsx): where the invite sits,
 * the two paths (a city → its designs; a collection → a few products), dismissal remembered in the browser, keyboard/escape, small phones,
 * and the API failing without touching the purchase. Data is the local snapshots (Florianópolis/SC has every style; Tijucas/SC has one).
 */
const PAGE = "/sul/sc/florianopolis/feito-em";
const INVITE = "Procurando sua cidade ou outra estampa?";

async function acceptCookies(page: Page) {
  const accept = page.getByRole("region", { name: "Preferências de cookies" }).getByRole("button", { name: /Aceitar/ });
  if (await accept.isVisible({ timeout: 1500 }).catch(() => false)) await accept.click();
}

test.describe("guided help on a design page", () => {
  test("given the page, then the invite sits under the purchase block with three 44px targets, and never above price or CTA", async ({ page }) => {
    await page.goto(PAGE);
    const invite = page.getByRole("region", { name: INVITE });
    await expect(invite).toBeVisible();
    const cta = await page.getByRole("link", { name: "Escolher tamanho na loja" }).boundingBox();
    const box = await invite.boundingBox();
    expect(box!.y).toBeGreaterThan(cta!.y + cta!.height);
    for (const name of ["Buscar uma cidade", "Ver outras estampas", "Mais estampas de Florianópolis", "Dispensar esta ajuda"]) {
      const b = await invite.getByRole("button", { name }).boundingBox();
      expect(b!.height, name).toBeGreaterThanOrEqual(44);
      expect(b!.width, name).toBeGreaterThanOrEqual(44);
    }
    // Nothing opens on its own.
    await expect(page.locator("dialog[open]")).toHaveCount(0);
  });

  test("given 'Buscar uma cidade', when a city of the region is chosen, then its designs show in place with the link to its page", async ({ page }) => {
    await page.goto(PAGE);
    await acceptCookies(page);
    await page.getByRole("button", { name: "Buscar uma cidade" }).click();
    const sheet = page.locator("dialog[open]");
    await expect(sheet.getByRole("heading", { name: "Buscar uma cidade" })).toBeVisible();
    const input = sheet.getByRole("combobox");
    await expect(input).toBeFocused();
    await input.fill("tijucas");
    const option = sheet.getByRole("option", { name: /Tijucas/ }).first(); // Tijucas and Tijucas do Sul
    await expect(option).toBeVisible();
    // Places only: no design rows in this step.
    await expect(sheet.locator('[data-result-kind="design"]')).toHaveCount(0);
    await option.click();
    await expect(sheet.getByRole("heading", { name: "Estampas de Tijucas" })).toBeVisible();
    const cards = sheet.locator('[data-pdp-guide="results"] a');
    await expect(cards.first()).toBeVisible();
    expect(await cards.count()).toBeLessThanOrEqual(3); // never more than three, never the product already open
    await expect(cards.first()).toHaveAttribute("href", /^https:\/\/www\.usesul\.com\.br\/usesul\/product\//);
    await expect(cards.first()).toContainText("R$");
    await expect(sheet.getByRole("link", { name: /Ver todas as estampas de Tijucas/ })).toHaveAttribute("href", "/sul/sc/tijucas");
    expect(new URL(page.url()).pathname).toBe(PAGE);
    // Back returns to the search, Escape closes and the focus goes back to the button that opened the guide.
    await sheet.getByRole("button", { name: "Voltar" }).click();
    await expect(sheet.getByRole("combobox")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("dialog[open]")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Buscar uma cidade" })).toBeFocused();
  });

  test("given 'Ver outras estampas', then real collections of the published menu open a few products and the full collection link", async ({ page }) => {
    await page.goto(PAGE);
    await acceptCookies(page);
    await page.getByRole("button", { name: "Ver outras estampas" }).click();
    const sheet = page.locator("dialog[open]");
    await expect(sheet.getByRole("heading", { name: "Ver outras estampas" })).toBeVisible();
    const collections = sheet.locator('[data-pdp-guide="collections"] button');
    expect(await collections.count()).toBeGreaterThan(0);
    const name = (await collections.first().innerText()).split("\n")[0];
    await collections.first().click();
    await expect(sheet.getByRole("heading", { name })).toBeVisible();
    const cards = sheet.locator('[data-pdp-guide="results"] a');
    await expect(cards.first()).toBeVisible();
    expect(await cards.count()).toBeLessThanOrEqual(4);
    await expect(sheet.getByRole("link", { name: /Ver a coleção completa/ })).toHaveAttribute("href", /^\/sul\/colecoes\/[a-z0-9-]+$/);
    await sheet.getByRole("button", { name: "Voltar" }).click();
    await expect(sheet.getByRole("heading", { name: "Ver outras estampas" })).toBeVisible();
  });

  test("given ✕ on the invite, then it is remembered across reloads and one line reopens the guide", async ({ page }) => {
    await page.goto(PAGE);
    await page.getByRole("button", { name: "Dispensar esta ajuda" }).click();
    await expect(page.getByRole("region", { name: INVITE })).toHaveCount(0);
    const reopen = page.locator('[data-pdp-guide="reopen"]').getByRole("button", { name: INVITE });
    await expect(reopen).toBeVisible();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("origens:guia:v1:dispensado")!))).toMatchObject({ v: 1 });
    await page.reload();
    await expect(page.getByRole("region", { name: INVITE })).toHaveCount(0);
    await page.locator('[data-pdp-guide="reopen"]').getByRole("button", { name: INVITE }).click();
    const sheet = page.locator("dialog[open]");
    await expect(sheet.getByRole("button", { name: "Buscar uma cidade" })).toBeVisible();
    await expect(sheet.getByRole("button", { name: "Ver outras estampas" })).toBeVisible();
    await expect(sheet.getByRole("button", { name: "Mais estampas de Florianópolis" })).toBeVisible();
    // A dismissal of another version is ignored: the invite shows again.
    await page.evaluate(() => localStorage.setItem("origens:guia:v1:dispensado", JSON.stringify({ v: 0, at: Date.now() })));
    await page.reload();
    await expect(page.getByRole("region", { name: INVITE })).toBeVisible();
  });

  test("given 'Mais estampas de Florianópolis', then the page scrolls to the designs it already lists", async ({ page }) => {
    await page.goto(PAGE);
    await page.getByRole("button", { name: "Mais estampas de Florianópolis" }).click();
    const heading = page.getByRole("heading", { name: "Outros estilos de Florianópolis" });
    await expect(heading).toBeInViewport();
    await expect(heading).toBeFocused();
    await expect(page.locator("dialog[open]")).toHaveCount(0);
  });

  test("given the guide API is down, then the guide says so with a retry and the purchase stays untouched", async ({ page }) => {
    await page.goto(PAGE);
    await acceptCookies(page);
    await page.route("**/api/guia/**", (route) => route.abort());
    await page.getByRole("button", { name: "Ver outras estampas" }).click();
    const sheet = page.locator("dialog[open]");
    await sheet.locator('[data-pdp-guide="collections"] button').first().click();
    await expect(sheet.getByText("Não conseguimos carregar agora.")).toBeVisible();
    await expect(sheet.getByRole("button", { name: "Tentar de novo" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("link", { name: "Escolher tamanho na loja" })).toBeVisible();
  });

  test("given a 320px phone, then neither the invite nor the open sheet overflows sideways", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto(PAGE);
    await expect(page.getByRole("region", { name: INVITE })).toBeVisible();
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(await overflow()).toBe(0);
    await page.getByRole("button", { name: "Ver outras estampas" }).click();
    const sheet = page.locator("dialog[open]");
    await expect(sheet.getByRole("heading", { name: "Ver outras estampas" })).toBeVisible();
    expect(await sheet.evaluate((el) => el.scrollWidth - el.clientWidth)).toBe(0);
  });
});
