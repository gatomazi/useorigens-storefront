import { expect, test, type Page } from "@playwright/test";

/** The hero field is a trigger: it opens the search sheet (full screen on phones), where the real input lives. */
async function openHeroSearch(page: Page) {
  await page.getByRole("button", { name: /Busque sua cidade/ }).first().click();
  const dialog = page.getByRole("dialog", { name: "Buscar cidade" });
  await expect(dialog).toBeVisible();
  return dialog;
}

test.describe("/sul critical flows", () => {
  test("given the home page, when searching by mouse, then the chosen city opens its canonical page", async ({ page }) => {
    await page.goto("/sul");
    const dialog = await openHeroSearch(page);
    await dialog.getByRole("combobox").fill("tij");
    await dialog.getByRole("option", { name: /Tijucas/ }).first().click();
    await expect(page).toHaveURL(/\/sul\/sc\/tijucas$/);
    await expect(page.getByRole("heading", { level: 1, name: "Tijucas" })).toBeVisible();
  });

  test("given the search, when using only the keyboard and a nickname, then the city opens", async ({ page }) => {
    await page.goto("/sul");
    await openHeroSearch(page);
    await page.keyboard.type("floripa");
    await expect(page.getByRole("option").first()).toContainText("Florianópolis");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/sul\/sc\/florianopolis$/);
  });

  test("given an accent-free query, when searched, then the accented city leads with factual microcontext", async ({ page }) => {
    await page.goto("/sul");
    const dialog = await openHeroSearch(page);
    await dialog.getByRole("combobox").fill("florianopolis");
    const first = dialog.getByRole("option").first();
    await expect(first).toContainText("Florianópolis");
    // The subtitle is the IBGE intermediate region (2017 division), never invented.
    await expect(first).toContainText("Santa Catarina · Região de Florianópolis");
  });

  test("given a city that does not exist, when searched, then the empty state offers the states", async ({ page }) => {
    await page.goto("/sul");
    const dialog = await openHeroSearch(page);
    await dialog.getByRole("combobox").fill("zzzxq");
    await expect(dialog.getByText("Ainda não encontramos essa cidade.")).toBeVisible();
    await expect(dialog.getByRole("link", { name: "Santa Catarina" }).first()).toBeVisible();
  });

  test("given a city page, when opening a family, then the CTA goes to the real INK product with its real price", async ({ page }) => {
    await page.goto("/sul/sc/tijucas");
    await page.getByRole("link", { name: /Ponto de Origem/ }).first().click();
    await expect(page).toHaveURL(/\/sul\/sc\/tijucas\/ponto-de-origem$/);
    const cta = page.getByRole("link", { name: "Escolher tamanho na loja" });
    await expect(cta).toHaveAttribute("href", "https://www.usesul.com.br/usesul/product/tijucas-origem-sc");
    await expect(page.getByText("R$ 109,90").first()).toBeVisible();
  });

  test("given a city with a locality product, when opening it, then the locality is shown apart from the families", async ({ page }) => {
    await page.goto("/sul/rs/torres");
    await expect(page.getByRole("heading", { name: "Lugares de Torres" })).toBeVisible();
    await expect(page.getByText("Praia Paraíso")).toBeVisible();
    // The locality is never a family card and never a city of its own.
    await expect(page.getByRole("heading", { level: 3 })).toHaveCount(8);
  });

  test("given a city whose family has variants, when picking one, then price and CTA follow the selected product", async ({ page }) => {
    await page.goto("/sul/pr/pato-branco/ponto-de-origem");
    const cta = page.getByRole("link", { name: "Escolher tamanho na loja" });
    const before = await cta.getAttribute("href");
    await page.getByRole("button", { name: "Regional" }).click();
    await expect(page.getByRole("button", { name: "Regional" })).toHaveAttribute("aria-pressed", "true");
    const after = await cta.getAttribute("href");
    expect(after).not.toBe(before);
    expect(after).toMatch(/^https:\/\/www\.usesul\.com\.br\/usesul\/product\//);
  });

  test("given unknown places, when opened, then the user gets a helpful 404", async ({ page }) => {
    const bad = await page.goto("/sul/sc/cidade-que-nao-existe");
    expect(bad?.status()).toBe(404);
    await expect(page.getByText("Ainda não encontramos essa página.")).toBeVisible();
    const norte = await page.goto("/norte");
    expect(norte?.status()).toBe(404);
  });

  test("given a phone viewport, when loading /sul, then nothing overflows horizontally", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto("/sul");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBe(0);
  });

  test("given the header search, when opened and closed with Escape, then focus returns to the trigger", async ({ page }) => {
    await page.goto("/sul/rs/torres");
    const trigger = page.getByRole("button", { name: "Buscar cidade" });
    await trigger.click();
    await expect(page.getByRole("dialog", { name: "Buscar cidade" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Buscar cidade" })).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("given the header, when the page scrolls, then it becomes solid and returns to quiet at the top", async ({ page }) => {
    await page.goto("/sul");
    const header = page.locator("header.site-header");
    await expect(header).toHaveAttribute("data-scrolled", "false");
    await page.evaluate(() => window.scrollTo(0, 1200));
    await expect(header).toHaveAttribute("data-scrolled", "true");
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(header).toHaveAttribute("data-scrolled", "false");
  });

  test("given the mobile header search, when opened, then it fills the screen and results are keyboard reachable", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/sul/rs/torres");
    await page.getByRole("button", { name: "Buscar cidade" }).click();
    const dialog = page.getByRole("dialog", { name: "Buscar cidade" });
    await expect(dialog).toBeVisible();
    const box = await dialog.boundingBox();
    expect(box?.height).toBeGreaterThan(800);
    await page.keyboard.type("flo");
    await expect(page.getByRole("option").first()).toBeVisible();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/sul\/pr\//);
  });
});

test.describe("V2 regressions and regional rules", () => {
  test("BUG given a state page, when the search is used, then the input text is visible against the page", async ({ page }) => {
    await page.goto("/sul/sc");
    const input = page.getByRole("combobox");
    await input.fill("flo");
    const color = await input.evaluate((el) => getComputedStyle(el).color);
    // It used to be white on the #e5e5e5 ground.
    expect(color).not.toBe("rgb(255, 255, 255)");
    await expect(page.getByRole("option").first()).toContainText("Florianópolis");
  });

  test("BUG given the 404 page, when the search is shown, then its text is visible against the page", async ({ page }) => {
    await page.goto("/sul/sc/cidade-que-nao-existe");
    const color = await page.getByRole("combobox").evaluate((el) => getComputedStyle(el).color);
    expect(color).not.toBe("rgb(255, 255, 255)");
  });

  test("BUG given the mobile menu, when opened, then the close control is visible and closes it", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/sul");
    await page.getByRole("button", { name: "Abrir menu" }).click();
    const close = page.getByRole("button", { name: "Fechar menu" });
    await expect(close).toBeVisible();
    // It used to be black on the black sheet.
    expect(await close.evaluate((el) => getComputedStyle(el).color)).toBe("rgb(255, 255, 255)");
    const box = await close.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
    await close.click();
    await expect(page.getByRole("dialog", { name: "Menu" })).toBeHidden();
  });

  test("given a phone, when the home loads, then headline, search and the three DDD shirts fit the first screen", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/sul");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("De qual Sul");
    const search = page.getByRole("button", { name: /Busque sua cidade/ }).first();
    const searchBox = await search.boundingBox();
    expect(searchBox!.y + searchBox!.height).toBeLessThan(844);
    // Number, region and state travel together: the DDD is never shown alone.
    for (const [code, region, uf] of [["054", "Serra Gaúcha", "RS"], ["048", "Grande Florianópolis", "SC"], ["041", "Grande Curitiba", "PR"]]) {
      const item = page.locator("section").first().locator("li", { hasText: code });
      await expect(item).toContainText(region);
      await expect(item).toContainText(uf);
    }
    const lastCaption = await page.locator("section").first().locator("li").last().boundingBox();
    expect(lastCaption!.y + lastCaption!.height).toBeLessThan(844);
  });

  test("given the home, when 'Fala daqui' is shown, then every card carries the place it comes from", async ({ page }) => {
    await page.goto("/sul");
    const cards = page.locator("#fala li");
    const count = await cards.count();
    expect(count).toBeGreaterThan(5);
    for (let i = 0; i < count; i++) await expect(cards.nth(i).locator(".t-place")).not.toBeEmpty();
    // The three states are all represented, not just "bah".
    const text = (await page.locator("#fala").innerText()).toLowerCase();
    for (const state of ["rio grande do sul", "paraná", "· sc"]) expect(text).toContain(state);
  });

  test("given a city with local voice in the catalog, when opened, then 'Fala de <cidade>' appears; without it, it does not", async ({ page }) => {
    await page.goto("/sul/sc/florianopolis");
    await expect(page.getByRole("heading", { name: "Fala de Florianópolis" })).toBeVisible();
    await expect(page.getByText("Tax Tolo").first()).toBeVisible();
    await page.goto("/sul/rs/torres");
    await expect(page.getByRole("heading", { name: /Fala de/ })).toHaveCount(0);
  });

  test("given the city page, when read, then it shows the IBGE region and no repeated 'Escolha como vestir' heading", async ({ page }) => {
    await page.goto("/sul/rs/torres");
    await expect(page.getByText("Rio Grande do Sul · Região de Porto Alegre")).toBeVisible();
    await expect(page.getByText(/Escolha como vestir Torres/i)).toHaveCount(0);
    await expect(page.getByRole("heading", { name: /Mais da Região de Porto Alegre/ })).toBeVisible();
  });

  test("given a state page on a phone, when loaded, then it is short, grouped by IBGE regions and a chip opens a group", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/sul/sc");
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    expect(height).toBeLessThan(2600);
    await expect(page.locator("main details")).toHaveCount(7);
    await page.getByRole("link", { name: /^Região de Florianópolis/ }).first().click();
    await expect(page.locator("details#regiao-de-florianopolis")).toHaveAttribute("open", "");
    await expect(page.locator("details#regiao-de-florianopolis").getByRole("link", { name: "Florianópolis" })).toBeVisible();
  });

  test("given a city page, when loaded, then the city name is set in the display face at scale", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto("/sul/rs/torres");
    const h1 = page.getByRole("heading", { level: 1, name: "Torres" });
    const style = await h1.evaluate((el) => ({ size: parseFloat(getComputedStyle(el).fontSize), transform: getComputedStyle(el).textTransform }));
    // It once fell back to body size because its class was missing.
    expect(style.size).toBeGreaterThanOrEqual(48);
    expect(style.transform).toBe("uppercase");
  });

  test("given the longest city name on a tablet, when the city page loads, then nothing overflows horizontally", async ({ page }) => {
    for (const width of [360, 768, 1024]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/sul/sc/florianopolis");
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `overflow at ${width}px`).toBe(0);
    }
  });

  test("given a small phone, when a variant page loads, then the purchase button is inside the first screen", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto("/sul/pr/pato-branco/ponto-de-origem");
    const box = await page.getByRole("link", { name: "Escolher tamanho na loja" }).boundingBox();
    expect(box!.y + box!.height).toBeLessThanOrEqual(780);
  });

  test("given the state cards on the home, when read, then each state has IBGE region shortcuts and its own clean product", async ({ page }) => {
    await page.goto("/sul");
    const sc = page.locator("#estados article", { hasText: "Santa Catarina" });
    // The capital's IBGE region always comes first.
    await expect(sc.getByRole("link", { name: "Região de Florianópolis" })).toBeVisible();
    await expect(sc.getByRole("link", { name: /Santa Catarina \| Clean/ })).toHaveAttribute("href", /usesul\.com\.br/);
  });
});
