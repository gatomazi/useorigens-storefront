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
    test(`given ${width}px, when the menu opens, then it is Sua cidade (the search), Comprar, Estados do Sul and Sua conta, each a list of real links, with no region block`, async ({ page }) => {
      const dialog = await openMenu(page, width);
      const sections = dialog.locator("[data-block]");
      await expect(sections).toHaveCount(4);
      // The store's account (the header has no room for a fourth icon on phones): the same entries as the store's own menu.
      await expect(sections.nth(3).getByRole("heading", { level: 2 })).toHaveText("Sua conta");
      await expect(sections.nth(3).getByRole("link")).toHaveText(["Meus pedidos", "Rastrear meu pedido", "Trocar meu pedido", "Avaliar meu pedido", "Entrar | Cadastrar"]);
      await expect(sections.nth(3).getByRole("link").first()).toHaveAttribute("href", /\/orders$/);
      // The first path: the visitor's own city, through the store's search (a button: it opens the search sheet).
      await expect(sections.nth(0).getByRole("heading", { level: 2 })).toHaveText("Sua cidade");
      await expect(sections.nth(0).getByRole("button", { name: /Cidade, estampa ou coleção/ })).toBeVisible();
      await expect(sections.nth(1).getByRole("heading", { level: 2 })).toHaveText("Comprar");
      await expect(sections.nth(2).getByRole("heading", { level: 2 })).toHaveText("Estados do Sul");
      await expect(sections.nth(1).getByRole("link")).toHaveText(["Estilos", "Fala daqui", "Estados"]);
      // Each state: its UF, its name and how many cities it has, as one link.
      await expect(sections.nth(2).getByRole("link")).toHaveText([/PR\s*Paraná\s*\d+ cidades/, /SC\s*Santa Catarina\s*\d+ cidades/, /RS\s*Rio Grande do Sul\s*\d+ cidades/]);
      await expect(sections.nth(2).getByRole("link").first()).toHaveAttribute("href", "/sul/pr");
      await expect(dialog.getByText("Explorar outras regiões")).toHaveCount(0);
      // states are not mixed into the primary list any more
      await expect(sections.nth(1).getByRole("link", { name: "Paraná" })).toHaveCount(0);
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
    // A state's link also says how many cities it has ("Paraná 399 cidades"): the states are matched by the start of their name.
    const y = async (name: string | RegExp) => (await dialog.getByRole("link", typeof name === "string" ? { name, exact: true } : { name }).boundingBox())!;
    const within = (await y(/^Santa Catarina/)).y - ((await y(/^Paraná/)).y + (await y(/^Paraná/)).height);
    const between = (await y(/^Paraná/)).y - ((await y("Estados")).y + (await y("Estados")).height);
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
  for (const width of [320, 375, 430]) {
    test(`given a ${width}px phone, when the header is read, then it is the menu, the search field in the middle and the brand's tag on the right`, async ({ page }) => {
      await page.setViewportSize({ width, height: 812 });
      await page.goto("/sul");
      const header = page.locator("header.site-header");
      const menu = header.getByRole("button", { name: "Abrir menu" });
      const bar = header.getByRole("button", { name: "Busque por lugar, tema ou coleção" });
      const home = header.getByRole("link", { name: "Use Origens Sul, página inicial" });
      for (const el of [menu, bar, home]) await expect(el).toBeVisible();
      // Meus Lugares and the icon search are not in a phone's header (the field took the middle; Meus Lugares is in the menu).
      await expect(header.getByRole("button", { name: "Buscar", exact: true })).toBeHidden();
      await expect(header.getByTestId("favorites-trigger")).toBeHidden();
      const [m, b, h] = await Promise.all([menu, bar, home].map((el) => el.boundingBox()));
      expect(m!.x + m!.width).toBeLessThanOrEqual(b!.x + 1);
      expect(b!.x + b!.width).toBeLessThanOrEqual(h!.x + 1);
      expect(h!.x + h!.width).toBeLessThanOrEqual(width);
      expect(b!.width).toBeGreaterThan(150);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    });
  }

  test("given a phone, when the search field is read, then it types what it finds, opens the search sheet and gives the focus back", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/sul");
    const bar = page.getByTestId("header-search-bar");
    const hint = bar.locator("[data-typing-hint]");
    await expect(hint).toHaveText("Busque por lugar");
    await expect(hint).toHaveText(/^Busque por (t|te|tem|tema)$/, { timeout: 6000 });
    await bar.click();
    const dialog = page.getByRole("dialog", { name: "Buscar na Use Origens" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("combobox").or(dialog.getByRole("searchbox")).or(dialog.locator("input")).first()).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(bar).toBeFocused();
  });

  test("given a phone with reduced motion, when the search field is read, then it says every kind of search at once, without typing", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/sul");
    const bar = page.getByTestId("header-search-bar");
    await expect(bar).toContainText("Busque por lugar, tema ou coleção");
    await expect(bar.locator(".typing-caret")).toHaveCount(0);
  });

  test("given a phone, when the menu opens, then Minhas Estampas is right under the search, with the number saved", async ({ page }) => {
    await page.addInitScript(() => {
      const item = (n: number) => ({ inkProductId: String(n), commerceStoreKey: "sul", title: "Ponto de Origem", context: "Florianópolis · SC", imageUrl: "https://gcp-images.majestic.ink.rsvcloud.com/x.webp", price: 109.9, addedAt: n });
      localStorage.setItem("origens:favorites:v1", JSON.stringify({ v: 1, items: [item(1), item(2)] }));
    });
    const dialog = await openMenu(page, 390);
    const favorites = dialog.getByTestId("menu-favorites");
    await expect(favorites).toHaveAttribute("href", "/sul/minhas-estampas");
    await expect(favorites).toContainText("Minhas Estampas");
    await expect(favorites).toContainText("2");
    await expect(dialog.locator('[data-block="search"] + [data-testid="menu-favorites"]')).toHaveCount(1);
    await favorites.click();
    await expect(page).toHaveURL(/\/sul\/minhas-estampas$/);
    await expect(dialog).toBeHidden();
  });

  for (const width of [1280, 1440]) {
    test(`given ${width}px, when the header is read, then the desktop navigation, dropdown, search and Minhas Estampas work and there is no menu button`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/sul");
      const header = page.locator("header.site-header");
      await expect(header.getByRole("button", { name: "Abrir menu" })).toBeHidden();
      const nav = header.getByRole("navigation", { name: "Principal" });
      // The "Estados" dropdown already leads to the state chooser: the home's own "Estados" link is left out of the bar (it stays in the phone menu).
      await expect(nav.getByRole("link")).toHaveText(["Estilos", "Fala daqui"]);
      await nav.locator("summary", { hasText: "Estados" }).click();
      await expect(nav.getByRole("link", { name: "Santa Catarina" })).toHaveAttribute("href", "/sul/sc");
      await expect(nav.getByRole("link", { name: "Ver estados" })).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(header.getByRole("button", { name: "Buscar", exact: true })).toBeVisible();
      await expect(header.getByRole("link", { name: /Minhas Estampas/ })).toBeVisible();
      // No setting (Menu › Ícones do topo): the three buttons on the right are the icon only, the word kept for screen readers.
      for (const id of ["favorites-trigger", "account-trigger"]) expect((await header.getByTestId(id).boundingBox())!.width, id).toBeLessThan(60);
      expect((await header.getByRole("button", { name: "Buscar", exact: true }).boundingBox())!.width).toBeLessThan(60);
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
