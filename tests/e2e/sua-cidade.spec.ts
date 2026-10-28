import type { Page } from "@playwright/test";
import { expect, normalizeFbq, normalizeGtag, test } from "./fixtures";

/**
 * "Sua cidade" (src/components/city-journey/CityJourney.tsx): the place, its designs and the piece on ONE screen, from the desktop header, the phone
 * menu and the home's "Encontre aqui a sua cidade" (one journey per page, every trigger opens it), ending on the exact INK product of the piece
 * chosen. The expectations come from the place's own data (`/api/cidades/…`), never from a list written here, so the spec follows whatever the local
 * snapshot holds; the piece cases need the local garment index and skip without it.
 */
type Piece = { slug: string; label: string; href: string; price: number };
type Model = { familyId: string; name: string; pieces: Piece[] };
type Journey = { place: { name: string; uf: string; slug: string }; models: Model[] };

async function journeyOf(page: Page, path: string): Promise<Journey> {
  const res = await page.request.get(`/api/cidades/${path}`);
  expect(res.status()).toBe(200);
  return (await res.json()) as Journey;
}

/** Event mocks (same shape as tracking-and-nav.spec.ts) and an accepted consent, so what the journey reports can be read. */
async function withTracking(page: Page) {
  const meta: unknown[][] = [];
  const ga: unknown[][] = [];
  await page.exposeFunction("__reportFbq", (args: unknown[]) => meta.push(normalizeFbq(args)));
  await page.exposeFunction("__reportGtag", (args: unknown[]) => ga.push(normalizeGtag(args)));
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    w.fbq = (...args: unknown[]) => (w.__reportFbq as (a: unknown[]) => void)(args);
    w.gtag = (...args: unknown[]) => (w.__reportGtag as (a: unknown[]) => void)(args);
    window.localStorage.setItem("useorigens:consent:marketing", JSON.stringify({ choice: "accepted", version: 2, decidedAt: "2026-09-23T00:00:00.000Z" }));
    // A link to the store is followed for real by the browser; the test only needs the click (its events), never the store's page.
    document.addEventListener("click", (e) => {
      const link = (e.target as HTMLElement | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (link && link.host !== window.location.host) e.preventDefault();
    }, true);
  });
  return { meta: (name: string) => meta.filter((c) => c[1] === name), ga: (name: string) => ga.filter((c) => c[0] === "event" && c[1] === name) };
}

const openFromHeader = async (page: Page) => {
  await page.getByRole("navigation", { name: "Principal" }).getByRole("button", { name: "Sua cidade" }).click();
  return page.getByRole("dialog", { name: "Sua cidade" });
};

test.describe("Sua cidade: place, design and piece on one screen", () => {
  test("given the desktop header, when a city is typed, a design and another piece chosen, then the purchase bar opens that piece in the store, without a page change, reported once", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const data = await journeyOf(page, "sul/sc/florianopolis");
    const model = data.models.find((m) => m.pieces.length > 1);
    test.skip(!model, "local garment index not present");
    const other = model!.pieces[1];
    const track = await withTracking(page);
    await page.goto("/sul");

    const journey = await openFromHeader(page);
    await expect(journey.getByRole("heading", { level: 2 })).toHaveText("Qual é a sua cidade?");
    const field = journey.getByRole("combobox");
    await expect(field).toBeFocused();
    // A reading width, never the page's (the store's `.wrap` would win over a utility on the same element).
    expect((await field.boundingBox())!.width).toBeLessThan(800);
    await field.fill("Florianópolis");
    await journey.getByRole("option").first().waitFor();
    await field.press("Enter");

    // The designs of the place, as products: every one of them, in the store's order.
    const models = journey.getByTestId("journey-models").locator("[data-model]");
    await expect(models).toHaveCount(data.models.length);
    await expect(journey.getByRole("heading", { level: 2 })).toHaveText("Florianópolis");
    expect(await models.evaluateAll((els) => els.map((el) => el.getAttribute("data-model")))).toEqual(data.models.map((m) => m.familyId));

    await journey.locator(`[data-model="${model!.familyId}"]`).click();
    const cta = journey.getByTestId("journey-cta");
    await expect(cta).toHaveAttribute("href", model!.pieces[0].href);
    await expect(journey.getByRole("button", { name: /Camiseta clássica/ })).toHaveAttribute("aria-pressed", "true");

    await journey.locator(`[data-piece="${other.slug}"]`).click();
    await expect(cta).toHaveAttribute("href", other.href);
    await expect(journey.getByTestId("journey-buy-bar")).toContainText(`${data.place.name} · ${model!.name} · ${other.label}`);
    await expect(journey.getByTestId("journey-buy-bar")).toContainText("Cor, tamanho e frete você escolhe");
    await expect(page).toHaveURL(/\/sul$/);

    await cta.click();
    const goToInk = track.meta("GoToInk");
    expect(goToInk).toHaveLength(1);
    expect(goToInk[0][2]).toMatchObject({ source_section: "sua_cidade", city: "Florianópolis", state: "SC", family: model!.familyId, garment_type: other.label, value: other.price });
    expect(track.meta("SelectCity")[0]?.[2]).toMatchObject({ city: "Florianópolis", state: "SC" });
    expect(track.ga("select_city")[0]?.[2]).toMatchObject({ source: "sua_cidade" });
    expect(track.ga("go_to_ink")[0]?.[2]).toMatchObject({ source_section: "sua_cidade", garment_type: other.label, product_name: `${model!.name} ${other.label}` });
    expect(track.ga("origens_sua_cidade_open")[0]?.[2]).toMatchObject({ entry_point: "header" });
    expect(track.ga("origens_sua_cidade_model")[0]?.[2]).toMatchObject({ family: model!.familyId, city_slug: "florianopolis", uf: "SC", model_count: data.models.length });
    expect(track.ga("origens_sua_cidade_piece")[0]?.[2]).toMatchObject({ family: model!.familyId, garment_type: other.slug });
  });

  for (const [width, height, label] of [[1440, 757, "a laptop (1440×900 window)"], [390, 664, "a phone (Safari's real viewport)"]] as const) {
    test(`given ${label}, when a design with all its pieces is open, then the pieces and the purchase button are on screen without scrolling`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      const data = await journeyOf(page, "sul/sc/florianopolis");
      const model = data.models.find((m) => m.pieces.length > 4);
      test.skip(!model, "local garment index not present");
      await page.goto("/sul");
      let journey;
      if (width >= 1024) journey = await openFromHeader(page);
      else {
        await page.getByRole("button", { name: "Abrir menu" }).click();
        await page.getByRole("dialog", { name: "Menu" }).getByRole("button", { name: "Qual é a sua cidade?" }).click();
        journey = page.getByRole("dialog", { name: "Sua cidade" });
      }
      await journey.getByTestId("journey-picks").getByRole("button", { name: /Florianópolis/ }).click();
      await journey.locator(`[data-model="${model!.familyId}"]`).click();
      const bar = (await journey.getByTestId("journey-buy-bar").boundingBox())!;
      const cta = (await journey.getByTestId("journey-cta").boundingBox())!;
      expect(cta.y + cta.height).toBeLessThanOrEqual(height);
      // Desktop: every piece above the bar. Phone: the row of pieces (it scrolls sideways) right under the photo, above the bar.
      const pieces = width >= 1024 ? journey.locator("[data-piece]").last() : journey.getByTestId("journey-pieces");
      const last = (await pieces.boundingBox())!;
      expect(last.y + last.height).toBeLessThanOrEqual(bar.y + 1);
    });
  }

  test("given a state chosen in the field, when it opens, then its places are listed here by region, a filter finds the city and its designs follow, without leaving", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const track = await withTracking(page);
    await page.goto("/sul");
    const journey = await openFromHeader(page);
    await journey.getByRole("combobox").fill("Santa Catarina");
    await journey.locator('[role="option"][data-result-kind="state"]').first().click();
    await expect(journey.getByRole("heading", { level: 2 })).toHaveText("Santa Catarina");
    await expect(journey.getByTestId("journey-state-places").getByRole("heading", { level: 3 }).first()).toBeVisible();
    await expect(page).toHaveURL(/\/sul$/);
    expect(track.ga("origens_sua_cidade_state")[0]?.[2]).toMatchObject({ uf: "SC", entry_point: "header" });

    await journey.getByLabel("Filtrar as cidades de Santa Catarina").fill("tiju");
    const places = journey.getByTestId("journey-state-places").getByRole("button");
    await expect(places).toHaveText(["Tijucas"]);
    await places.first().click();
    await expect(journey.getByRole("heading", { level: 2 })).toHaveText("Tijucas");
    await expect(journey.getByTestId("journey-models").locator("[data-model]").first()).toBeVisible();
    expect(track.ga("select_city").at(-1)?.[2]).toMatchObject({ city: "Tijucas", state: "SC", source: "sua_cidade" });

    // Back from the designs: the field again (the state's list was a way to the place, not a step of its own).
    await journey.getByTestId("journey-back").click();
    await expect(journey.getByRole("combobox")).toBeFocused();
  });

  test("given the home's 'Encontre aqui a sua cidade', when clicked, then the page's one journey opens there, and the place chosen is where the header reopens it", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const track = await withTracking(page);
    await page.goto("/sul");
    const link = page.getByRole("button", { name: "Encontre aqui a sua cidade" }).first();
    await link.scrollIntoViewIfNeeded();
    await link.click();
    const journey = page.getByRole("dialog", { name: "Sua cidade" });
    await expect(journey.getByRole("combobox")).toBeFocused();
    expect(track.ga("origens_sua_cidade_open")[0]?.[2]).toMatchObject({ entry_point: "home" });
    await journey.getByTestId("journey-picks").getByRole("button", { name: /Curitiba/ }).click();
    await expect(journey.getByRole("heading", { level: 2 })).toHaveText("Curitiba");
    await page.keyboard.press("Escape");
    await expect(journey).toBeHidden();
    await expect(link).toBeFocused();

    const again = await openFromHeader(page);
    await expect(again.getByRole("heading", { level: 2 })).toHaveText("Curitiba");
    await expect(page.locator("dialog.city-journey")).toHaveCount(1);
    await again.getByRole("button", { name: "Trocar cidade" }).click();
    await expect(again.getByRole("combobox")).toBeFocused();
  });

  test("given a phone, when the menu's field opens the journey, then a shortcut, a design and the last piece lead to the store from the bar, nothing overflowing", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const data = await journeyOf(page, "sul/sc/florianopolis");
    const model = data.models.find((m) => m.pieces.length > 2);
    test.skip(!model, "local garment index not present");
    const last = model!.pieces[model!.pieces.length - 1];
    const track = await withTracking(page);
    await page.goto("/sul");
    await page.getByRole("button", { name: "Abrir menu" }).click();
    await page.getByRole("dialog", { name: "Menu" }).getByRole("button", { name: "Qual é a sua cidade?" }).click();
    const journey = page.getByRole("dialog", { name: "Sua cidade" });
    await journey.getByTestId("journey-picks").getByRole("button", { name: /Florianópolis/ }).click();
    await journey.locator(`[data-model="${model!.familyId}"]`).click();

    // The last piece of the row: choosing it scrolls the row, never the screen (the photo and the name stay in place).
    await journey.locator(`[data-piece="${last.slug}"]`).click();
    const bar = journey.getByTestId("journey-buy-bar");
    await expect(bar).toContainText(last.label);
    await expect(bar.getByRole("link", { name: /Escolher tamanho/ })).toHaveAttribute("href", last.href);
    const overflow = await page.evaluate(() => {
      const scroller = document.querySelector("dialog[open] .overscroll-contain") as HTMLElement;
      return { sideways: scroller.scrollWidth - scroller.clientWidth, scrolled: scroller.scrollLeft, page: document.documentElement.scrollWidth - window.innerWidth };
    });
    expect(overflow).toEqual({ sideways: 0, scrolled: 0, page: 0 });

    await bar.getByRole("link", { name: /Escolher tamanho/ }).click();
    expect(track.meta("GoToInk")).toHaveLength(1);
    expect(track.ga("origens_sua_cidade_open")[0]?.[2]).toMatchObject({ entry_point: "menu" });

    await journey.getByTestId("journey-back").click();
    await expect(journey.getByRole("heading", { level: 2 })).toHaveText("Florianópolis");
  });

  test("given a place the region does not have, when its data is asked for, then the answer is a 404 and never an empty list", async ({ page }) => {
    expect((await page.request.get("/api/cidades/sul/sc/lugar-que-nao-existe")).status()).toBe(404);
    expect((await page.request.get("/api/cidades/sul/pa/belem")).status()).toBe(404);
    expect((await page.request.get("/api/cidades/sul/SC/florianopolis")).status()).toBe(404);
  });
});
