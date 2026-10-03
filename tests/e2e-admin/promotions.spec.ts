import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

/**
 * "Cupons e promoções", end to end on the local CMS sandbox (dev server; nothing here touches production):
 *   CMS editor (title, code, description, optional callout, enable, order, window) with the live preview → a saved DRAFT is not public →
 *   publish → /api/promotions/sul serves v1 with only live items, Norte never sees Sul's coupons → the storefront button: badge = copyable coupons,
 *   panel, Copiar → "Copiado" + clipboard, Escape, above the cookie bar, bottom sheet on phones, no horizontal overflow, reduced motion = no wiggle.
 * Runs LAST, and also alone on a fresh sandbox (`--no-deps`). `CAPTURE=1` writes the screenshots of docs/screenshots/promotions/.
 */
const hydrated = (page: Page) => page.waitForFunction(() => document.documentElement.dataset.hydrated === "true", undefined, { timeout: 180_000 });
// The Next.js DEV indicator lives in the bottom-left corner, exactly where the button goes, and swallows its clicks. It does not exist in production.
const hideDevOverlay = (page: Page) => page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
async function open(page: Page, url: string) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 300_000 });
  await hydrated(page);
  await hideDevOverlay(page);
}
async function chooseRegion(page: Page, name: "Sul" | "Norte") {
  await open(page, "/admin");
  const switcher = page.getByRole("form", { name: "Região em edição" });
  await switcher.getByRole("button", { name: new RegExp(`^${name}`) }).click();
  await expect(switcher.getByRole("button", { name: new RegExp(`^${name}`) })).toHaveAttribute("aria-pressed", "true");
}
const flash = (page: Page, text: RegExp) => page.getByRole("status").locator("p", { hasText: text });
const SHOTS = path.join(process.cwd(), "docs", "screenshots", "promotions");
const capture = async (page: Page, name: string) => {
  if (!process.env.CAPTURE) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
};
const api = async (page: Page, region: string) => {
  const r = await page.request.get(`/api/promotions/${region}`);
  return { status: r.status(), body: r.status() === 200 ? await r.json() : null, cache: r.headers()["cache-control"] };
};
const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
async function acceptCookies(page: Page) {
  const accept = page.getByRole("button", { name: "Aceitar cookies" });
  if (await accept.isVisible()) await accept.click();
}

test.describe.configure({ mode: "serial" });

test("given the CMS, when the owner fills coupons and an announcement and saves, then the preview shows them and the draft is NOT public", async ({ page }) => {
  await chooseRegion(page, "Sul");
  await open(page, "/admin/promocoes");
  // Start from a clean list (the sandbox may carry a previous run).
  while (await page.getByTestId("promo-remove-0").isVisible()) await page.getByTestId("promo-remove-0").click();

  await page.getByTestId("promo-add-coupon").click();
  await page.getByTestId("promo-title-0").fill("LEVE MAIS");
  await page.getByTestId("promo-code-0").fill("LEVEMAIS");
  await page.getByTestId("promo-description-0").fill("3 peças: R$ 30 OFF · 4 peças: R$ 50 OFF · 5 ou mais: R$ 75 OFF");
  await page.getByTestId("promo-callout-0").fill("Um cupom por pedido.");

  await page.getByTestId("promo-add-coupon").click();
  await page.getByTestId("promo-title-1").fill("PRIMEIRA COMPRA");
  await page.getByTestId("promo-code-1").fill("PRIMEIRA5");
  await page.getByTestId("promo-description-1").fill("5% OFF na sua primeira compra");
  await page.getByTestId("promo-badgeLabel-1").fill("Novo");

  await page.getByTestId("promo-add-promotion").click();
  await page.getByTestId("promo-title-2").fill("Semana do Frete Grátis");
  await page.getByTestId("promo-description-2").fill("1 peça RJ ou 2 peças demais estados");
  await page.getByTestId("promo-callout-2").fill("Com limite de R$ 29,90 por frete");

  // A future and an expired coupon: saved, but never public now.
  await page.getByTestId("promo-add-coupon").click();
  await page.getByTestId("promo-title-3").fill("CLIENTE15");
  await page.getByTestId("promo-code-3").fill("CLIENTE15");
  await page.getByTestId("promo-description-3").fill("15% OFF durante a Semana do Cliente");
  await page.getByTestId("promo-startsAt-3").fill("2099-01-01T00:00");
  await expect(page.getByTestId("promo-status-3")).toHaveText("Agendado");
  await page.getByTestId("promo-add-coupon").click();
  await page.getByTestId("promo-title-4").fill("ANTIGO");
  await page.getByTestId("promo-code-4").fill("ANTIGO10");
  await page.getByTestId("promo-description-4").fill("Cupom que já acabou");
  await page.getByTestId("promo-endsAt-4").fill("2020-01-01T00:00");
  await expect(page.getByTestId("promo-status-4")).toHaveText("Encerrado");

  // Preview: the storefront's own widget, only the live items; the coupon without a callout has no callout line.
  const frame = page.getByTestId("promo-preview-frame");
  await expect(frame.getByTestId("promo-badge")).toHaveText("2");
  await expect(frame.locator("[data-promo-id]")).toHaveCount(3);
  await expect(frame.locator("[data-promo-id]").nth(1).getByTestId("promo-callout")).toHaveCount(0);
  await expect(frame.locator("[data-promo-id]").nth(0).getByTestId("promo-callout")).toHaveText("Um cupom por pedido.");
  await expect(frame.locator('[data-promo-type="promotion"] [data-testid="promo-copy"]')).toHaveCount(0);
  await capture(page, "cms-editor-1280");
  if (process.env.CAPTURE) await page.locator('section[aria-labelledby="promo-preview"]').screenshot({ path: path.join(SHOTS, "cms-preview-panel.png") });

  // Reorder: the announcement goes first in the preview.
  await page.getByTestId("promo-up-2").click();
  await page.getByTestId("promo-up-1").click();
  await expect(frame.locator("[data-promo-id] h3").first()).toHaveText("Semana do Frete Grátis");
  await page.getByTestId("promo-down-0").click(); // LEVE MAIS first again, the announcement second
  await expect(frame.locator("[data-promo-id] h3")).toHaveText(["LEVE MAIS", "Semana do Frete Grátis", "PRIMEIRA COMPRA"]);

  await page.getByTestId("save-promotions").click();
  await expect(flash(page, /Rascunho dos cupons e promoções de Sul salvo/)).toBeVisible();
  // Saved draft keeps the values (round trip through the server) …
  await expect(page.getByTestId("promo-code-0")).toHaveValue("LEVEMAIS");
  await expect(page.getByTestId("promo-startsAt-3")).toHaveValue("2099-01-01T00:00");
  // … and is not public.
  const before = await api(page, "sul");
  expect(before.status).toBe(200);
  expect(JSON.stringify(before.body)).not.toContain("LEVEMAIS");
});

test("given the draft is published, when the API is read, then it is v1 of Sul with only live items, short cache, and Norte never sees them", async ({ page }) => {
  await chooseRegion(page, "Sul");
  await open(page, "/admin/publicar");
  await expect(page.getByText(/Cupons e promoções: cupom "LEVE MAIS" adicionado/)).toBeVisible();
  await page.getByRole("button", { name: "Publicar no sandbox local" }).click();
  await expect(flash(page, /Publicado no sandbox local/)).toBeVisible({ timeout: 300_000 });

  const sul = await api(page, "sul");
  expect(sul.cache).toContain("s-maxage=30");
  expect(sul.body.v).toBe(1);
  expect(sul.body.region).toBe("sul");
  expect(sul.body.items.map((i: { id: string; order: number }) => [i.id, i.order])).toEqual([["leve-mais", 1], ["semana-do-frete-gratis", 2], ["primeira-compra", 3]]);
  expect(sul.body.items[1]).not.toHaveProperty("code");
  expect(sul.body.items[2]).not.toHaveProperty("callout");
  expect(sul.body.items[2].badgeLabel).toBe("Novo");
  expect(JSON.stringify(sul.body)).not.toMatch(/CLIENTE15|ANTIGO10|enabled|startsAt/);

  const norte = await api(page, "norte");
  expect([200, 404]).toContain(norte.status); // 404 while Norte is not launched in this sandbox
  if (norte.body) expect(JSON.stringify(norte.body)).not.toContain("LEVEMAIS");
  expect((await api(page, "nao-existe")).status).toBe(404);
});

test("given the storefront on desktop, when the button is used, then badge 2, the popover lists the cards, Copiar copies the exact code and Escape closes", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.setViewportSize({ width: 1280, height: 800 });
  await open(page, "/sul");
  const fab = page.getByTestId("promo-fab");
  await expect(fab).toBeVisible({ timeout: 30_000 });
  await expect(fab).toHaveAccessibleName("Cupons e ofertas: 2 cupons disponíveis");
  await expect(page.getByTestId("promo-badge")).toHaveText("2");
  // Bottom-left, above the cookie bar while it is shown.
  const banner = page.locator("[data-consent-banner]");
  if (await banner.isVisible()) {
    const [f, b] = [await fab.boundingBox(), await banner.boundingBox()];
    expect(f!.y + f!.height).toBeLessThanOrEqual(b!.y);
    await capture(page, "storefront-fab-cookie-bar-1280");
  }
  await acceptCookies(page);
  // Once the cookie bar is gone the button settles back to the corner.
  await expect.poll(async () => { const b = (await fab.boundingBox())!; return Math.round(800 - (b.y + b.height)); }).toBeLessThanOrEqual(24);
  expect((await fab.boundingBox())!.x).toBeLessThan(40);
  await capture(page, "storefront-fab-1280");

  await fab.click();
  const panel = page.getByRole("dialog", { name: "Cupons e ofertas" });
  await expect(panel).toBeVisible();
  await expect(panel.locator("[data-promo-id] h3")).toHaveText(["LEVE MAIS", "Semana do Frete Grátis", "PRIMEIRA COMPRA"]);
  await expect(panel.getByTestId("promo-copy")).toHaveCount(2);
  await capture(page, "storefront-panel-1280");

  await panel.getByTestId("promo-copy").first().click();
  await expect(panel.getByTestId("promo-copy").first()).toHaveText("Copiado");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("LEVEMAIS");
  await capture(page, "storefront-copied-1280");
  await expect(panel.getByTestId("promo-copy").first()).toHaveText("Copiar", { timeout: 5_000 });

  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(fab).toBeFocused();
  expect(await noOverflow(page)).toBeLessThanOrEqual(0);
});

for (const [width, height] of [[1024, 768], [768, 1024], [500, 900], [390, 844], [360, 740], [320, 640]] as const) {
  test(`given a ${width}px viewport, when the panel opens, then nothing overflows and phones get a bottom sheet`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await open(page, "/sul");
    await acceptCookies(page);
    const fab = page.getByTestId("promo-fab");
    await expect(fab).toBeVisible({ timeout: 30_000 });
    const f = (await fab.boundingBox())!;
    expect(f.width).toBeGreaterThanOrEqual(44);
    expect(f.x).toBeGreaterThanOrEqual(0);
    await capture(page, `storefront-fab-${width}`);
    await fab.click();
    const panel = page.getByRole("dialog", { name: "Cupons e ofertas" });
    await expect(panel).toBeVisible();
    const p = (await panel.boundingBox())!;
    expect(p.x).toBeGreaterThanOrEqual(0);
    expect(p.x + p.width).toBeLessThanOrEqual(width + 0.5);
    expect(p.y + p.height).toBeLessThanOrEqual(height + 0.5);
    if (width < 640) {
      expect(p.width).toBeGreaterThanOrEqual(width - 1); // full-width sheet
      expect(Math.round(p.y + p.height)).toBe(height); // glued to the bottom
      await expect(page.locator("[data-promo-backdrop]")).toBeVisible();
    }
    expect(await noOverflow(page)).toBeLessThanOrEqual(0);
    await capture(page, `storefront-panel-${width}`);
    await panel.getByTestId("promo-close").click();
    await expect(panel).toBeHidden();
  });
}

test("given the mobile menu opens, when it is open, then the button steps aside; and it is a single button after client navigations", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, "/sul");
  await acceptCookies(page);
  const fab = page.getByTestId("promo-fab");
  await expect(fab).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Abrir menu" }).click();
  await expect(page.getByRole("dialog", { name: "Menu" })).toBeVisible();
  await expect(fab).toBeHidden();
  await page.keyboard.press("Escape");
  await expect(fab).toBeVisible();
  // Client navigation inside the region keeps ONE button (the layout persists).
  const state = page.locator('a[href^="/sul/"]').first();
  if (await state.isVisible()) {
    await state.click();
    await page.waitForURL(/\/sul\/.+/);
    await expect(page.getByTestId("promo-fab")).toHaveCount(1);
  }
});

test("given a product page on a phone, when the buy CTA scrolls under the button's corner, then the button steps aside and comes back after", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, "/sul/pr/pato-branco/ponto-de-origem");
  await acceptCookies(page);
  const fab = page.getByTestId("promo-fab");
  await expect(fab).toHaveCount(1, { timeout: 30_000 });
  // Far from the purchase block (the footer): the button is there.
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect(fab).toBeVisible();
  const cta = page.locator("[data-purchase-controls] .btn").first();
  // Put the CTA exactly in the bottom-left corner the button uses: it steps aside instead of covering it.
  await cta.evaluate((el) => { const r = el.getBoundingClientRect(); window.scrollBy(0, r.bottom - (window.innerHeight - 30)); });
  await expect(cta).toBeInViewport();
  await expect(fab).toBeHidden();
  await capture(page, "storefront-pdp-cta-390");
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect(fab).toBeVisible();
});

test("given reduced motion, when the visitor stays on the page, then the button never wiggles; without it, it wiggles every ~6–8 s until the panel is opened", async ({ browser }) => {
  const still = await browser.newPage({ reducedMotion: "reduce", viewport: { width: 1280, height: 800 } });
  await open(still, "/sul");
  await expect(still.getByTestId("promo-fab")).toBeVisible({ timeout: 30_000 });
  await still.evaluate(() => { (window as unknown as { __wiggles: number }).__wiggles = 0; new MutationObserver(() => { if (document.querySelector(".promo-wiggle")) (window as unknown as { __wiggles: number }).__wiggles++; }).observe(document.body, { attributes: true, subtree: true, attributeFilter: ["class"] }); });
  await still.waitForTimeout(8_000);
  expect(await still.evaluate(() => (window as unknown as { __wiggles: number }).__wiggles)).toBe(0);
  await still.close();

  const moving = await browser.newPage({ reducedMotion: "no-preference", viewport: { width: 1280, height: 800 } });
  await open(moving, "/sul");
  await expect(moving.getByTestId("promo-fab")).toBeVisible({ timeout: 30_000 });
  await expect(moving.locator(".promo-wiggle")).toHaveCount(1, { timeout: 12_000 });
  await expect(moving.locator(".promo-wiggle")).toHaveCount(0, { timeout: 2_000 }); // back to rest
  await expect(moving.locator(".promo-wiggle")).toHaveCount(1, { timeout: 12_000 }); // and again, without any limit
  // Once the panel was opened, quiet for the rest of the session.
  await moving.getByTestId("promo-fab").click();
  await moving.getByTestId("promo-close").click();
  expect(await moving.evaluate(() => sessionStorage.getItem("origens:promo:quiet"))).toBe("1");
  await moving.close();
});

test("given every item is disabled and published, when the storefront loads, then there is no button and no reserved space", async ({ page }) => {
  await chooseRegion(page, "Sul");
  await open(page, "/admin/promocoes");
  for (let i = 0; i < 5; i++) await page.getByTestId(`promo-enabled-${i}`).uncheck();
  await expect(page.getByTestId("promo-preview-empty")).toBeVisible();
  await page.getByTestId("save-promotions").click();
  await expect(flash(page, /salvo/)).toBeVisible();
  // Still public until published.
  expect((await api(page, "sul")).body.items).toHaveLength(3);
  await open(page, "/admin/publicar");
  await page.getByRole("button", { name: "Publicar no sandbox local" }).click();
  await expect(flash(page, /Publicado no sandbox local/)).toBeVisible({ timeout: 300_000 });
  expect((await api(page, "sul")).body.items).toEqual([]);
  await open(page, "/sul");
  await page.waitForTimeout(4_000);
  await expect(page.getByTestId("promo-fab")).toHaveCount(0);

  // Leave the sandbox with the live set again (handy for manual QA after the run).
  await open(page, "/admin/promocoes");
  for (let i = 0; i < 5; i++) await page.getByTestId(`promo-enabled-${i}`).check();
  await page.getByTestId("save-promotions").click();
  await expect(flash(page, /salvo/)).toBeVisible();
  await open(page, "/admin/publicar");
  await page.getByRole("button", { name: "Publicar no sandbox local" }).click();
  await expect(flash(page, /Publicado no sandbox local/)).toBeVisible({ timeout: 300_000 });
});
