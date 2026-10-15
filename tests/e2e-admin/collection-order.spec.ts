import { expect, test, type Page } from "@playwright/test";

/**
 * A collection section's own order, on our side: from INK's order, a product goes to the top, another is hidden and another is dragged up by its
 * grip; the draft keeps it all across a reload, the preview shows the cards in that order without the hidden one, and "Voltar à ordem da INK"
 * undoes it all. Uses the locally synced public
 * collection "Pré-treino Raiz" (18 products), so it needs no enablement and runs alone (`--no-deps`).
 */
const hydrated = (page: Page) => page.waitForFunction(() => document.documentElement.dataset.hydrated === "true", undefined, { timeout: 180_000 });
async function open(page: Page, url: string) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 300_000 });
  await hydrated(page);
}
/** Drags row `from` by its grip onto row `to` with the mouse, and lets go once the list shows it there. */
async function dragRow(page: Page, from: number, to: number) {
  const rows = page.getByTestId("collection-order-row");
  const grip = (i: number) => rows.nth(i).getByRole("button", { name: /^Mover / });
  const a = (await grip(from).boundingBox())!;
  const b = (await grip(to).boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2, to < from ? b.y + 4 : b.y + b.height - 4, { steps: 20 });
  await expect(rows.nth(to)).toHaveAttribute("data-dragging", "");
  await page.mouse.up();
  await expect(rows.nth(to)).not.toHaveAttribute("data-dragging", "");
}
const rowNames = async (page: Page) => (await page.getByTestId("collection-order-row").locator("p.font-bold").allInnerTexts()).map((t) => t.replace(/\s*novo$/i, "").trim());

test("given a collection section, when a product goes to the top and another is hidden, then the draft and the preview follow, and INK's order can be restored", async ({ page }) => {
  await open(page, "/admin/home");
  const picker = page.getByRole("combobox", { name: /Coleção \(busque pelo nome\)/ });
  await picker.fill("pre-treino");
  await page.getByRole("option", { name: /Pré-treino Raiz/ }).click();
  const creator = page.getByRole("form", { name: "Nova seção a partir de uma coleção da INK" });
  await creator.getByLabel("Título (opcional)").fill("Ordem nossa");
  await creator.getByLabel("Cards").fill("4");
  await creator.getByRole("button", { name: "Criar seção" }).click();
  await expect(page).toHaveURL(/\/admin\/home\/custom-[0-9a-f]+(\?|$)/);

  // INK's order, with the cut after the 4 cards the store shows.
  const order = page.getByTestId("collection-order");
  await expect(order).toBeVisible();
  await expect(page.getByTestId("collection-order-mode")).toHaveText("Ordem da INK");
  const ink = await rowNames(page);
  expect(ink.length).toBeGreaterThanOrEqual(6);
  await expect(page.getByTestId("collection-order-cut")).toContainText("A loja mostra só os 4 primeiros");

  // The 6th product goes to the top; the (new) 2nd is hidden.
  await page.getByRole("button", { name: `Levar ${ink[5]} para o topo` }).click();
  await expect(page.getByTestId("collection-order-mode")).toHaveText("Ordem manual");
  await page.getByRole("button", { name: `Esconder ${ink[0]} da coleção` }).click();
  expect(await rowNames(page)).toEqual([ink[5], ...ink.slice(1, 5), ...ink.slice(6)]);
  // Dragged by its grip: the (now) 4th product goes up to the 2nd place.
  await dragRow(page, 3, 1);
  const expected = [ink[5], ink[3], ink[1], ink[2], ink[4], ...ink.slice(6)];
  expect(await rowNames(page)).toEqual(expected);
  await expect(page.getByRole("list", { name: "Produtos escondidos" })).toContainText(ink[0]);

  await page.getByRole("button", { name: "Salvar rascunho" }).click();
  await expect(page.getByText("Rascunho salvo.")).toBeVisible();
  await page.reload({ waitUntil: "domcontentloaded" });
  await hydrated(page);
  expect(await rowNames(page)).toEqual(expected); // persisted
  await expect(page.getByRole("list", { name: "Produtos escondidos" })).toContainText(ink[0]);
  await expect(page.getByText(/ordem manual · 1 escondido/)).toBeVisible();

  // The preview draws the section's cards in that order, without the hidden product.
  const section = page.frameLocator('iframe[data-preview="desktop"]').locator("section#colecao-ordem-nossa");
  await expect(section).toBeVisible({ timeout: 300_000 });
  const cards = section.locator("li");
  await expect(cards).toHaveCount(4);
  const [firstName, firstContext] = expected[0].split(" · ");
  await expect(cards.first()).toContainText(firstName);
  if (firstContext) await expect(cards.first()).toContainText(firstContext);

  // Back to INK's order: everything shows again, in INK's order. (Reopened without the last save's notice, so the next one is this save's.)
  await open(page, page.url().split("?")[0]);
  await page.getByRole("button", { name: "Voltar à ordem da INK" }).click();
  await expect(page.getByTestId("collection-order-mode")).toHaveText("Ordem da INK");
  await page.getByRole("button", { name: "Salvar rascunho" }).click();
  await expect(page.getByText("Rascunho salvo.")).toBeVisible();
  await page.reload({ waitUntil: "domcontentloaded" });
  await hydrated(page);
  expect(await rowNames(page)).toEqual(ink);
  await expect(page.getByRole("list", { name: "Produtos escondidos" })).toHaveCount(0);
});
