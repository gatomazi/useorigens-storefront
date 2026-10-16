import { expect, test, type Page } from "@playwright/test";

/**
 * The region's collection menu, end to end in a real browser (sandbox in a temp dir, like the round trip). ONE menu for the storefront header and the
 * navbar the Worker draws on the INK product pages: "Topo" (the owner's order), "Categorias" (every public collection, automatically) and "Não exibir".
 * A document from before the menu keeps the Worker's payload untouched until the menu is published → several on top and one hidden → a menu-only change
 * is publishable → `/api/navbar/sul` and the storefront header follow exactly → regroup and reorder → everything back to Categorias. Needs the locally
 * synced INK collections.
 */
const hydrated = (page: Page) => page.waitForFunction(() => document.documentElement.dataset.hydrated === "true", undefined, { timeout: 180_000 });
async function open(page: Page, url: string) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 300_000 });
  await hydrated(page);
}
type Entry = { id: number; title: string; slug: string; url: string; order: number };
const navbar = async (page: Page) => (await (await page.request.get("/api/navbar/sul")).json()) as { v: number; region: string; states: { uf: string }[]; top: Entry[]; more: Entry[]; moreLabel?: string };
const titles = (l: Entry[]) => l.map((e) => e.title);
// The collection menu is on the Menu screen: every collection that can link somewhere sits in one of its lists (Topo, Categorias, Não exibidas).
const item = (page: Page, name: string) => page.getByTestId("collection-menu").locator("li", { has: page.locator("span.font-semibold", { hasText: new RegExp(`^${name}$`) }) }).first();
const place = async (page: Page, name: string, position: "Não exibir" | "Topo" | "Categorias") => {
  await open(page, "/admin/navegacao");
  await item(page, name).getByRole("button", { name: position, exact: true }).click();
  await expect(page.getByText(/depois que você publicar/)).toBeVisible();
};
const publish = async (page: Page, note: string) => {
  await open(page, "/admin/publicar");
  await page.getByLabel(/Nota da publicação/).fill(note);
  await page.getByRole("button", { name: "Publicar no sandbox local" }).click();
  await expect(page.getByText(/Publicado no sandbox local/)).toBeVisible({ timeout: 300_000 });
};
const headerCategories = async (page: Page) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, "/sul");
  await page.getByTestId("header-categories").click();
  return page.locator("nav[aria-label=Principal] details[open] ul a").allInnerTexts();
};

test("given the local CMS, when collections are put on top, hidden, published, regrouped and reordered, then the storefront header and the Worker's config follow exactly", async ({ page }) => {
  const before = await navbar(page);
  expect([before.v, before.region, before.top, before.more, before.moreLabel], "no menu yet: the Worker gets what it always got").toEqual([2, "sul", [], [], undefined]);
  expect(before.states.map((s) => s.uf)).toEqual(["PR", "SC", "RS"]); // Regiões is fixed

  // The Menu screen states the rules; the site already lists every public collection under Categorias. The library keeps the search coverage.
  await open(page, "/admin/navegacao");
  await expect(page.getByTestId("collection-menu")).toContainText("Toda coleção pública entra sozinha em Categorias");
  await expect(page.getByTestId("menu-adopt")).toBeVisible();
  await open(page, "/admin/colecoes");
  const coverage = page.getByTestId("search-coverage");
  await expect(coverage).toContainText("Busca do site por nome de coleção");
  if (process.env.EXPECT_SEARCH_COVERAGE === "complete") await expect(coverage).not.toContainText("parcial");
  if (process.env.EXPECT_SEARCH_COVERAGE === "partial") await expect(coverage).toContainText("sincronize as coleções");
  expect(await headerCategories(page)).toEqual(expect.arrayContaining(["Seu Lugar", "Novidades", "Paraná"]));

  // Several on top (no cap; "Novidades" is just a name) and one taken out.
  for (const name of ["Novidades", "Do Nosso Jeito", "Feito Para Você", "Fala Daqui"]) await place(page, name, "Topo");
  await place(page, "Paraná", "Não exibir");
  await open(page, "/admin/navegacao");
  await expect(page.getByTestId("menu-top")).toContainText("Topo (4)");
  await expect(page.getByTestId("menu-categories")).not.toContainText("Paraná");
  await expect(page.getByTestId("menu-off")).toContainText("Paraná");
  expect((await navbar(page)).top, "a draft is not public").toEqual([]);

  // An internal collection enabled in the CMS (an earlier spec enabled "Fé de Origem") can be brought in: on the site only, it has no INK page.
  await place(page, "Fé de Origem", "Categorias");
  await open(page, "/admin/navegacao");
  await expect(page.getByTestId("menu-categories").locator("li", { hasText: "Fé de Origem" })).toContainText("só no site");

  // A menu-only change is publishable and says what changes, the INK navbar included.
  await open(page, "/admin/publicar");
  await expect(page.getByText("A navbar da INK passa a seguir o menu de coleções do site (Topo e Categorias)")).toBeVisible();
  await expect(page.getByText('"Novidades" vai para o topo do menu')).toBeVisible();
  await expect(page.getByText('"Paraná" sai do menu')).toBeVisible();
  await publish(page, "menu: 4 no topo, Paraná fora");
  await expect.poll(async () => titles((await navbar(page)).top), { timeout: 60_000 }).toEqual(["Novidades", "Do Nosso Jeito", "Feito Para Você", "Fala Daqui"]);
  const live = await navbar(page);
  expect(live.top.map((e) => e.order)).toEqual([1, 2, 3, 4]);
  expect(live.top[0]).toMatchObject({ slug: "novidades" });
  expect(live.top[0].url).toMatch(/\/sul\/colecoes\/novidades$/); // our page, for when the Worker links back to the site
  expect(live.moreLabel).toBe("Categorias");
  expect(titles(live.more)).toContain("Seu Lugar");
  expect(titles(live.more)).not.toContain("Paraná");
  expect(titles(live.more), "internal: no INK page").not.toContain("Fé de Origem");
  expect(new Set([...live.top, ...live.more].map((e) => e.id)).size, "never on the bar and in the dropdown").toBe(live.top.length + live.more.length);
  expect((await page.request.get("/api/navbar/mars")).status()).toBe(404);

  // The storefront: Categorias has the bar's collections first, never the hidden one, and opens our collection page.
  const listed = await headerCategories(page);
  expect(listed.slice(0, 4)).toEqual(["Novidades", "Do Nosso Jeito", "Feito Para Você", "Fala Daqui"]);
  expect(listed).not.toContain("Paraná");
  expect(listed).toContain("Fé de Origem");
  await page.locator("nav[aria-label=Principal] details[open] ul a", { hasText: "Seu Lugar" }).click();
  await expect(page).toHaveURL(/\/sul\/colecoes\/seu-lugar$/);

  // Regroup and reorder: only the menu changes, nothing is duplicated.
  await place(page, "Fala Daqui", "Categorias");
  await open(page, "/admin/navegacao");
  await page.getByRole("button", { name: "Subir Feito Para Você" }).click();
  await expect(page.getByText(/Ordem do topo alterada/)).toBeVisible();
  await publish(page, "menu: Fala Daqui para Categorias, reordena");
  await expect.poll(async () => titles((await navbar(page)).top), { timeout: 60_000 }).toEqual(["Novidades", "Feito Para Você", "Do Nosso Jeito"]);
  expect(titles((await navbar(page)).more)).toContain("Fala Daqui");

  // Everything back to the default: nothing on the bar, Paraná listed again, the internal one out.
  for (const name of ["Novidades", "Feito Para Você", "Do Nosso Jeito", "Paraná"]) await place(page, name, "Categorias");
  await place(page, "Fé de Origem", "Não exibir");
  await publish(page, "menu: tudo em Categorias");
  await expect.poll(async () => (await navbar(page)).top.length, { timeout: 60_000 }).toBe(0);
  expect(titles((await navbar(page)).more)).toEqual(expect.arrayContaining(["Novidades", "Paraná", "Seu Lugar"]));
});
