import { expect, test, type Page } from "@playwright/test";

/**
 * The CMS side of the INK navbar, end to end in a real browser (sandbox in a temp dir, like the round trip). TWO free groups, no special slots:
 * several PUBLIC collections go to "Topo" and several to "Demais categorias", in the owner's order → a navbar-only change is publishable → the public
 * `/api/navbar/sul` shows nothing before publishing and the exact groups/order after → a collection changes group and is republished → reordering →
 * an INTERNAL collection cannot be placed → everything back to "Não exibir" empties the payload. The Worker is not involved: this is the "no deploy
 * to change the menu" path. Needs the locally synced INK collections.
 */
const hydrated = (page: Page) => page.waitForFunction(() => document.documentElement.dataset.hydrated === "true", undefined, { timeout: 180_000 });
async function open(page: Page, url: string) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 300_000 });
  await hydrated(page);
}
type Entry = { id: number; title: string; slug: string; url: string; order: number };
const navbar = async (page: Page) => (await (await page.request.get("/api/navbar/sul")).json()) as { v: number; region: string; states: { uf: string }[]; top: Entry[]; more: Entry[] };
const titles = (l: Entry[]) => l.map((e) => e.title);
const row = (page: Page, name: string) => page.locator("table.a-table tbody tr", { hasText: name });
const place = async (page: Page, name: string, position: "Não exibir" | "Topo" | "Demais categorias") => {
  await open(page, `/admin/colecoes?q=${encodeURIComponent(name)}`);
  await row(page, name).first().getByRole("button", { name: position, exact: true }).click();
  await expect(page.getByText(/depois que você publicar/)).toBeVisible();
};
const publish = async (page: Page, note: string) => {
  await open(page, "/admin/publicar");
  await page.getByLabel(/Nota da publicação/).fill(note);
  await page.getByRole("button", { name: "Publicar no sandbox local" }).click();
  await expect(page.getByText(/Publicado no sandbox local/)).toBeVisible({ timeout: 300_000 });
};

test("given the local CMS, when several public collections are placed in Topo and Demais categorias, published, regrouped and reordered, then the public config follows exactly", async ({ page }) => {
  const empty = await navbar(page);
  expect([empty.v, empty.region, empty.top, empty.more], "nothing configured: a well-formed empty payload, never an error").toEqual([2, "sul", [], []]);
  expect(empty.states.map((s) => s.uf)).toEqual(["PR", "SC", "RS"]); // Regiões is fixed

  // The library states the rules and the coverage of the text search.
  await open(page, "/admin/colecoes");
  await expect(page.getByTestId("navbar-groups")).toContainText("Nenhuma coleção é especial");
  const coverage = page.getByTestId("search-coverage");
  await expect(coverage).toContainText("Busca do site por nome de coleção");
  if (process.env.EXPECT_SEARCH_COVERAGE === "complete") await expect(coverage).not.toContainText("parcial");
  if (process.env.EXPECT_SEARCH_COVERAGE === "partial") await expect(coverage).toContainText("sincronize as coleções");

  // Several on top and several in the dropdown (no cap of one/two/five; "Novidades" is just a name and coexists with the others).
  for (const name of ["Novidades", "Do Nosso Jeito", "Feito Para Você", "Fala Daqui"]) await place(page, name, "Topo");
  for (const name of ["Seu Lugar", "Da Nossa Terra"]) await place(page, name, "Demais categorias");
  await open(page, "/admin/colecoes");
  const groups = page.getByTestId("navbar-groups");
  await expect(groups).toContainText("Topo (4)");
  await expect(groups).toContainText("Demais categorias (2)");
  expect((await navbar(page)).top, "a draft is not public").toEqual([]);

  // An internal collection has no public page: it cannot be placed.
  await open(page, "/admin/colecoes?q=fe+de+origem");
  await expect(row(page, "Fé de Origem")).toContainText("Indisponível");
  await expect(row(page, "Fé de Origem").getByRole("button", { name: "Topo", exact: true })).toHaveCount(0);

  // A navbar-only change is publishable and says what changes.
  await open(page, "/admin/publicar");
  await expect(page.getByText('"Novidades" passa a aparecer no topo da navbar da INK')).toBeVisible();
  await expect(page.getByText('"Seu Lugar" passa a aparecer em Demais categorias da navbar da INK')).toBeVisible();
  await publish(page, "navbar: 4 no topo, 2 em demais");
  await expect.poll(async () => titles((await navbar(page)).top), { timeout: 60_000 }).toEqual(["Novidades", "Do Nosso Jeito", "Feito Para Você", "Fala Daqui"]);
  const live = await navbar(page);
  expect(titles(live.more)).toEqual(["Seu Lugar", "Da Nossa Terra"]);
  expect(live.top.map((e) => e.order)).toEqual([1, 2, 3, 4]);
  expect(live.top[0]).toMatchObject({ slug: "novidades", url: "https://www.usesul.com.br/usesul/collections/novidades" });
  expect((await page.request.get("/api/navbar/mars")).status()).toBe(404);

  // Move one collection to the other group and reorder: only the navbar changes, nothing is duplicated.
  await place(page, "Fala Daqui", "Demais categorias");
  await open(page, "/admin/colecoes");
  await page.getByRole("button", { name: "Subir Da Nossa Terra" }).click();
  await expect(page.getByText(/Ordem alterada/)).toBeVisible();
  await publish(page, "navbar: Fala Daqui para demais, reordena");
  await expect.poll(async () => titles((await navbar(page)).more), { timeout: 60_000 }).toEqual(["Da Nossa Terra", "Seu Lugar", "Fala Daqui"]);
  const moved = await navbar(page);
  expect(titles(moved.top)).toEqual(["Novidades", "Do Nosso Jeito", "Feito Para Você"]);
  expect(new Set([...moved.top, ...moved.more].map((e) => e.id)).size, "no collection on both groups").toBe(moved.top.length + moved.more.length);

  // Everything back to "Não exibir": the payload empties (and the Demais categorias group with it).
  for (const name of ["Novidades", "Do Nosso Jeito", "Feito Para Você", "Fala Daqui", "Seu Lugar", "Da Nossa Terra"]) await place(page, name, "Não exibir");
  await publish(page, "navbar: tudo fora");
  await expect.poll(async () => { const n = await navbar(page); return [n.top.length, n.more.length]; }, { timeout: 60_000 }).toEqual([0, 0]);
});
