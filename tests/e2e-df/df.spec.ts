import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

/**
 * Federal District administrative regions, end to end (dev server in CMS dev mode over a throw-away sandbox; run with `npm run test:df`).
 * Real catalog: every RA below (Águas Claras, Taguatinga, Ceilândia, Gama, Sobradinho II…) has products in the locally synced snapshot.
 * Set DF_CAPTURE_DIR to write the screenshots the round's report links to.
 */
const CAPTURE = process.env.DF_CAPTURE_DIR ?? path.join(process.cwd(), "docs", "screenshots", "df-administrative-regions");
mkdirSync(CAPTURE, { recursive: true });
/** The consent banner would cover the bottom of every public capture: reject it first (a no-op on the CMS, which has none). */
async function shot(page: Page, name: string, { fullPage = false }: { fullPage?: boolean } = {}) {
  const reject = page.getByRole("button", { name: "Rejeitar" });
  // Short budget: with a modal <dialog> open the banner is inert and cannot be clicked; the capture is then taken as it is.
  if (await reject.isVisible().catch(() => false)) await reject.click({ timeout: 2_000 }).catch(() => undefined);
  await page.screenshot({ path: path.join(CAPTURE, name), fullPage, animations: "disabled" });
}

const hydrated = (page: Page) => page.waitForFunction(() => document.documentElement.dataset.hydrated === "true", undefined, { timeout: 180_000 });
async function open(page: Page, url: string) {
  const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 300_000 });
  await hydrated(page);
  return response;
}
async function chooseRegion(page: Page, name: "Sul" | "Norte" | "Centro-Oeste") {
  await open(page, "/admin");
  await page.getByRole("form", { name: "Região em edição" }).getByRole("button", { name: new RegExp(`^${name}`) }).click();
  await expect(page.getByRole("form", { name: "Região em edição" }).getByRole("button", { name: new RegExp(`^${name}`) })).toHaveAttribute("aria-pressed", "true");
}
const flash = (page: Page, text: RegExp) => page.getByRole("status").locator("p", { hasText: text });
const status = async (page: Page, url: string) => (await page.request.get(url, { timeout: 300_000 })).status();

async function launch(page: Page, name: "Norte" | "Centro-Oeste") {
  await chooseRegion(page, name);
  await open(page, "/admin/home");
  await page.getByRole("button", { name: "Criar home inicial" }).click();
  await expect(flash(page, /Home inicial criada no rascunho/)).toBeVisible();
  await open(page, "/admin/publicar");
  await expect(page.getByText(/Ainda não dá para lançar/), "the region must be launchable with the local catalog").toHaveCount(0);
  await page.getByRole("button", { name: `Lançar ${name} ao público` }).click();
  await expect(flash(page, new RegExp(`${name} lançada publicamente`))).toBeVisible({ timeout: 300_000 });
}

test.describe.configure({ mode: "serial" });

test("given a fresh sandbox, when Centro-Oeste and Norte are launched through the CMS, then both are public", async ({ page }) => {
  expect(await status(page, "/centro-oeste")).toBe(404);
  await launch(page, "Centro-Oeste");
  await launch(page, "Norte");
  expect(await status(page, "/centro-oeste")).toBe(200);
  expect(await status(page, "/norte")).toBe(200);
});

test.describe("CMS", () => {
  const positions = (page: Page) => page.getByRole("list").filter({ has: page.getByText("Posição 1") }).locator("> li");

  async function search(page: Page, query: string) {
    const slot = positions(page).nth(0);
    const opener = slot.getByRole("button", { name: /Escolher produto|Substituir/ });
    if (!(await slot.getByLabel(/Buscar por cidade/).isVisible())) await opener.click();
    await slot.getByLabel(/Buscar por cidade/).fill(query);
    return slot;
  }

  test("given the Centro-Oeste hero, when an RA is searched, then its products are offered, labelled as an administrative region, and can be chosen", async ({ page }) => {
    await chooseRegion(page, "Centro-Oeste");
    await open(page, "/admin/home/seed-hero");

    // Taguatinga: 4 real products (Feito em, Coordenadas and two Ponto de Origem), every one of them Taguatinga's.
    let slot = await search(page, "taguatinga");
    let results = slot.getByRole("list", { name: "Resultados" }).getByRole("listitem");
    await expect(results.first()).toBeVisible({ timeout: 60_000 });
    await expect(results).toHaveCount(4);
    for (const text of await results.allInnerTexts()) {
      expect(text).toContain("Taguatinga");
      expect(text).toContain("Região Administrativa");
      expect(text).not.toContain("Brasília");
    }
    await shot(page, "cms-busca-taguatinga.png", { fullPage: true });

    // Águas Claras, with and without the accent: the same 3 products.
    for (const query of ["águas claras", "aguas claras"]) {
      slot = await search(page, query);
      results = slot.getByRole("list", { name: "Resultados" }).getByRole("listitem");
      await expect(results).toHaveCount(3, { timeout: 60_000 });
      for (const text of await results.allInnerTexts()) expect(text).toContain("Águas Claras");
    }

    // Brasília keeps working, and only Brasília's own product comes back.
    slot = await search(page, "brasília");
    results = slot.getByRole("list", { name: "Resultados" }).getByRole("listitem");
    await expect(results).toHaveCount(2, { timeout: 60_000 }); // Gentílico (Brasiliense) is not "Brasília"; Ponto de Origem is the only one named so
    for (const text of await results.allInnerTexts()) {
      expect(text).toContain("Brasília");
      expect(text).not.toContain("Região Administrativa");
    }

    // Choosing an RA product saves it as the hero card, which links to the RA's own route.
    slot = await search(page, "ceilândia coordenadas");
    const list = slot.getByRole("list", { name: "Resultados" });
    await expect(list.getByRole("listitem")).toHaveCount(1, { timeout: 60_000 }); // the previous query's results are gone: only Ceilândia's Coordenadas
    await expect(list).toContainText("Ceilândia");
    const first = list.getByRole("button", { name: "Usar aqui" }).first();
    await expect(first).toBeVisible({ timeout: 60_000 });
    const saved = page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/admin/home/"), { timeout: 120_000 });
    await first.click();
    await saved;
    await expect(slot).toContainText("Disponível na loja");
    await page.waitForLoadState("networkidle");
    await hydrated(page);
    const href = await page.frameLocator('iframe[data-preview="desktop"]').locator('section[aria-labelledby="hero-title"] ul li a').first().getAttribute("href", { timeout: 300_000 });
    expect(href).toBe("/centro-oeste/df/ceilandia/coordenadas");
    await shot(page, "cms-hero-ra-escolhida.png", { fullPage: true });
  });
});

test.describe("public search", () => {
  test("given the header search, when an RA is typed, then it is listed as a Região Administrativa (not a city) and the click opens its route", async ({ page }) => {
    await open(page, "/centro-oeste");
    await page.getByRole("button", { name: /Busque sua cidade, região ou estampa/ }).first().click();
    const dialog = page.getByRole("dialog", { name: "Buscar na Use Origens" });
    await expect(dialog.getByRole("combobox")).toHaveAttribute("placeholder", "Busque uma cidade, região ou estampa…");
    await dialog.getByRole("combobox").fill("aguas claras");
    // The place itself (its designs, "Águas Claras · Traço"…, are listed after it in their own group).
    const option = dialog.locator('[data-result-kind="locality"]', { hasText: "Águas Claras" });
    await expect(option).toBeVisible();
    await expect(option).toContainText("Distrito Federal · Região Administrativa");
    await expect(option).not.toContainText(/cidade|município/i);
    await shot(page, "busca-publica-aguas-claras.png");
    await option.click();
    await page.waitForURL(/\/centro-oeste\/df\/aguas-claras$/);
    await hydrated(page);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Águas Claras");
  });

  test("given other queries, when typed, then Brasília is still found as a place, another RA by its first words, and the state offers Brasília + RAs", async ({ page }) => {
    await open(page, "/centro-oeste/df");
    // The state page carries the search inline (no dialog to open).
    const input = page.getByRole("combobox").first();
    await input.fill("brasilia");
    await expect(page.getByRole("option", { name: /^Brasília/ }).first()).toBeVisible();
    await expect(page.getByRole("option", { name: /^Brasília/ }).first()).not.toContainText("Região Administrativa");
    await input.fill("sol nascente");
    await expect(page.locator('[data-result-kind="locality"]', { hasText: "Sol Nascente/Pôr do Sol" })).toContainText("Região Administrativa");
    await input.fill("distrito");
    await expect(page.locator('[data-result-kind="state"]', { hasText: "Distrito Federal" })).toContainText("Ver as localidades do estado");
  });

  test("given the product search, when an RA is searched, then only its own products come back, and Brasília's search does not list them", async ({ page }) => {
    await open(page, "/centro-oeste/busca?q=taguatinga");
    const cards = page.locator("main ul li");
    await expect(cards.first()).toBeVisible();
    expect(await cards.count()).toBe(4);
    for (const text of await cards.allInnerTexts()) expect(text).toContain("Taguatinga · DF");

    // The results stream in behind a loading state: wait for them, then count.
    await open(page, "/centro-oeste/busca?q=aguas+claras");
    await expect(cards.first()).toBeVisible();
    expect(await cards.count()).toBe(3);

    await open(page, "/centro-oeste/busca?q=brasilia");
    await expect(cards.first()).toBeVisible();
    const brasilia = await cards.allInnerTexts();
    expect(brasilia.length).toBeGreaterThan(0);
    for (const text of brasilia) expect(text).not.toMatch(/Taguatinga|Águas Claras|Ceilândia|Gama/);
  });
});

test.describe("DF pages", () => {
  test("given the DF state page, when opened, then the RAs are its places and its products, listed A–Z like a state's cities, never 'municípios' or 'N cidades'", async ({ page }) => {
    await open(page, "/centro-oeste/df");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Distrito Federal");
    await expect(page.locator("main")).toContainText("36 localidades");
    const text = await page.locator("main").innerText();
    expect(text).not.toMatch(/munic[ií]pio/i);
    expect(text).not.toMatch(/\d+\s+cidades/i);
    await expect(page.getByRole("region", { name: "Localidades do estado" })).toBeVisible();
    // Like GO: no "by region" grouping, just the places A–Z. 36 in all (35 RAs + Brasília), each opening its own page.
    await expect(page.getByRole("button", { name: "Por região" })).toHaveCount(0);
    await expect(page.locator("main details ul li a")).toHaveCount(36);
    await expect(page.locator("details#letra-a summary")).toContainText("4 localidades");
    await page.locator("details#letra-a summary").click();
    await expect(page.locator("details#letra-a").getByRole("link", { name: "Águas Claras", exact: true })).toHaveAttribute("href", "/centro-oeste/df/aguas-claras");
    // "Destaques do Distrito Federal" are the RAs' products (one per RA), none of Brasília's.
    const showcase = page.locator('section[aria-labelledby="showcase-title"]');
    await expect(showcase).toBeVisible();
    const items = await showcase.locator('a[href^="https://www.usecentro.com.br/"]').evaluateAll((els) => els.map((e) => e.textContent ?? ""));
    expect(items.length).toBeGreaterThanOrEqual(4);
    for (const text of items) expect(text).not.toContain("Brasília");
    await shot(page, "pagina-df.png", { fullPage: true });
    await page.locator("details#letra-t").click();
    await page.locator("details#letra-t").getByRole("link", { name: "Taguatinga", exact: true }).click();
    await page.waitForURL(/\/centro-oeste\/df\/taguatinga$/);
  });

  test("given an RA page, when opened, then it uses the same renderer with the RA's own products, the right subtitle and SEO", async ({ page }) => {
    const response = await open(page, "/centro-oeste/df/aguas-claras");
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Águas Claras");
    await expect(page.locator("section").first()).toContainText("Distrito Federal · Região Administrativa");
    await expect(page.getByRole("heading", { name: "Estilos" })).toBeVisible();
    // Real Águas Claras products only: 3 styles, each linking to the RA's own INK product and to its own page.
    const inkLinks = await page.locator('main a[href^="https://www.usecentro.com.br/"]').evaluateAll((els) => els.map((e) => e.getAttribute("href")!));
    // The RA also gets the garment-type tabs (linked by the product's own INK cluster): 3 classic styles + one piece per other type, every one of them Águas Claras'.
    expect(inkLinks.length).toBeGreaterThanOrEqual(3);
    for (const href of inkLinks) expect(href).toContain("aguas-claras");
    await expect(page.getByRole("tab", { name: /Camiseta clássica/ })).toBeVisible();
    // Other RAs' and Brasília's products never leak in.
    const all = await page.locator("main").innerHTML();
    for (const other of ["taguatinga", "ceilandia", "gama", "brasilia-origem", "sobradinho"]) expect(all).not.toContain(`/product/${other}`);
    await expect(page).toHaveTitle(/^Camisetas de Águas Claras, DF/);
    expect(await page.locator('link[rel="canonical"]').getAttribute("href")).toMatch(/\/centro-oeste\/df\/aguas-claras$/);
    expect(await page.locator('meta[name="description"]').getAttribute("content")).toContain("Região Administrativa do Distrito Federal");
    // Links to the other RAs and back to Brasília; favorites and tracking come from the shared renderer.
    await expect(page.getByRole("heading", { name: "Outras Regiões Administrativas" })).toBeVisible();
    await expect(page.locator("main").getByRole("link", { name: "Brasília", exact: true })).toHaveAttribute("href", "/centro-oeste/df/brasilia");
    await shot(page, "pagina-ra-aguas-claras.png", { fullPage: true });
    // The RA's own style page.
    const style = await open(page, "/centro-oeste/df/aguas-claras/coordenadas");
    expect(style?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Coordenadas");
    await expect(page.locator("main")).toContainText("Águas Claras, Distrito Federal · Região Administrativa");
  });

  test("given Brasília, when opened, then it is still a city page with its own products, linking to the RAs but showing none of their products", async ({ page }) => {
    const response = await open(page, "/centro-oeste/df/brasilia");
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Brasília");
    const inkLinks = await page.locator('main a[href^="https://www.usecentro.com.br/"]').evaluateAll((els) => els.map((e) => e.getAttribute("href")!));
    expect(inkLinks.length).toBeGreaterThan(0);
    // Brasília's own two styles (and their garment pieces, by cluster): every link is Brasília's, none is an RA's.
    for (const href of inkLinks) {
      expect(href).toContain("brasil");
      expect(href).not.toMatch(/taguatinga|aguas-claras|ceilandia|gama|sobradinho/);
    }
    await expect(page.getByRole("heading", { name: /Regiões Administrativas do Distrito Federal/ })).toBeVisible();
    await expect(page.locator("#regions-title").locator("xpath=../ul/li/a")).toHaveCount(36); // 35 RAs + "Ver todas"
  });

  test("given a 375 px phone, when the DF state page and an RA page are opened, then nothing overflows and the search stays reachable", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    for (const url of ["/centro-oeste/df", "/centro-oeste/df/aguas-claras", "/centro-oeste"]) {
      await open(page, url);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${url} must not scroll sideways`).toBeLessThanOrEqual(0);
      await expect(page.getByRole("button", { name: "Buscar", exact: true })).toBeVisible();
    }
    await open(page, "/centro-oeste/df/aguas-claras");
    await shot(page, "pagina-ra-aguas-claras-375.png");
    await page.setViewportSize({ width: 1280, height: 720 });
  });

  test("given unknown or mismatched places, when opened, then they are 404 (never guessed)", async ({ page }) => {
    expect(await status(page, "/centro-oeste/df/atlantida")).toBe(404);
    expect(await status(page, "/centro-oeste/go/aguas-claras")).toBe(404);
    expect(await status(page, "/centro-oeste/df/aguas-claras/nao-existe")).toBe(404);
    expect(await status(page, "/sul/df/taguatinga")).toBe(404);
    expect(await status(page, "/norte/df/taguatinga")).toBe(404);
  });
});

test.describe("home and regions", () => {
  test("given the Centro-Oeste home, when the states are shown, then the DF offers its RAs as its places while GO, MT and MS keep 'N cidades'", async ({ page }) => {
    await open(page, "/centro-oeste");
    const states = page.locator("section#estados ul.md\\:grid > li");
    await expect(states).toHaveCount(4);
    const cardOf = (name: string) => states.filter({ has: page.getByRole("heading", { name, exact: true }) });
    await expect(cardOf("Distrito Federal")).toContainText("36 localidades");
    await expect(cardOf("Distrito Federal")).not.toContainText(/\bcidades?\b/);
    // Its shortcuts are the RAs themselves (most products first), each linking to its own page; not a "Regiões Administrativas" bucket.
    await expect(cardOf("Distrito Federal").getByRole("link", { name: "Taguatinga", exact: true })).toHaveAttribute("href", "/centro-oeste/df/taguatinga");
    await expect(cardOf("Distrito Federal").getByRole("link", { name: /Regiões Administrativas \d+/ })).toHaveCount(0);
    for (const name of ["Goiás", "Mato Grosso", "Mato Grosso do Sul"]) await expect(cardOf(name)).toContainText(/\d[\d.]* cidades/);
    await page.locator("section#estados").scrollIntoViewIfNeeded();
    await page.getByRole("button", { name: "Rejeitar" }).click({ timeout: 5_000 }).catch(() => undefined); // the consent banner would sit on top of the capture
    await page.locator("section#estados").screenshot({ path: path.join(CAPTURE, "home-centro-oeste-estados.png"), animations: "disabled" });
    await page.getByRole("button", { name: /Busque sua cidade, região ou estampa/ }).first().waitFor();
  });

  test("given Goiás, Mato Grosso and Mato Grosso do Sul, when their pages are opened, then they still count cities and group by mesoregion", async ({ page }) => {
    for (const uf of ["go", "mt", "ms"]) {
      await open(page, `/centro-oeste/${uf}`);
      await expect(page.locator("main")).toContainText(/\d[\d.]* cidades · \d+ regiões/);
      await expect(page.getByRole("region", { name: "Cidades do estado" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Por região" })).toBeVisible();
    }
    await open(page, "/centro-oeste/go/goiania");
    await expect(page.locator("section").first()).toContainText("Goiás · ");
    await expect(page.locator("section").first()).not.toContainText("Região Administrativa");
  });

  test("given Sul and Norte, when their home, state and city pages are opened, then they are unchanged", async ({ page }) => {
    await open(page, "/sul");
    await expect(page.getByRole("button", { name: /Busque sua cidade, estampa ou coleção…/ }).first()).toBeVisible(); // no "região" outside the DF's region
    await expect(page.locator("section#estados")).toContainText(/\d[\d.]* cidades/);
    await open(page, "/sul/sc");
    await expect(page.locator("main")).toContainText(/\d[\d.]* cidades · \d+ regiões/);
    await open(page, "/sul/sc/florianopolis");
    await expect(page.locator("section").first()).toContainText("Santa Catarina · Grande Florianópolis");
    await open(page, "/sul/rs/torres");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Torres");
    await open(page, "/norte");
    await expect(page.getByRole("button", { name: /Busque sua cidade, estampa ou coleção…/ }).first()).toBeVisible();
    await open(page, "/norte/pa/belem");
    await expect(page.locator("section").first()).toContainText("Pará");
    await expect(page.locator("section").first()).not.toContainText("Região Administrativa");
    expect(await status(page, "/norte/pa/belem/coordenadas")).toBe(200);
    expect(await status(page, "/sul/sc/florianopolis/coordenadas")).toBe(200);
  });

  test("given the sitemap, when read, then it lists the RAs that have products exactly once, Brasília once, and no unknown RA", async ({ page }) => {
    const xml = await (await page.request.get("/sitemap.xml", { timeout: 300_000 })).text();
    const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname);
    expect(new Set(urls).size, "no duplicated URL").toBe(urls.length);
    const localities = urls.filter((u) => /^\/centro-oeste\/df\/[a-z0-9-]+$/.test(u));
    expect(localities).toContain("/centro-oeste/df/aguas-claras");
    expect(localities).toContain("/centro-oeste/df/taguatinga");
    expect(localities).toContain("/centro-oeste/df/brasilia");
    expect(localities).toHaveLength(36); // Brasília + the 35 RAs, each with products
    expect(urls).toContain("/centro-oeste/df");
    expect(urls).toContain("/centro-oeste/df/aguas-claras/coordenadas");
    expect(urls.some((u) => u.includes("atlantida"))).toBe(false);
    expect(urls.filter((u) => u.startsWith("/centro-oeste/df/brasilia")).length).toBeGreaterThan(0);
    expect(urls.filter((u) => u === "/centro-oeste/df/brasilia")).toHaveLength(1);
  });
});
