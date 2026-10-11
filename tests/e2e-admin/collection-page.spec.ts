import { expect, test, type Page } from "@playwright/test";

/**
 * The storefront's own page of a collection (`/<region>/colecoes/<slug>`): drawn on its own for every collection the region can use, every product of
 * it page by page, 404 past the last page; "Ver todos" of a new collection section leads there; "Personalizar página" (Coleções) puts the same page in
 * the draft as a parent-category landing. Uses the locally synced public collection "Da Nossa Terra", so it needs no enablement and runs alone
 * (`--no-deps`). Publishes nothing.
 */
const hydrated = (page: Page) => page.waitForFunction(() => document.documentElement.dataset.hydrated === "true", undefined, { timeout: 180_000 });
async function open(page: Page, url: string) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 300_000 });
  await hydrated(page);
}
const status = async (page: Page, url: string) => (await page.request.get(url, { maxRedirects: 0, timeout: 300_000 })).status();

test("given a public collection, when its page is opened, then every product is listed page by page, with real page links and 404 past the end", async ({ page }) => {
  await page.goto("/sul/colecoes/da-nossa-terra", { waitUntil: "domcontentloaded", timeout: 300_000 });
  await expect(page.getByRole("heading", { level: 1, name: "Da Nossa Terra" })).toBeVisible();
  const grid = page.locator("section#produtos");
  await expect(grid.getByRole("heading", { name: "Todos os produtos" })).toBeVisible();
  const count = await grid.getByText(/\d+ produtos · página 1 de \d+/).innerText();
  const [, total, pages] = /(\d+) produtos · página 1 de (\d+)/.exec(count)!.map(Number);
  expect(pages).toBe(Math.ceil(total / 24));
  await expect(grid.locator("ul > li")).toHaveCount(24);
  // Every card opens the product on INK (detail, cart and checkout stay there).
  await expect(grid.locator("ul > li a").first()).toHaveAttribute("href", /usesul\.com\.br\/usesul\/product\//);

  const nav = page.getByRole("navigation", { name: "Páginas de Todos os produtos" });
  await expect(nav.getByText("1", { exact: true })).toHaveAttribute("aria-current", "page");
  await nav.getByRole("link", { name: "Próxima" }).click();
  await expect(page).toHaveURL(/\/sul\/colecoes\/da-nossa-terra\/2$/);
  await expect(page.locator("section#produtos").getByText(new RegExp(`página 2 de ${pages}`))).toBeVisible();

  expect(await status(page, `/sul/colecoes/da-nossa-terra/${pages + 1}`)).toBe(404);
  expect(await status(page, "/sul/colecoes/da-nossa-terra/1")).toBe(308); // the first page is the page itself
  expect(await status(page, "/sul/colecoes/da-nossa-terra/01")).toBe(404);
  expect(await status(page, "/sul/colecoes/nao-existe-esta-colecao")).toBe(404);
  expect(await status(page, "/norte/colecoes/da-nossa-terra")).toBe(404); // another region's store has no such collection page
});

test("given a new section from a collection, when created, then its 'Ver todos' leads to the collection's page on the site", async ({ page }) => {
  await open(page, "/admin/home");
  const picker = page.getByRole("combobox", { name: /Coleção \(busque pelo nome\)/ });
  await picker.fill("da nossa terra");
  await page.getByRole("option", { name: /Da Nossa Terra/ }).click();
  const creator = page.getByRole("form", { name: "Nova seção a partir de uma coleção da INK" });
  await creator.getByLabel("Título (opcional)").fill("Página nossa");
  await creator.getByRole("button", { name: "Criar seção" }).click();
  await expect(page).toHaveURL(/\/admin\/home\/custom-[0-9a-f]+(\?|$)/);
  await expect(page.locator("#cta_kind")).toHaveValue("collection-page");
  await expect(page.locator("#cta_collection")).toHaveValue(/^use-sul:\d+$/);
  await expect(page.getByTestId("collection-order-scope")).toContainText("da coleção");
  // The preview draws the button with the site's address.
  const section = page.frameLocator('iframe[data-preview="desktop"]').locator("section#colecao-pagina-nossa");
  await expect(section.getByRole("link", { name: /Ver todos/ }).first()).toHaveAttribute("href", "/sul/colecoes/da-nossa-terra", { timeout: 300_000 });
});

test("given 'Personalizar página', when used, then the draft gets a parent-category landing at the collection's address with its paged grid", async ({ page }) => {
  await open(page, "/admin/colecoes?q=da+nossa+terra");
  const row = page.locator("tr", { hasText: "Da Nossa Terra" }).first();
  await expect(row.locator("code", { hasText: "/sul/colecoes/da-nossa-terra" })).toBeVisible();
  await row.getByRole("button", { name: "Personalizar página" }).click();
  await expect(page).toHaveURL(/\/admin\/paginas\/pg-[0-9a-f]+/, { timeout: 120_000 });
  await expect(page.getByText(/Página da coleção criada no rascunho/)).toBeVisible();
  await page.locator("tr", { hasText: "Todos os produtos" }).getByRole("link", { name: "Editar" }).click();
  await hydrated(page);
  await expect(page.getByRole("radio", { name: /Grade paginada/ })).toBeChecked();
  await expect(page.getByText("Na grade paginada não há botão “Ver todos”")).toBeVisible();
  await expect(page.locator("#cta_kind")).toHaveCount(0);

  // The library now points at the page to edit; the storefront keeps the automatic one until it is published.
  await open(page, "/admin/colecoes?q=da+nossa+terra");
  await expect(page.locator("tr", { hasText: "Da Nossa Terra" }).first().getByRole("link", { name: "Editar página" })).toBeVisible();
  expect(await status(page, "/sul/colecoes/da-nossa-terra")).toBe(200);
});
