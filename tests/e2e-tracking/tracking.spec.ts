import { expect, test, type BrowserContext, type Page } from "@playwright/test";

/**
 * Global + per-region Meta Pixel / GA4, configured in the CMS and observed on the storefront with the SDKs MOCKED (no real pixel, ever):
 *   Sul = legacy IDs (build-time, until an explicit choice replaces them) · Norte = its own Meta + inherited GA4 · Centro-Oeste = inherited
 *   Meta + GA4 off. Every region's events carry only that region's IDs; the admin emits nothing; a draft never changes production.
 */
const hydrated = (page: Page) => page.waitForFunction(() => document.documentElement.dataset.hydrated === "true", undefined, { timeout: 180_000 });
async function open(page: Page, url: string) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 300_000 });
  await hydrated(page);
}
async function chooseRegion(page: Page, name: "Sul" | "Norte" | "Centro-Oeste") {
  await open(page, "/admin");
  await page.getByRole("form", { name: "Região em edição" }).getByRole("button", { name: new RegExp(`^${name}`) }).click();
  await expect(page.getByRole("form", { name: "Região em edição" }).getByRole("button", { name: new RegExp(`^${name}`) })).toHaveAttribute("aria-pressed", "true");
}

/** Mocks fbq/gtag before any page script and reports every call to Node; any real request to Meta/Google is recorded and must stay empty. */
async function withMocks(context: BrowserContext, page: Page) {
  const fbq: unknown[][] = [];
  const gtag: unknown[][] = [];
  const real: string[] = [];
  await context.route(/connect\.facebook\.net|facebook\.com\/tr|googletagmanager\.com|google-analytics\.com/, (route) => {
    real.push(route.request().url());
    return route.abort();
  });
  await page.exposeFunction("__fbq", (a: unknown[]) => fbq.push(a));
  await page.exposeFunction("__gtag", (a: unknown[]) => gtag.push(a));
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    w.fbq = (...a: unknown[]) => (w.__fbq as (a: unknown[]) => void)(a);
    w.gtag = (...a: unknown[]) => (w.__gtag as (a: unknown[]) => void)(a);
  });
  return { fbq, gtag, real };
}
const metaIds = (calls: unknown[][]) => [...new Set(calls.filter((c) => c[0] === "init" || c[0] === "trackSingle" || c[0] === "trackSingleCustom").map((c) => (c[0] === "init" ? c[1] : c[1])))];
const untargetedMeta = (calls: unknown[][]) => calls.filter((c) => c[0] === "track" || c[0] === "trackCustom");
const gaIds = (calls: unknown[][]) => [...new Set(calls.flatMap((c) => (c[0] === "config" ? [c[1]] : c[0] === "event" ? [(c[2] as { send_to?: string } | undefined)?.send_to] : [])))];

test.describe.configure({ mode: "serial" });

async function saveTracking(page: Page, section: string, meta: { mode: string; id?: string }, ga4: { mode: string; id?: string }) {
  const card = page.locator(`section[aria-labelledby="t-${section}"]`);
  const fieldset = (tool: string) => card.locator("fieldset", { hasText: tool });
  for (const [tool, v] of [["Meta Pixel", meta], ["Google Analytics 4", ga4]] as const) {
    const f = fieldset(tool);
    await f.getByRole("radio", { name: v.mode === "inherit" ? "Herdar o global" : v.mode === "override" ? (section === "global" ? "Ativo com este ID" : "Usar ID próprio") : v.mode === "legacy" ? /^Legado/ : section === "global" ? /Inativo/ : "Desligado" }).check();
    await f.locator("input[type=text], input:not([type])").nth(0).fill(v.id ?? "");
  }
  await card.getByRole("button", { name: /Salvar rascunho/ }).click();
  await expect(page.getByText(/Rascunho de tracking salvo/)).toBeVisible();
}

test("given the CMS is configured, when the three regions are visited, then each sends only to its own IDs and Sul keeps the legacy ones", async ({ page, context }) => {
  const mocks = await withMocks(context, page);

  // Before anything is published: Sul = legacy build-time IDs, and ONLY Sul (Norte/Centro-Oeste are not public yet).
  await open(page, "/sul");
  await expect.poll(() => metaIds(mocks.fbq)).toEqual(["1111111111111111"]);
  await expect.poll(() => gaIds(mocks.gtag)).toEqual(["G-LEGACY0001"]);

  // The admin never fires a pixel: visiting the tracking screen and the preview adds no call at all.
  const beforeAdmin = { f: mocks.fbq.length, g: mocks.gtag.length };
  await open(page, "/admin/tracking");
  await open(page, "/admin/publicar");
  await page.waitForTimeout(1500);
  expect({ f: mocks.fbq.length, g: mocks.gtag.length }).toEqual(beforeAdmin);

  // Global: active Meta + GA4 (draft → confirmed publish).
  await chooseRegion(page, "Sul");
  await open(page, "/admin/tracking");
  await saveTracking(page, "global", { mode: "override", id: "4444444444444444" }, { mode: "override", id: "G-GLOBAL0001" });
  // Nobody inherits it yet, so no region's effective ID changes and no confirmation is asked.
  await page.getByRole("button", { name: "Publicar tracking global" }).click();
  await expect(page.getByText(/Tracking global publicado/)).toBeVisible({ timeout: 300_000 });
  // Publishing the global changed nobody: Sul is still legacy (it never inherited), Norte/Centro-Oeste are still 'unconfigured'.
  await open(page, "/admin/tracking");
  await expect(page.getByTestId("eff-sul-meta")).toContainText("1111111111111111");
  await expect(page.getByTestId("eff-sul-meta")).toContainText("legado");
  await expect(page.getByTestId("eff-norte-meta").locator("td").nth(2)).toContainText("nenhum");

  // Norte: own Meta, inherited GA4; then launch it.  Centro-Oeste: inherited Meta, GA4 off; then launch it.
  const setup = async (region: "Norte" | "Centro-Oeste", section: string, meta: { mode: string; id?: string }, ga4: { mode: string; id?: string }) => {
    await chooseRegion(page, region);
    await open(page, "/admin/home");
    await page.getByRole("button", { name: "Criar home inicial" }).click();
    await expect(page.getByText(/Home inicial criada no rascunho/)).toBeVisible();
    await open(page, "/admin/tracking");
    await saveTracking(page, section, meta, ga4);
    await open(page, "/admin/publicar");
    await expect(page.getByText(/Ainda não dá para lançar/)).toHaveCount(0);
    // The launch changes the effective IDs of this region: it must be confirmed.
    await page.getByRole("button", { name: new RegExp(`Lançar ${region}`) }).click();
    await expect(page.getByText(/Confirme os IDs/)).toBeVisible({ timeout: 300_000 });
    await page.getByLabel(/Revisei os IDs efetivos/).first().check();
    await page.getByRole("button", { name: new RegExp(`Lançar ${region}`) }).click();
    await expect(page.getByText(new RegExp(`${region} lançada publicamente`))).toBeVisible({ timeout: 300_000 });
  };
  await setup("Norte", "norte", { mode: "override", id: "2222222222222222" }, { mode: "inherit" });
  await setup("Centro-Oeste", "centro-oeste", { mode: "inherit" }, { mode: "disabled" });

  // The effective table (published) matches what was configured.
  await open(page, "/admin/tracking");
  await expect(page.getByTestId("eff-norte-meta").locator("td").nth(2)).toContainText("2222222222222222");
  await expect(page.getByTestId("eff-norte-ga4").locator("td").nth(2)).toContainText("G-GLOBAL0001");
  await expect(page.getByTestId("eff-centro-oeste-meta").locator("td").nth(2)).toContainText("4444444444444444");
  await expect(page.getByTestId("eff-centro-oeste-ga4").locator("td").nth(2)).toContainText("nenhum");

  // Storefront: one visit per region, each in a fresh page load; the calls of a visit reference only that region's IDs.
  const visit = async (url: string) => {
    const f0 = mocks.fbq.length;
    const g0 = mocks.gtag.length;
    await open(page, url);
    await page.waitForTimeout(2000);
    return { meta: mocks.fbq.slice(f0), ga: mocks.gtag.slice(g0) };
  };
  const sul = await visit("/sul");
  expect(metaIds(sul.meta)).toEqual(["1111111111111111"]);
  expect(gaIds(sul.ga)).toEqual(["G-LEGACY0001"]);
  const norte = await visit("/norte");
  expect(metaIds(norte.meta)).toEqual(["2222222222222222"]);
  expect(gaIds(norte.ga)).toEqual(["G-GLOBAL0001"]);
  const centro = await visit("/centro-oeste");
  expect(metaIds(centro.meta)).toEqual(["4444444444444444"]);
  expect(gaIds(centro.ga)).toEqual([]); // GA4 off for this region: no config, no event at all
  const back = await visit("/sul");
  expect(metaIds(back.meta)).toEqual(["1111111111111111"]);
  expect(gaIds(back.ga)).toEqual(["G-LEGACY0001"]);

  // Captures for the Round 8 report: the new public homes at 375 px and desktop, and the Tracking screen (docs/screenshots/2026-09-25-round8).
  if (process.env.CMS_CAPTURE_DIR) {
    const shot = async (name: string, url: string, width: number, height: number) => {
      await page.setViewportSize({ width, height });
      await open(page, url);
      await page.waitForTimeout(1500);
      await page.screenshot({ path: `${process.env.CMS_CAPTURE_DIR}/${name}.png`, fullPage: true });
    };
    for (const [slug, label] of [["norte", "norte"], ["centro-oeste", "centro-oeste"]] as const) {
      await shot(`${label}-375`, `/${slug}`, 375, 812);
      await shot(`${label}-desktop`, `/${slug}`, 1280, 900);
    }
    await shot("admin-tracking-desktop", "/admin/tracking", 1280, 900);
    await shot("admin-tracking-375", "/admin/tracking", 375, 812);
    await shot("admin-publicar-centro-oeste-desktop", "/admin/publicar", 1280, 900);
    await shot("admin-visao-geral-desktop", "/admin", 1280, 900);
  }

  // Never an untargeted send (it would reach every pixel the SDK ever initialised), never a real request.
  expect(untargetedMeta(mocks.fbq)).toEqual([]);
  expect(mocks.real).toEqual([]);
});

test("given Norte is switched off and Sul moves to its own ID, when both are published, then production follows only after the confirmed publish", async ({ page, context }) => {
  const mocks = await withMocks(context, page);
  // Draft first: Sul chooses its own Meta ID. Storefront must not change before the publish.
  await chooseRegion(page, "Sul");
  await open(page, "/admin/tracking");
  await saveTracking(page, "sul", { mode: "override", id: "3333333333333333" }, { mode: "legacy" });
  const f0 = mocks.fbq.length;
  await open(page, "/sul");
  await page.waitForTimeout(2000);
  expect(metaIds(mocks.fbq.slice(f0))).toEqual(["1111111111111111"]); // still the legacy pixel: a draft changes nothing

  // The publish needs the confirmation of the effective IDs.
  await open(page, "/admin/publicar");
  await page.getByRole("button", { name: "Publicar no sandbox local" }).click();
  await expect(page.getByText(/Confirme os IDs/)).toBeVisible({ timeout: 300_000 });
  await page.getByLabel(/Revisei os IDs efetivos/).first().check();
  await page.getByRole("button", { name: "Publicar no sandbox local" }).click();
  await expect(page.getByText(/Publicado no sandbox local/)).toBeVisible({ timeout: 300_000 });
  const f1 = mocks.fbq.length;
  await open(page, "/sul");
  await page.waitForTimeout(2000);
  expect(metaIds(mocks.fbq.slice(f1))).toEqual(["3333333333333333"]);
  // Norte, published earlier, is untouched by Sul's publish.
  const f2 = mocks.fbq.length;
  await open(page, "/norte");
  await page.waitForTimeout(2000);
  expect(metaIds(mocks.fbq.slice(f2))).toEqual(["2222222222222222"]);
  expect(mocks.real).toEqual([]);
});
