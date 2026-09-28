import { expect, test } from "./fixtures";

/**
 * The mobile menu hierarchy and its accessibility, on the public Sul page (this server has the config-driven home off, so only Sul is launched:
 * the "Explorar outras regiões" block must therefore be ABSENT — it never lists a region that is not public). The multi-region cases (Norte,
 * Centro-Oeste, labels/order/palette from the CMS) live in tests/e2e-admin/navigation-theme.spec.ts, which publishes them for real.
 */
const MOBILE = [320, 375, 390, 440] as const;

async function openMenu(page: import("@playwright/test").Page, width: number, height = 812) {
  await page.setViewportSize({ width, height });
  await page.goto("/sul");
  await page.getByRole("button", { name: "Abrir menu" }).click();
  const dialog = page.getByRole("dialog", { name: "Menu" });
  await expect(dialog).toBeVisible();
  return dialog;
}

test.describe("mobile menu hierarchy", () => {
  for (const width of MOBILE) {
    test(`given ${width}px, when the menu opens, then it is Comprar then Estados do Sul, each a list of real links, with no region block`, async ({ page }) => {
      const dialog = await openMenu(page, width);
      const sections = dialog.locator("[data-block]");
      await expect(sections).toHaveCount(2);
      await expect(sections.nth(0).getByRole("heading", { level: 2 })).toHaveText("Comprar");
      await expect(sections.nth(1).getByRole("heading", { level: 2 })).toHaveText("Estados do Sul");
      await expect(sections.nth(0).getByRole("link")).toHaveText(["Estilos", "Fala daqui", "Estados"]);
      await expect(sections.nth(1).getByRole("link")).toHaveText(["Paraná", "Santa Catarina", "Rio Grande do Sul"]);
      await expect(sections.nth(1).getByRole("link").first()).toHaveAttribute("href", "/sul/pr");
      await expect(dialog.getByText("Explorar outras regiões")).toHaveCount(0);
      // states are not mixed into the primary list any more
      await expect(sections.nth(0).getByRole("link", { name: "Paraná" })).toHaveCount(0);
    });

    test(`given ${width}px, when the menu is open, then nothing overflows sideways and the type scale is lighter than before`, async ({ page }) => {
      const dialog = await openMenu(page, width);
      const overflow = await page.evaluate(() => ({ page: document.documentElement.scrollWidth - window.innerWidth, dialog: (document.querySelector("dialog[open]") as HTMLElement).scrollWidth - (document.querySelector("dialog[open]") as HTMLElement).clientWidth }));
      expect(overflow.page).toBeLessThanOrEqual(0);
      expect(overflow.dialog).toBeLessThanOrEqual(0);
      const size = (locator: ReturnType<typeof dialog.locator>) => locator.evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize));
      expect(await size(dialog.getByRole("heading", { level: 2 }).first())).toBeGreaterThanOrEqual(13);
      expect(await size(dialog.getByRole("heading", { level: 2 }).first())).toBeLessThanOrEqual(14);
      const primary = await size(dialog.getByRole("link", { name: "Estilos" }));
      const state = await size(dialog.getByRole("link", { name: "Paraná" }));
      expect(primary).toBeGreaterThanOrEqual(24);
      expect(primary).toBeLessThanOrEqual(28);
      expect(state).toBeGreaterThanOrEqual(20);
      expect(state).toBeLessThanOrEqual(22);
    });
  }

  test("given the blocks, when measured, then the gap between blocks is larger than the gap between items of one block", async ({ page }) => {
    const dialog = await openMenu(page, 375);
    const y = async (name: string) => (await dialog.getByRole("link", { name, exact: true }).boundingBox())!;
    const within = (await y("Santa Catarina")).y - ((await y("Paraná")).y + (await y("Paraná")).height);
    const between = (await y("Paraná")).y - ((await y("Estados")).y + (await y("Estados")).height);
    expect(between).toBeGreaterThan(within + 20);
  });
});

test.describe("mobile menu accessibility", () => {
  test("given the menu opens, when read, then focus starts inside it on a neutral spot, and the close row is Fechar × with a 44px target and no frame", async ({ page }) => {
    const dialog = await openMenu(page, 375);
    const initial = await page.evaluate(() => ({ inside: !!document.activeElement?.closest("dialog[open]"), isButton: document.activeElement?.tagName === "BUTTON" }));
    expect(initial).toEqual({ inside: true, isButton: false });
    const close = dialog.getByRole("button", { name: "Fechar menu" });
    const box = (await close.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
    await expect(close).toHaveText("Fechar");
    expect(await close.evaluate((el) => getComputedStyle(el).borderTopWidth)).toBe("0px"); // no border frame
    expect(await close.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgba(0, 0, 0, 0)");
  });

  test("given the menu is open, when Tab is pressed many times (and Shift+Tab), then focus never leaves the menu", async ({ page }) => {
    await openMenu(page, 375);
    for (let i = 0; i < 14; i++) {
      await page.keyboard.press("Tab");
      expect(await page.evaluate(() => !!document.activeElement?.closest("dialog[open]"))).toBe(true);
    }
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press("Shift+Tab");
      expect(await page.evaluate(() => !!document.activeElement?.closest("dialog[open]"))).toBe(true);
    }
  });

  test("given the menu is open, when Escape is pressed, then it closes and focus returns to the button that opened it", async ({ page }) => {
    await openMenu(page, 375);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Menu" })).toBeHidden();
    await expect(page.getByRole("button", { name: "Abrir menu" })).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe(""); // the page behind scrolls again
  });

  test("given the menu is open, when Fechar is used, then focus returns to the trigger as well", async ({ page }) => {
    const dialog = await openMenu(page, 375);
    expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe("hidden");
    await dialog.getByRole("button", { name: "Fechar menu" }).click();
    await expect(page.getByRole("button", { name: "Abrir menu" })).toBeFocused();
  });

  test("given the menu links, when the keyboard is used, then Enter on a state link navigates to that state and the menu is closed", async ({ page }) => {
    const dialog = await openMenu(page, 375);
    await dialog.getByRole("link", { name: "Santa Catarina" }).focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/sul\/sc$/);
    await expect(page.getByRole("dialog", { name: "Menu" })).toBeHidden();
  });

  test("given a short viewport, when the list is scrolled to the end, then the last item is fully reachable above the bottom edge and the close row stays put", async ({ page }) => {
    const dialog = await openMenu(page, 320, 420);
    const close = dialog.getByRole("button", { name: "Fechar menu" });
    const closeBefore = (await close.boundingBox())!.y;
    const last = dialog.getByRole("link", { name: "Rio Grande do Sul" });
    await last.scrollIntoViewIfNeeded();
    const box = (await last.boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(420);
    expect((await close.boundingBox())!.y).toBe(closeBefore);
    await expect(close).toBeInViewport();
  });

  test("given the menu is open on a phone, when the window becomes desktop-wide, then the menu closes by itself", async ({ page }) => {
    await openMenu(page, 375);
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(page.getByRole("dialog", { name: "Menu" })).toBeHidden();
  });

  test("given the menu, when its contrast is measured, then text on the panel passes WCAG AA (default: the region's olive with white text)", async ({ page }) => {
    const dialog = await openMenu(page, 375);
    const colors = await dialog.evaluate((el) => ({ bg: getComputedStyle(el).backgroundColor, fg: getComputedStyle(el).color }));
    expect(colors).toEqual({ bg: "rgb(77, 84, 61)", fg: "rgb(255, 255, 255)" });
  });
});

test.describe("the rest of the header is untouched", () => {
  test("given a phone, when the header is read, then search and Meus Lugares keep their controls next to the menu button", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/sul");
    const header = page.locator("header.site-header");
    await expect(header.getByRole("button", { name: "Abrir menu" })).toBeVisible();
    await expect(header.getByRole("button", { name: "Buscar cidade" })).toBeVisible();
    await expect(header.getByRole("link", { name: /Meus Lugares/ })).toBeVisible();
    await expect(header.getByRole("link", { name: /Use Origens Sul, página inicial/ })).toBeVisible();
  });

  for (const width of [1280, 1440]) {
    test(`given ${width}px, when the header is read, then the desktop navigation, dropdown, search and Meus Lugares work and there is no menu button`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/sul");
      const header = page.locator("header.site-header");
      await expect(header.getByRole("button", { name: "Abrir menu" })).toBeHidden();
      const nav = header.getByRole("navigation", { name: "Principal" });
      await expect(nav.getByRole("link")).toHaveText(["Estilos", "Fala daqui", "Estados"]);
      await nav.getByText("Regiões", { exact: true }).click();
      await expect(nav.getByRole("link", { name: "Santa Catarina" })).toHaveAttribute("href", "/sul/sc");
      await expect(nav.getByRole("link", { name: "Ver estados" })).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(header.getByRole("button", { name: "Buscar cidade" })).toBeVisible();
      await expect(header.getByRole("link", { name: /Meus Lugares/ })).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    });
  }

  test("given no configuration, when the page renders, then the colours are exactly today's (olive header, black strip, ground page)", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/sul");
    await expect(page.locator("header.site-header")).toHaveCSS("background-color", "rgb(77, 84, 61)");
    await expect(page.locator("header.site-header")).toHaveCSS("color", "rgb(255, 255, 255)");
    await expect(page.locator(".on-ink").first()).toHaveCSS("background-color", "rgb(0, 0, 0)");
    expect(await page.locator("[data-region='sul']").evaluate((el) => el.getAttribute("style"))).not.toContain("--nav-");
  });
});
