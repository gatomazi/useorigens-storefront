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

  test("given an accent-free query, when searched, then the accented city leads with editorial microcontext", async ({ page }) => {
    await page.goto("/sul");
    const dialog = await openHeroSearch(page);
    await dialog.getByRole("combobox").fill("florianopolis");
    const first = dialog.getByRole("option").first();
    await expect(first).toContainText("Florianópolis");
    // The subtitle is the editorial mesoregion (ADR 0004), never invented.
    await expect(first).toContainText("Santa Catarina · Grande Florianópolis");
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

  test("given the top menu, when read, then it carries the region's primary colour with white text, and the announcement strip above it stays black", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/sul");
    const header = page.locator("header.site-header");
    // Sul's primary colour (src/lib/theme/region-theme.ts).
    await expect(header).toHaveCSS("background-color", "rgb(77, 84, 61)");
    const navLink = header.getByRole("link", { name: "Estilos" });
    await expect(navLink).toHaveCSS("color", "rgb(255, 255, 255)");
    const announcement = page.locator(".on-ink").first();
    await expect(announcement).toHaveCSS("background-color", "rgb(0, 0, 0)");
    // The region switcher panel is its own white surface: it must reset to dark text, not inherit the header's white.
    await header.getByText("Sul", { exact: true }).click();
    const panelLink = header.getByRole("link", { name: "Norte" });
    await expect(panelLink).toBeVisible();
    await expect(panelLink).toHaveCSS("color", "rgb(0, 0, 0)");
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

  test("given the hero, when read, then it carries the new copy and the three family cards with name, city/UF and price", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/sul");
    // The <br/> between the two lines drops the space in the accessible text ("...lugar,do seu...").
    await expect(page.getByRole("heading", { level: 1 })).toContainText("O seu lugar,do seu jeito.");
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    const hero = page.locator("section").first();
    await expect(hero).toContainText("Encontre sua cidade e vista o lugar que faz parte de você.");
    await expect(hero).toContainText("1.191 cidades do Sul em camiseta.");
    await expect(hero.getByRole("link", { name: "Ou explore por estado." })).toHaveAttribute("href", "#estados");
    // The old DDD/"jeito de falar" line is gone.
    await expect(hero).not.toContainText("DDDs");
    // The hero leads with the three commercial families, in this order, each a real product of a real city.
    const items = hero.locator("li");
    await expect(items).toHaveCount(3);
    const expected = [
      ["Ponto de Origem", "Porto Alegre · RS", "/sul/rs/porto-alegre/ponto-de-origem"],
      ["Feito em", "Curitiba · PR", "/sul/pr/curitiba/feito-em"],
      ["Coordenadas", "Joinville · SC", "/sul/sc/joinville/coordenadas"],
    ];
    for (const [i, [family, place, href]] of expected.entries()) {
      await expect(items.nth(i)).toContainText(family);
      await expect(items.nth(i)).toContainText(place);
      // Price exactly as INK returns it.
      await expect(items.nth(i)).toContainText("R$ 109,90");
      await expect(items.nth(i).getByRole("link")).toHaveAttribute("href", href);
    }
    // DDD is not a hero protagonist; it keeps its own section.
    await expect(hero.getByText("054")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "O número de cada região" })).toBeVisible();
  });

  test("given phones, when the hero loads, then headline and search lead, the cards follow at a readable size and the row scrolls", async ({ page }) => {
    for (const [width, height] of [[375, 812], [390, 844], [430, 932]]) {
      await page.setViewportSize({ width, height });
      await page.goto("/sul");
      const hero = page.locator("section").first();
      const search = hero.getByRole("button", { name: /Busque sua cidade/ }).first();
      const searchBox = (await search.boundingBox())!;
      expect(searchBox.y + searchBox.height, `search inside the first screen at ${width}px`).toBeLessThan(height);
      const first = (await hero.locator("li").first().boundingBox())!;
      // Cards come after the search, are not thumbnails (>= 200px wide) and show their price inside the first screen.
      expect(first.y).toBeGreaterThan(searchBox.y + searchBox.height);
      expect(first.width, `card width at ${width}px`).toBeGreaterThanOrEqual(200);
      const price = (await hero.locator("li").first().getByText("R$ 109,90").boundingBox())!;
      expect(price.y + price.height, `first card price inside the first screen at ${width}px`).toBeLessThan(height);
      // Horizontal row: the list scrolls sideways and the page itself does not.
      const scrolls = await hero.locator("ul").evaluate((el) => el.scrollWidth > el.clientWidth);
      expect(scrolls, `card row scrolls at ${width}px`).toBe(true);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `page overflow at ${width}px`).toBe(0);
    }
  });

  test("given a desktop, when the hero loads, then the three cards sit in one row on the right of the text", async ({ page }) => {
    // The entrance animation moves the cards; measure their resting positions.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/sul");
    const hero = page.locator("section").first();
    const boxes = await Promise.all([0, 1, 2].map(async (i) => (await hero.locator("li").nth(i).boundingBox())!));
    const search = (await hero.getByRole("button", { name: /Busque sua cidade/ }).first().boundingBox())!;
    // One row (same top), left to right, all to the right of the search.
    expect(new Set(boxes.map((b) => Math.round(b.y))).size).toBe(1);
    expect(boxes[0].x).toBeLessThan(boxes[1].x);
    expect(boxes[1].x).toBeLessThan(boxes[2].x);
    expect(boxes[0].x).toBeGreaterThan(search.x + search.width);
    // No horizontal scrolling of the list on desktop.
    expect(await hero.locator("ul").evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(false);
  });

  test("given the hero, when a regional background is set, then it is decorative, sits behind the content and never breaks layout", async ({ page }) => {
    for (const width of [360, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      // domcontentloaded, not load: the page also carries several lazy background photos (state cards, Fala daqui)
      // that a real user never waits on either — only the DOM and computed styles checked below matter here.
      await page.goto("/sul", { waitUntil: "domcontentloaded" });
      const hero = page.locator("section").first();
      const bg = hero.locator("picture img");
      await expect(bg).toHaveCount(1);
      // Decorative: empty alt, and it must not sit on top of the content.
      await expect(bg).toHaveAttribute("alt", "");
      const behind = await bg.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.closest("picture") === null;
      });
      expect(behind, `background must be under the content at ${width}px`).toBe(true);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `overflow at ${width}px`).toBe(0);
    }
    // The headline stays black on the light, warm wash (measured contrast: docs/design/regional-color-system-sul.md).
    const color = await page.getByRole("heading", { level: 1 }).evaluate((el) => getComputedStyle(el).color);
    expect(color).toBe("rgb(0, 0, 0)");
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

  test("given the city page, when read, then it shows the editorial mesoregion and no repeated 'Escolha como vestir' heading", async ({ page }) => {
    await page.goto("/sul/rs/torres");
    await expect(page.getByText("Rio Grande do Sul · Metropolitana de Porto Alegre")).toBeVisible();
    await expect(page.getByText(/Escolha como vestir Torres/i)).toHaveCount(0);
    await expect(page.getByRole("heading", { name: /Mais de Metropolitana de Porto Alegre/ })).toBeVisible();
  });

  test("given a state page on a phone, when loaded, then it is short, grouped by mesoregions and a chip opens a group", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/sul/sc");
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    expect(height).toBeLessThan(2600);
    await expect(page.locator("main details")).toHaveCount(6);
    await page.getByRole("link", { name: /^Grande Florianópolis/ }).first().click();
    await expect(page.locator("details#grande-florianopolis")).toHaveAttribute("open", "");
    await expect(page.locator("details#grande-florianopolis").getByRole("link", { name: "Florianópolis" })).toBeVisible();
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
      // domcontentloaded, not load: only layout/overflow is asserted, not full image bytes.
      await page.goto("/sul/sc/florianopolis", { waitUntil: "domcontentloaded" });
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

  test("given the state cards on the home, when read, then each state has mesoregion shortcuts with counts and its own clean product", async ({ page }) => {
    await page.goto("/sul");
    const sc = page.locator("#estados article", { hasText: "Santa Catarina" });
    // The capital's mesoregion always comes first.
    const floripaChip = sc.getByRole("link", { name: /^Grande Florianópolis/ });
    await expect(floripaChip).toBeVisible();
    await expect(floripaChip).toContainText("21");
    await expect(sc.getByRole("link", { name: /Santa Catarina \| Clean/ })).toHaveAttribute("href", /usesul\.com\.br/);
  });

  test("given the styles grid, when read, then the eight families lead with the three commercial ones and every card is the same size", async ({ page }) => {
    await page.goto("/sul/sc/florianopolis");
    const grid = page.locator('section[aria-labelledby="styles-title"] ul').first();
    const cards = grid.locator("> li");
    await expect(cards).toHaveCount(8);
    const names = await cards.locator("h3").allTextContents();
    expect(names).toEqual(["Ponto de Origem", "Feito em", "Coordenadas", "Legado", "Território", "Tipografia", "Traço", "Gentílico"]);
    // No card is bigger than another: same column span, same image box.
    const boxes = await cards.evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().width)));
    expect(new Set(boxes).size, `all card widths equal, got ${boxes.join(",")}`).toBe(1);
  });

  test("given a phone, when the styles grid loads, then it is a two-column grid with no description and no horizontal scroll", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/sul");
    const grid = page.locator('section[aria-labelledby="styles-title"] ul').first();
    await expect(grid).toHaveCSS("display", "grid");
    const cards = grid.locator("> li");
    const boxes = await cards.evaluateAll((els) => els.slice(0, 4).map((el) => Math.round(el.getBoundingClientRect().x)));
    // Two distinct x positions (two columns), each repeated.
    expect(new Set(boxes).size).toBe(2);
    await expect(cards.first().locator(".t-caption").first()).toBeHidden();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBe(0);
  });

  test("given the home, when 'Redesenhos do Sul' is shown, then it is a separate editorial trail of real products, never mixed with the eight base families", async ({ page }) => {
    await page.goto("/sul");
    const section = page.locator("#redesenhos");
    await expect(section.getByRole("heading", { name: "Redesenhos do Sul" })).toBeVisible();
    const items = section.locator("[role=region] li");
    const count = await items.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      const item = items.nth(i);
      await expect(item.locator("a")).toHaveAttribute("href", /^https:\/\/www\.usesul\.com\.br\/usesul\/product\//);
      // Intl.NumberFormat("pt-BR") uses a non-breaking space after "R$", not a regular one.
      await expect(item.getByText(/^R\$\s*\d/)).toBeVisible();
    }
    // None of the eight base family names appear as a card title here (it is a parallel trail, not a ninth family).
    const titles = await items.locator("h3").allTextContents();
    for (const base of ["Ponto de Origem", "Feito em", "Coordenadas", "Legado", "Território", "Tipografia", "Traço", "Gentílico"]) {
      expect(titles).not.toContain(base);
    }
  });

  test("given a phone, when the states section loads, then it is a single-open accordion, not a swipe row", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/sul");
    const section = page.locator("#estados");
    await expect(section.locator("ul.md\\:grid")).toBeHidden();
    const accordion = section.locator("div.md\\:hidden");
    const items = accordion.locator("details");
    await expect(items).toHaveCount(3);
    // Closed by default: compact.
    for (let i = 0; i < 3; i++) expect(await items.nth(i).evaluate((el: HTMLDetailsElement) => el.open)).toBe(false);
    await items.nth(0).locator("summary").click();
    expect(await items.nth(0).evaluate((el: HTMLDetailsElement) => el.open)).toBe(true);
    // Opening a second one closes the first (native `name` grouping — only one state open at a time).
    await items.nth(1).locator("summary").click();
    expect(await items.nth(1).evaluate((el: HTMLDetailsElement) => el.open)).toBe(true);
    expect(await items.nth(0).evaluate((el: HTMLDetailsElement) => el.open)).toBe(false);
    // Expanded content: regions and a link to the full state page.
    await expect(items.nth(1).getByRole("link", { name: /Ver todas as cidades/ })).toBeVisible();
  });

  test("given a desktop, when the states section loads, then it is the card grid, not the accordion", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/sul");
    const section = page.locator("#estados");
    await expect(section.locator("ul.md\\:grid")).toBeVisible();
    await expect(section.locator("div.md\\:hidden")).toBeHidden();
  });

  test("given the PDP, when read, then title, versions, price and CTA sit together as one close block", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/sul/pr/pato-branco/ponto-de-origem");
    const title = (await page.getByRole("heading", { level: 1 }).boundingBox())!;
    const price = (await page.getByText("R$ 109,90").first().boundingBox())!;
    const cta = (await page.getByRole("link", { name: "Escolher tamanho na loja" }).boundingBox())!;
    // The whole decision block (title to CTA) is compact, not spread over the page.
    expect(cta.y + cta.height - title.y).toBeLessThan(420);
    expect(price.y).toBeGreaterThan(title.y);
    expect(cta.y).toBeGreaterThan(price.y);
  });

  test("given the home, when read, then the official section order is Hero, 8 estilos, Da Nossa Terra, Estados, Redesenhos, Feito Para Você, Fala daqui, DDD, Campanha", async ({ page }) => {
    await page.goto("/sul");
    // "Cidades para começar" stays removed (CLAUDE_HOME_SECTION_ORDER_FINAL.md): search resolves city discovery.
    await expect(page.getByRole("heading", { name: "Cidades para começar" })).toHaveCount(0);
    const ids = await page.evaluate(() =>
      [...document.querySelectorAll("main > section")].map((el) => el.id || el.getAttribute("aria-labelledby") || el.className.slice(0, 30)),
    );
    const at = (needle: string) => ids.findIndex((v) => v.includes(needle));
    const order = ["estilos", "terra", "estados", "redesenhos", "feito-para-voce", "fala", "geografia"];
    const positions = order.map(at);
    expect(positions.every((p) => p !== -1), `all sections found in ${JSON.stringify(ids)}`).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  test("given 'Da Nossa Terra', when read, then it shows real state-identity products balanced across the three states, never a flag/map product", async ({ page }) => {
    await page.goto("/sul");
    const section = page.locator("#terra");
    await expect(section.getByRole("heading", { name: "Da Nossa Terra" })).toBeVisible();
    const items = section.locator("[role=region] li");
    const count = await items.count();
    expect(count).toBeGreaterThanOrEqual(4);
    expect(count).toBeLessThanOrEqual(6);
    const names = await items.locator("h3").allTextContents();
    // Every card names a state (never "Made in", a flag-colours product).
    for (const name of names) {
      expect(name).not.toMatch(/^Made in/i);
      expect(name).toMatch(/Paraná|Santa Catarina|Rio Grande do Sul|Paranaense|Catarinense|Gaúcho/);
    }
    // Balanced: all three states represented.
    const text = (await section.innerText()).toLowerCase();
    for (const state of ["paraná", "catarin", "gaúch"]) expect(text).toContain(state);
  });

  test("given 'Feito Para Você', when read, then every card is a real product of the Lenda line, never a city/map personalization", async ({ page }) => {
    await page.goto("/sul");
    const section = page.locator("#feito-para-voce");
    await expect(section.getByRole("heading", { name: "Feito Para Você" })).toBeVisible();
    await expect(section).toContainText("Escolha a combinação que mais parece com quem vai vestir.");
    const items = section.locator("[role=region] li");
    const count = await items.count();
    expect(count).toBeGreaterThan(0);
    const names = await items.locator("h3").allTextContents();
    for (const name of names) {
      // Real "Lenda" personas (Pai/Mãe/Marido/Esposa/Filho or similar), never Ponto de Origem or a city map.
      expect(name).not.toMatch(/mapa|origem|coordenadas/i);
    }
    for (let i = 0; i < count; i++) {
      const item = items.nth(i);
      await expect(item.getByText("Lenda")).toBeVisible();
      await expect(item.locator("a")).toHaveAttribute("href", /^https:\/\/www\.usesul\.com\.br\/usesul\/product\//);
    }
  });

  test("given the category sections, when read, then each has a real, verified 'Ver todos' link, and DDD (which has no distinct real collection) has none", async ({ page }) => {
    await page.goto("/sul");
    const cases: [string, string][] = [
      ["#terra", "https://www.usesul.com.br/usesul/collections/da-nossa-terra"],
      ["#redesenhos", "https://www.usesul.com.br/usesul/collections/do-nosso-jeito"],
      ["#feito-para-voce", "https://www.usesul.com.br/usesul/collections/feito-para-voce"],
      ["#fala", "https://www.usesul.com.br/usesul/collections/fala-daqui"],
    ];
    for (const [selector, href] of cases) {
      const link = page.locator(selector).getByRole("link", { name: "Ver todos" });
      await expect(link).toBeVisible();
      await expect(link).toHaveAttribute("href", href);
      const box = (await link.boundingBox())!;
      expect(box.height, `${selector} tap target height`).toBeGreaterThanOrEqual(44);
    }
    await expect(page.locator("#geografia").getByRole("link", { name: "Ver todos" })).toHaveCount(0);
  });
});
