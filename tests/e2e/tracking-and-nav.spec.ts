import { expect, test, type Page } from "@playwright/test";

/** Injects a capturing `window.fbq` mock before any page script runs — the same approach
 * CLAUDE_ADENDO_4_EVENTOS_META_STOREFRONT.md §3 asks for ("Usar fbq mockado"), and it lets the calling
 * semantics (dedup, params) be verified without a real NEXT_PUBLIC_META_PIXEL_ID or any request to Meta.
 *
 * Calls are reported to a Node-side array via `page.exposeFunction` rather than stored on `window`: a
 * GoToInk test clicks a real `<a href="https://www.usesul.com.br/...">` (its default navigation blocked by
 * `blockInkNavigation`, not by aborting the request — see that helper's own comment for why). A `window`-held
 * array would still be at risk of a real top-level navigation unloading the document before it's read back;
 * the Node-side array has no such risk, and the exposed-function bridge itself is confirmed synchronous enough
 * once the document never unloads (verified empirically — see the GoToInk tests below). */
async function withFbqMock(page: Page): Promise<unknown[][]> {
  const calls: unknown[][] = [];
  await page.exposeFunction("__reportFbq", (args: unknown[]) => calls.push(args));
  await page.addInitScript(() => {
    (window as unknown as { fbq: (...args: unknown[]) => void }).fbq = (...args: unknown[]) => {
      (window as unknown as { __reportFbq: (args: unknown[]) => void }).__reportFbq(args);
    };
  });
  return calls;
}
function fbqCalls(calls: unknown[][], event?: string) {
  return event ? calls.filter((c) => c[1] === event) : calls;
}
/** For `fbq('consent', 'grant'|'revoke')` / `fbq('init', id)` — the method itself (not an event name) sits at
 * index 0, unlike `fbq('track'|'trackCustom', eventName, params)` where the event name is at index 1. */
function fbqMethodCalls(calls: unknown[][], method: string) {
  return calls.filter((c) => c[0] === method);
}

/**
 * Prevents the browser's default navigation for a real INK link, without aborting the network request.
 *
 * Aborting via `page.route(...).abort()` was tried first, but even an aborted request still makes Chromium
 * attempt the real top-level navigation and then unload the current document to a network-error page — races
 * the async `exposeFunction` IPC that reports a `fbq` call back to Node, losing the call roughly half the time
 * (confirmed empirically with a repeated debug run). A capture-phase `click` listener on `document`, added
 * before React's own bubble-phase handler runs, calls `preventDefault()` on the real anchor only — the
 * document never unloads, so there is no race, and React's own `onClick` (a separate listener on the same
 * event) still fires normally since `stopPropagation` is never called. */
async function blockInkNavigation(page: Page) {
  await page.addInitScript(() => {
    document.addEventListener(
      "click",
      (e) => {
        const target = e.target as HTMLElement | null;
        const link = target?.closest?.('a[href^="https://www.usesul.com.br"]');
        if (link) e.preventDefault();
      },
      true,
    );
  });
}

/**
 * The city search index (`/api/cidades/{region}`) loads on demand, the first time the dialog opens — a real
 * fetch that, under the heavy concurrent load of a full parallel test run, has occasionally not resolved to
 * any suggestion within a generous wait. `CitySearch`'s own `loadIndex` retries on the *next* focus after a
 * failed fetch (its cache entry is deleted on rejection — see the component), so reopening the dialog once
 * gives a stalled/failed load a second real chance instead of just waiting longer on the same one. */
async function fillAndAwaitSuggestion(page: Page, openDialog: () => Promise<import("@playwright/test").Locator>, term: string) {
  let dialog = await openDialog();
  for (let attempt = 0; attempt < 2; attempt++) {
    await dialog.getByRole("combobox").fill(term);
    try {
      await dialog.getByRole("option").first().waitFor({ state: "visible", timeout: 15_000 });
      return dialog;
    } catch (err) {
      if (attempt === 1) throw err;
      await page.keyboard.press("Escape");
      dialog = await openDialog();
    }
  }
  return dialog;
}

/** Same idea as `withFbqMock` above, for GA4 (CLAUDE_GA4_STOREFRONT_TRACKING.md §15: "bloquear/mockar qualquer
 * request real ao Google... o teste deve provar que sem consentimento → nenhuma chamada, e não simplesmente
 * passar porque a env está ausente"). Kept independent of `withFbqMock` (not merged into one shared mock) so
 * every already-passing Meta-only test stays exactly as it was — new GA4 coverage is purely additive. */
async function withGtagMock(page: Page): Promise<unknown[][]> {
  const calls: unknown[][] = [];
  await page.exposeFunction("__reportGtag", (args: unknown[]) => calls.push(args));
  await page.addInitScript(() => {
    (window as unknown as { gtag: (...args: unknown[]) => void }).gtag = (...args: unknown[]) => {
      (window as unknown as { __reportGtag: (args: unknown[]) => void }).__reportGtag(args);
    };
  });
  return calls;
}
/** `gtag('event', eventName, params)` — the event name sits at index 1, same convention as `fbqCalls`. */
function gaCalls(calls: unknown[][], eventName?: string) {
  return eventName ? calls.filter((c) => c[0] === "event" && c[1] === eventName) : calls;
}
/** `gtag('consent'|'config'|'js', ...)` — the method itself sits at index 0, same convention as `fbqMethodCalls`. */
function gaMethodCalls(calls: unknown[][], method: string) {
  return calls.filter((c) => c[0] === method);
}

/** Pre-seeds an "accepted" decision (current CONSENT_VERSION) before any page script runs — every event helper is
 * consent-gated, so tests about *what* an event carries must start from a visitor who already said yes. Tests
 * about the consent flow itself click the real banner instead. */
async function grantConsent(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "useorigens:consent:marketing",
      JSON.stringify({ choice: "accepted", version: 2, decidedAt: "2026-09-23T00:00:00.000Z" }),
    );
  });
}

test.describe("Meta tracking: Search, SelectCity, GoToInk semantics (fbq mocked, no real Pixel/network)", () => {
  test("given no consent decision, when the site is used normally, then zero requests ever go to Meta", async ({ page }) => {
    const metaRequests: string[] = [];
    page.on("request", (req) => {
      if (req.url().includes("facebook.net") || req.url().includes("facebook.com/tr")) metaRequests.push(req.url());
    });
    // Not `waitUntil: "domcontentloaded"`: this test clicks the search trigger almost immediately after
    // navigating, and the default `waitUntil` gives React time to hydrate and attach its onClick first —
    // the same reasoning `sul.spec.ts`'s own `openHeroSearch` helper already relies on.
    await page.goto("/sul");
    const openDialog = async () => {
      await page.getByRole("button", { name: /Busque sua cidade/ }).first().click();
      const dialog = page.getByRole("dialog", { name: "Buscar cidade" });
      await expect(dialog).toBeVisible();
      return dialog;
    };
    await fillAndAwaitSuggestion(page, openDialog, "floripa");
    await page.keyboard.press("Enter");
    await page.waitForURL(/\/sul\/sc\/florianopolis$/);
    expect(metaRequests, JSON.stringify(metaRequests)).toEqual([]);
  });

  test("given the consent banner, when Rejeitar is clicked, then it disappears and no Meta request follows", async ({ page }) => {
    const metaRequests: string[] = [];
    page.on("request", (req) => {
      if (req.url().includes("facebook.net")) metaRequests.push(req.url());
    });
    await page.goto("/sul", { waitUntil: "domcontentloaded" });
    const banner = page.getByRole("region", { name: "Preferências de cookies" });
    await expect(banner).toBeVisible();
    await banner.getByRole("button", { name: "Rejeitar" }).click();
    await expect(banner).toBeHidden();
    await page.reload({ waitUntil: "domcontentloaded" });
    // A real decision was stored — the banner must not reappear on its own (only via "Preferências de privacidade").
    await expect(page.getByRole("region", { name: "Preferências de cookies" })).toBeHidden();
    expect(metaRequests).toEqual([]);
  });

  test("given the consent banner, when Aceitar is clicked, then the Pixel loads and exactly one PageView fires, no retroactive replay", async ({ page }) => {
    // Defense in depth on top of the fbq mock below: even if the mock were ever bypassed, no real request to
    // Meta's CDN can leave this test.
    await page.route("https://connect.facebook.net/**", (route) => route.abort());
    const calls = await withFbqMock(page);
    await page.goto("/sul");
    const banner = page.getByRole("region", { name: "Preferências de cookies" });
    await expect(banner).toBeVisible();
    await banner.getByRole("button", { name: "Aceitar" }).click();
    await expect(banner).toBeHidden();
    await page.waitForTimeout(300);
    // fbq is pre-mocked, so the classic shim's own `if(f.fbq)return;` short-circuits and never installs a
    // second, real fbq — 'consent'/'grant' and 'init' land directly on the mock, exactly like the real calls
    // the shim would otherwise have queued.
    expect(fbqMethodCalls(calls, "consent")).toHaveLength(1);
    expect(fbqMethodCalls(calls, "init")).toHaveLength(1);
    expect(fbqCalls(calls, "PageView")).toHaveLength(1); // exactly one — the acceptance itself, nothing retroactive
  });

  test("given consent already accepted, when a real client-side navigation happens, then exactly one more PageView fires (never on a modal open)", async ({ page }) => {
    await page.route("https://connect.facebook.net/**", (route) => route.abort());
    const calls = await withFbqMock(page);
    await page.goto("/sul");
    await page.getByRole("region", { name: "Preferências de cookies" }).getByRole("button", { name: "Aceitar" }).click();
    await page.waitForTimeout(300);
    expect(fbqCalls(calls, "PageView")).toHaveLength(1);
    // Opening the search dialog is not a navigation — must not add a PageView.
    await page.getByRole("button", { name: /Busque sua cidade/ }).first().click();
    await expect(page.getByRole("dialog", { name: "Buscar cidade" })).toBeVisible();
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
    expect(fbqCalls(calls, "PageView")).toHaveLength(1);
    // A real navigation must add exactly one more.
    await page.goto("/sul/sc/tijucas");
    await page.waitForTimeout(300);
    expect(fbqCalls(calls, "PageView")).toHaveLength(2);
  });

  test("given an accepted decision, when revoked via the footer 'Preferências de privacidade', then fbq('consent','revoke') fires and the banner reappears for a fresh choice", async ({ page }) => {
    await page.route("https://connect.facebook.net/**", (route) => route.abort());
    const calls = await withFbqMock(page);
    await page.goto("/sul");
    await page.getByRole("region", { name: "Preferências de cookies" }).getByRole("button", { name: "Aceitar" }).click();
    await page.waitForTimeout(300);
    expect(fbqCalls(calls, "PageView")).toHaveLength(1);
    await page.getByRole("button", { name: "Preferências de privacidade" }).first().click();
    await page.waitForTimeout(200);
    expect(fbqMethodCalls(calls, "consent").some((c) => c[1] === "revoke")).toBe(true);
    // No further tracking after revocation — the choice was cleared, not swapped for a new "accepted" one.
    await expect(page.getByRole("region", { name: "Preferências de cookies" })).toBeVisible();
    const totalAfterRevoke = calls.length;
    await page.goto("/sul/sc/tijucas");
    await page.waitForTimeout(300);
    expect(calls.length).toBe(totalAfterRevoke); // no retroactive or resumed events
  });

  test("given typing without submitting, when 10 characters are typed, then zero Search events fire", async ({ page }) => {
    const calls = await withFbqMock(page);
    await page.goto("/sul");
    await page.getByRole("button", { name: /Busque sua cidade/ }).first().click();
    const dialog = page.getByRole("dialog", { name: "Buscar cidade" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("combobox").fill("florianopol");
    await page.waitForTimeout(300);
    expect(fbqCalls(calls, "Search")).toEqual([]);
  });

  test("given a search resolved by selecting a suggestion, when chosen, then exactly one Search and one SelectCity fire, same gesture", async ({ page }) => {
    await grantConsent(page);
    const calls = await withFbqMock(page);
    await page.goto("/sul", { waitUntil: "domcontentloaded" });
    const dialog = await page.getByRole("button", { name: /Busque sua cidade/ }).first().click().then(() => page.getByRole("dialog", { name: "Buscar cidade" }));
    await dialog.getByRole("combobox").fill("tij");
    await dialog.getByRole("option", { name: /Tijucas/ }).first().click();
    await page.waitForURL(/\/sul\/sc\/tijucas$/);
    const searches = fbqCalls(calls, "Search");
    const selects = fbqCalls(calls, "SelectCity");
    expect(searches).toHaveLength(1);
    expect(selects).toHaveLength(1);
    expect(searches[0][2]).toMatchObject({ search_string: expect.stringContaining("Tijucas") });
    expect(selects[0][2]).toMatchObject({ city: "Tijucas", state: "SC", region: "sul" });
  });

  test("given a city clicked in the state page's mesoregion listing, when clicked, then exactly one SelectCity fires and zero Search", async ({ page }) => {
    await grantConsent(page);
    const calls = await withFbqMock(page);
    await page.goto("/sul/sc", { waitUntil: "domcontentloaded" });
    await page.getByRole("link", { name: /^Grande Florianópolis/ }).first().click();
    await page.locator("details#grande-florianopolis").getByRole("link", { name: "Tijucas" }).click();
    await page.waitForURL(/\/sul\/sc\/tijucas$/);
    expect(fbqCalls(calls, "SelectCity")).toHaveLength(1);
    expect(fbqCalls(calls, "Search")).toEqual([]);
  });

  test("given the same city reached by direct URL, when the page loads, then zero SelectCity fires", async ({ page }) => {
    const calls = await withFbqMock(page);
    await page.goto("/sul/sc/tijucas", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(300);
    expect(fbqCalls(calls, "SelectCity")).toEqual([]);
  });

  test("given a city style card with no variants, when clicked, then exactly one GoToInk fires with a real product_id, and navigation still reaches INK", async ({ page }) => {
    await grantConsent(page);
    const calls = await withFbqMock(page);
    await blockInkNavigation(page);
    // Not `waitUntil: "domcontentloaded"`: this test clicks almost immediately after navigating, and giving
    // React time to hydrate and attach its onClick before that click happens avoids a real (if less likely
    // under normal load) race — the same reasoning `sul.spec.ts`'s own `openHeroSearch` helper already relies
    // on by using the default `waitUntil`.
    await page.goto("/sul/sc/tijucas");
    const card = page.getByRole("link", { name: /Comprar Ponto de Origem de Tijucas na loja/ });
    const href = await card.getAttribute("href");
    await card.click();
    const goToInk = fbqCalls(calls, "GoToInk");
    expect(goToInk).toHaveLength(1);
    expect(goToInk[0][2]).toMatchObject({ source_section: "city_styles", city: "Tijucas", state: "SC" });
    expect(href).toMatch(/^https:\/\/www\.usesul\.com\.br\//);
  });

  test("given the PDP's own buy button, when clicked, then exactly one GoToInk fires (source_section: pdp)", async ({ page }) => {
    await grantConsent(page);
    const calls = await withFbqMock(page);
    await blockInkNavigation(page);
    await page.goto("/sul/pr/pato-branco/ponto-de-origem");
    const cta = page.getByRole("link", { name: "Escolher tamanho na loja" });
    await cta.click();
    const goToInk = fbqCalls(calls, "GoToInk");
    expect(goToInk).toHaveLength(1);
    expect(goToInk[0][2]).toMatchObject({ source_section: "pdp" });
  });

  test("given a home carousel product (shared ProductCarousel click point), when clicked, then exactly one GoToInk fires, never ViewContent/Purchase", async ({ page }) => {
    await grantConsent(page);
    const calls = await withFbqMock(page);
    await blockInkNavigation(page);
    await page.goto("/sul", { waitUntil: "networkidle" });
    // Scoped to the `<ul>` of product cards, not just "#terra a.group": the carousel's own "Ver todos" link
    // also carries the `group` class (and renders before the product items), so an unscoped `a.group` matched
    // that instead — a real product-card link, with the GoToInk onClick, only exists inside the item list.
    const terra = page.locator("#terra ul a.group").first();
    await terra.click();
    const goToInk = fbqCalls(calls, "GoToInk");
    const forbidden = calls.filter((c) => ["ViewContent", "Purchase", "AddToCart", "InitiateCheckout"].includes(c[1] as string));
    expect(goToInk).toHaveLength(1);
    expect(goToInk[0][2]).toMatchObject({ source_section: "home_terra" });
    expect(forbidden).toEqual([]);
  });
});

test.describe("GA4 tracking: page_view, view_search_results, select_city, select_state, select_item, go_to_ink (gtag mocked, no real GA4/network)", () => {
  test("given no consent decision, when the site is used normally, then zero requests ever go to Google", async ({ page }) => {
    const gaRequests: string[] = [];
    page.on("request", (req) => {
      if (req.url().includes("googletagmanager.com") || req.url().includes("google-analytics.com")) gaRequests.push(req.url());
    });
    await page.goto("/sul");
    const openDialog = async () => {
      await page.getByRole("button", { name: /Busque sua cidade/ }).first().click();
      const dialog = page.getByRole("dialog", { name: "Buscar cidade" });
      await expect(dialog).toBeVisible();
      return dialog;
    };
    await fillAndAwaitSuggestion(page, openDialog, "floripa");
    await page.keyboard.press("Enter");
    await page.waitForURL(/\/sul\/sc\/florianopolis$/);
    expect(gaRequests, JSON.stringify(gaRequests)).toEqual([]);
  });

  test("given the consent banner, when Rejeitar is clicked, then no GA4 request follows, even after navigation", async ({ page }) => {
    const gaRequests: string[] = [];
    page.on("request", (req) => {
      if (req.url().includes("googletagmanager.com") || req.url().includes("google-analytics.com")) gaRequests.push(req.url());
    });
    await page.goto("/sul", { waitUntil: "domcontentloaded" });
    const banner = page.getByRole("region", { name: "Preferências de cookies" });
    await expect(banner).toBeVisible();
    await banner.getByRole("button", { name: "Rejeitar" }).click();
    await expect(banner).toBeHidden();
    await page.goto("/sul/sc/tijucas", { waitUntil: "domcontentloaded" });
    expect(gaRequests).toEqual([]);
  });

  test("given the consent banner, when Aceitar is clicked, then GA4 loads with send_page_view:false and exactly one manual page_view fires, no retroactive replay", async ({ page }) => {
    // Defense in depth on top of the gtag mock below, same reasoning as the Meta accept test.
    await page.route("https://www.googletagmanager.com/**", (route) => route.abort());
    const calls = await withGtagMock(page);
    await page.goto("/sul");
    const banner = page.getByRole("region", { name: "Preferências de cookies" });
    await expect(banner).toBeVisible();
    await banner.getByRole("button", { name: "Aceitar" }).click();
    await expect(banner).toBeHidden();
    await page.waitForTimeout(300);
    // gtag is pre-mocked, so the bootstrap's own `if(!w.gtag)` guard short-circuits and never installs a
    // second, real gtag — 'js'/'config' land directly on the mock.
    expect(gaMethodCalls(calls, "js")).toHaveLength(1);
    const configCalls = gaMethodCalls(calls, "config");
    expect(configCalls).toHaveLength(1);
    // send_page_view:false is what stops GA4's own automatic page_view — the only page_view must be the
    // helper's manual one below, never a second, config-time one.
    expect(configCalls[0][2]).toMatchObject({ send_page_view: false });
    expect(gaCalls(calls, "page_view")).toHaveLength(1); // exactly one — the acceptance itself, nothing retroactive
  });

  test("given consent already accepted, when a real client-side navigation happens, then exactly one more page_view fires (never on a modal open)", async ({ page }) => {
    await page.route("https://www.googletagmanager.com/**", (route) => route.abort());
    const calls = await withGtagMock(page);
    await page.goto("/sul");
    await page.getByRole("region", { name: "Preferências de cookies" }).getByRole("button", { name: "Aceitar" }).click();
    await page.waitForTimeout(300);
    expect(gaCalls(calls, "page_view")).toHaveLength(1);
    await page.getByRole("button", { name: /Busque sua cidade/ }).first().click();
    await expect(page.getByRole("dialog", { name: "Buscar cidade" })).toBeVisible();
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
    expect(gaCalls(calls, "page_view")).toHaveLength(1);
    await page.goto("/sul/sc/tijucas");
    await page.waitForTimeout(300);
    expect(gaCalls(calls, "page_view")).toHaveLength(2);
  });

  test("given an accepted decision, when revoked via the footer 'Preferências de privacidade', then Consent Mode is updated to denied and no further events fire", async ({ page }) => {
    await page.route("https://www.googletagmanager.com/**", (route) => route.abort());
    const calls = await withGtagMock(page);
    await page.goto("/sul");
    await page.getByRole("region", { name: "Preferências de cookies" }).getByRole("button", { name: "Aceitar" }).click();
    await page.waitForTimeout(300);
    expect(gaCalls(calls, "page_view")).toHaveLength(1);
    await page.getByRole("button", { name: "Preferências de privacidade" }).first().click();
    await page.waitForTimeout(200);
    const consentUpdates = gaMethodCalls(calls, "consent");
    expect(consentUpdates.some((c) => c[2] && (c[2] as Record<string, unknown>).analytics_storage === "denied")).toBe(true);
    await expect(page.getByRole("region", { name: "Preferências de cookies" })).toBeVisible();
    const totalAfterRevoke = calls.length;
    await page.goto("/sul/sc/tijucas");
    await page.waitForTimeout(300);
    expect(calls.length).toBe(totalAfterRevoke);
  });

  test("given typing without submitting, when 10 characters are typed, then zero view_search_results events fire", async ({ page }) => {
    const calls = await withGtagMock(page);
    await page.goto("/sul");
    await page.getByRole("button", { name: /Busque sua cidade/ }).first().click();
    const dialog = page.getByRole("dialog", { name: "Buscar cidade" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("combobox").fill("florianopol");
    await page.waitForTimeout(300);
    expect(gaCalls(calls, "view_search_results")).toEqual([]);
  });

  test("given a search resolved by selecting a suggestion, when chosen, then exactly one view_search_results and one select_city fire, same gesture", async ({ page }) => {
    await grantConsent(page);
    const calls = await withGtagMock(page);
    await page.goto("/sul", { waitUntil: "domcontentloaded" });
    const dialog = await page.getByRole("button", { name: /Busque sua cidade/ }).first().click().then(() => page.getByRole("dialog", { name: "Buscar cidade" }));
    await dialog.getByRole("combobox").fill("tij");
    await dialog.getByRole("option", { name: /Tijucas/ }).first().click();
    await page.waitForURL(/\/sul\/sc\/tijucas$/);
    const searches = gaCalls(calls, "view_search_results");
    const selects = gaCalls(calls, "select_city");
    expect(searches).toHaveLength(1);
    expect(selects).toHaveLength(1);
    expect(searches[0][2]).toMatchObject({ search_term: expect.stringContaining("Tijucas") });
    expect(selects[0][2]).toMatchObject({ city: "Tijucas", state: "SC", region: "sul", source: "hero_search" });
  });

  test("given a city clicked in the state page's mesoregion listing, when clicked, then exactly one select_city fires (source: state_mesoregion) and zero view_search_results", async ({ page }) => {
    await grantConsent(page);
    const calls = await withGtagMock(page);
    await page.goto("/sul/sc", { waitUntil: "domcontentloaded" });
    await page.getByRole("link", { name: /^Grande Florianópolis/ }).first().click();
    await page.locator("details#grande-florianopolis").getByRole("link", { name: "Tijucas" }).click();
    await page.waitForURL(/\/sul\/sc\/tijucas$/);
    const selects = gaCalls(calls, "select_city");
    expect(selects).toHaveLength(1);
    expect(selects[0][2]).toMatchObject({ source: "state_mesoregion" });
    expect(gaCalls(calls, "view_search_results")).toEqual([]);
  });

  test("given the same city reached by direct URL, when the page loads, then zero select_city fires", async ({ page }) => {
    const calls = await withGtagMock(page);
    await page.goto("/sul/sc/tijucas", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(300);
    expect(gaCalls(calls, "select_city")).toEqual([]);
  });

  test("given a state clicked in the header Regiões dropdown, when clicked, then exactly one select_state fires (source: state_selector)", async ({ page }) => {
    await grantConsent(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    const calls = await withGtagMock(page);
    await page.goto("/sul", { waitUntil: "domcontentloaded" });
    await page.locator("summary", { hasText: "Regiões" }).first().click();
    const panel = page.locator("details:has(summary:text('Regiões')) ul").first();
    await panel.getByRole("link", { name: "Rio Grande do Sul" }).click();
    await page.waitForURL(/\/sul\/rs$/);
    const selects = gaCalls(calls, "select_state");
    expect(selects).toHaveLength(1);
    expect(selects[0][2]).toMatchObject({ state: "RS", region: "sul", source: "state_selector" });
  });

  test("given the same state reached by direct URL, when the page loads, then zero select_state fires", async ({ page }) => {
    const calls = await withGtagMock(page);
    await page.goto("/sul/sc", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(300);
    expect(gaCalls(calls, "select_state")).toEqual([]);
  });

  test("given a city style card with no variants, when clicked, then select_item fires before go_to_ink, and both Meta's GoToInk and GA4's events share the same click", async ({ page }) => {
    await grantConsent(page);
    const meta = await withFbqMock(page);
    const ga = await withGtagMock(page);
    await blockInkNavigation(page);
    await page.goto("/sul/sc/tijucas");
    const card = page.getByRole("link", { name: /Comprar Ponto de Origem de Tijucas na loja/ });
    await card.click();
    // Meta's own contract is untouched by this round (still exactly GoToInk, once).
    expect(fbqCalls(meta, "GoToInk")).toHaveLength(1);
    // GA4: select_item immediately followed by go_to_ink — same click, same instrumentation point, never
    // ViewContent/Purchase/AddToCart on either provider.
    expect(gaCalls(ga, "select_item")).toHaveLength(1);
    const goToInk = gaCalls(ga, "go_to_ink");
    expect(goToInk).toHaveLength(1);
    expect(goToInk[0][2]).toMatchObject({ source_section: "city_styles", city: "Tijucas", state: "SC", product_name: "Ponto de Origem" });
    const forbidden = ga.filter((c) => c[0] === "event" && ["view_item", "add_to_cart", "begin_checkout", "purchase"].includes(c[1] as string));
    expect(forbidden).toEqual([]);
  });

  test("given the PDP's own buy button, when clicked, then exactly one select_item and one go_to_ink fire (source_section: pdp)", async ({ page }) => {
    await grantConsent(page);
    const calls = await withGtagMock(page);
    await blockInkNavigation(page);
    await page.goto("/sul/pr/pato-branco/ponto-de-origem");
    const cta = page.getByRole("link", { name: "Escolher tamanho na loja" });
    await cta.click();
    expect(gaCalls(calls, "select_item")).toHaveLength(1);
    const goToInk = gaCalls(calls, "go_to_ink");
    expect(goToInk).toHaveLength(1);
    expect(goToInk[0][2]).toMatchObject({ source_section: "pdp" });
  });
});

// <summary> is not exposed with role="button" in this Chromium/Playwright combination — targeted by tag +
// text instead. Both "Regiões" and "Sul" also match hidden (CSS `hidden lg:block`-style) duplicate trees
// used for the mobile layout, so `.first()` (DOM order: header comes before the home's own mobile sections).
function summaryTrigger(page: Page, text: string) {
  return page.locator("summary", { hasText: text }).first();
}

test.describe("Header: Regiões navigation and dropdown outside-click", () => {
  test("given the desktop header, when Regiões is opened, then it lists the three real states plus Ver estados, never the DDD category", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/sul", { waitUntil: "domcontentloaded" });
    await summaryTrigger(page, "Regiões").click();
    const panel = page.locator("details:has(summary:text('Regiões')) ul").first();
    await expect(panel.getByRole("link", { name: "Rio Grande do Sul" })).toHaveAttribute("href", "/sul/rs");
    await expect(panel.getByRole("link", { name: "Santa Catarina" })).toHaveAttribute("href", "/sul/sc");
    await expect(panel.getByRole("link", { name: "Paraná" })).toHaveAttribute("href", "/sul/pr");
    await expect(panel.getByRole("link", { name: "Ver estados" })).toHaveAttribute("href", "/sul#estados");
  });

  test("given the Regiões dropdown open, when clicking outside (over the hero), then it closes", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/sul", { waitUntil: "domcontentloaded" });
    const trigger = summaryTrigger(page, "Regiões");
    await trigger.click();
    const details = page.locator("details:has(summary:text('Regiões'))").first();
    await expect(details).toHaveJSProperty("open", true);
    await page.mouse.click(700, 400); // over the hero, well outside the panel
    await expect(details).toHaveJSProperty("open", false);
  });

  test("given the 'Sul' region-switcher dropdown open, when clicking outside, then it closes (the original bug)", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/sul", { waitUntil: "domcontentloaded" });
    const trigger = summaryTrigger(page, "Sul");
    await trigger.click();
    const details = page.locator("details:has(summary:text('Sul'))").first();
    await expect(details).toHaveJSProperty("open", true);
    await page.mouse.click(700, 400);
    await expect(details).toHaveJSProperty("open", false);
  });

  test("given the 'Sul' dropdown open, when Escape is pressed, then it closes and focus returns to the trigger", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/sul", { waitUntil: "domcontentloaded" });
    const trigger = summaryTrigger(page, "Sul");
    await trigger.click();
    await page.keyboard.press("Escape");
    const details = page.locator("details:has(summary:text('Sul'))").first();
    await expect(details).toHaveJSProperty("open", false);
    await expect(trigger).toBeFocused();
  });

  test("given the 'Sul' dropdown open, when a region option is selected, then it closes and navigates (never stays open across a route change)", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/sul", { waitUntil: "domcontentloaded" });
    await summaryTrigger(page, "Sul").click();
    const details = page.locator("details:has(summary:text('Sul'))").first();
    await expect(details).toHaveJSProperty("open", true);
    // Clicking the external "Norte" link would navigate off localhost — assert the panel state right up to
    // that real external navigation instead of following it.
    const norteLink = details.getByRole("link", { name: "Norte" });
    await expect(norteLink).toHaveAttribute("href", /usenorte\.com\.br/);
  });

  test("given clicking inside the Regiões panel but not on a link, when it happens, then the dropdown stays open", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/sul", { waitUntil: "domcontentloaded" });
    await summaryTrigger(page, "Regiões").click();
    const details = page.locator("details:has(summary:text('Regiões'))").first();
    const panel = details.locator("ul");
    await panel.click({ position: { x: 5, y: 5 } }); // inside the panel, not on a link
    await expect(details).toHaveJSProperty("open", true);
  });
});

test.describe("State page: 'Destaques' showcase", () => {
  test("given a state page, when loaded, then the showcase shows only real products of that state, before the mesoregion browser", async ({ page }) => {
    await page.goto("/sul/rs", { waitUntil: "domcontentloaded" });
    const heading = page.getByRole("heading", { name: "Destaques de Rio Grande do Sul" });
    await expect(heading).toBeVisible();
    // Never claims a sales ranking without a verified period.
    await expect(page.getByText(/Mais vendidas/i)).toHaveCount(0);
    const showcaseBox = await heading.boundingBox();
    const browserBox = await page.locator("main details").first().boundingBox();
    expect(showcaseBox!.y).toBeLessThan(browserBox!.y);
  });

  test("given the showcase carousel, when a product is read, then it has a real price and a verified usesul.com.br link", async ({ page }) => {
    await page.goto("/sul/sc", { waitUntil: "domcontentloaded" });
    const firstLink = page.locator("section:has(#showcase-title) a.group").first();
    await expect(firstLink).toHaveAttribute("href", /^https:\/\/www\.usesul\.com\.br\//);
  });
});

test.describe("Shared consent (Meta + GA4): vendor-neutral banner, revocation stops both, privacy page is publishable", () => {
  test("given the banner, when it is shown, then the copy is vendor-neutral and both choices are visible and equally sized", async ({ page }) => {
    await page.goto("/sul", { waitUntil: "domcontentloaded" });
    const banner = page.getByRole("region", { name: "Preferências de cookies" });
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("Usamos cookies para melhorar sua experiência e entender como o site é utilizado");
    await expect(banner).not.toContainText(/Meta|Pixel|Google|Analytics/i);
    await expect(banner.getByRole("link", { name: "Política de Privacidade" })).toBeVisible();
    const reject = await banner.getByRole("button", { name: "Rejeitar" }).boundingBox();
    const accept = await banner.getByRole("button", { name: "Aceitar cookies" }).boundingBox();
    expect(reject && accept).toBeTruthy();
    expect(Math.abs(reject!.height - accept!.height)).toBeLessThanOrEqual(1);
  });

  test("given a phone viewport, when the banner is shown, then it stays compact instead of covering the page", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/sul", { waitUntil: "domcontentloaded" });
    const banner = page.getByRole("region", { name: "Preferências de cookies" });
    await expect(banner).toBeVisible();
    const box = await banner.boundingBox();
    expect(box!.height).toBeLessThan(812 * 0.25);
  });

  test("given both providers loaded after Aceitar cookies, when consent is revoked, then neither receives any further event, even from client-side navigation and search", async ({ page }) => {
    await page.route("https://www.googletagmanager.com/**", (route) => route.abort());
    await page.route("https://connect.facebook.net/**", (route) => route.abort());
    const fbq = await withFbqMock(page);
    const gtag = await withGtagMock(page);
    await page.goto("/sul");
    await page.getByRole("region", { name: "Preferências de cookies" }).getByRole("button", { name: "Aceitar cookies" }).click();
    await page.waitForTimeout(300);
    expect(fbqCalls(fbq, "PageView")).toHaveLength(1);
    expect(gaCalls(gtag, "page_view")).toHaveLength(1);

    await page.getByRole("button", { name: "Preferências de privacidade" }).first().click();
    await page.waitForTimeout(200);
    expect(fbqMethodCalls(fbq, "consent").some((c) => c[1] === "revoke")).toBe(true);
    expect(gaMethodCalls(gtag, "consent").some((c) => (c[2] as Record<string, unknown> | undefined)?.analytics_storage === "denied")).toBe(true);
    const fbqAfterRevoke = fbq.length;
    const gtagAfterRevoke = gtag.length;

    // A conclusive search + city selection, the events most likely to slip through if only the loaders were gated.
    const openDialog = async () => {
      await page.getByRole("button", { name: /Busque sua cidade/ }).first().click();
      const dialog = page.getByRole("dialog", { name: "Buscar cidade" });
      await expect(dialog).toBeVisible();
      return dialog;
    };
    await fillAndAwaitSuggestion(page, openDialog, "floripa");
    await page.keyboard.press("Enter");
    await page.waitForURL(/\/sul\/sc\/florianopolis$/);
    await page.getByRole("link", { name: "Política de privacidade" }).first().click();
    await page.waitForURL(/\/sul\/privacidade$/);
    await page.waitForTimeout(300);

    expect(fbq.length).toBe(fbqAfterRevoke);
    expect(gtag.length).toBe(gtagAfterRevoke);
  });

  test("given consent revoked and accepted again in the same session, when accepted, then both are granted again with one fresh page view and no replay", async ({ page }) => {
    await page.route("https://www.googletagmanager.com/**", (route) => route.abort());
    await page.route("https://connect.facebook.net/**", (route) => route.abort());
    const fbq = await withFbqMock(page);
    const gtag = await withGtagMock(page);
    await page.goto("/sul");
    const banner = page.getByRole("region", { name: "Preferências de cookies" });
    await banner.getByRole("button", { name: "Aceitar cookies" }).click();
    await page.waitForTimeout(300);
    await page.getByRole("button", { name: "Preferências de privacidade" }).first().click();
    await expect(banner).toBeVisible();
    await banner.getByRole("button", { name: "Aceitar cookies" }).click();
    await page.waitForTimeout(300);

    expect(fbqMethodCalls(fbq, "consent").map((c) => c[1])).toEqual(["grant", "revoke", "grant"]);
    expect(fbqCalls(fbq, "PageView")).toHaveLength(2); // one per accepted session of the same page, never a replay of older events
    expect(gaMethodCalls(gtag, "consent").map((c) => (c[2] as Record<string, unknown>).analytics_storage)).toEqual(["denied", "granted"]);
    expect(gaCalls(gtag, "page_view")).toHaveLength(2);
  });

  test("given the privacy page, when opened, then it has no draft/placeholder text and names both tools generically-first", async ({ page }) => {
    await page.goto("/sul/privacidade");
    const body = page.locator("main");
    await expect(body.getByRole("heading", { name: "Política de privacidade e cookies" })).toBeVisible();
    await expect(body).not.toContainText(/rascunho|pendente|\[data a definir|\[pendente|revisão jurídica/i);
    await expect(body).toContainText(/ferramentas de análise e marketing/i);
    await expect(body).toContainText("Meta Pixel");
    await expect(body).toContainText("Google Analytics");
    await expect(body.getByRole("button", { name: "Preferências de privacidade" })).toBeVisible();
  });

  test("given a rejected decision, when a real INK link is clicked, then navigation still proceeds and nothing is sent", async ({ page }) => {
    const fbq = await withFbqMock(page);
    const gtag = await withGtagMock(page);
    await blockInkNavigation(page);
    await page.goto("/sul/sc/tijucas");
    await page.getByRole("region", { name: "Preferências de cookies" }).getByRole("button", { name: "Rejeitar" }).click();
    const inkLink = page.locator('a[href^="https://www.usesul.com.br"]').first();
    await expect(inkLink).toBeVisible();
    await inkLink.click(); // blockInkNavigation only stops the real page unload; the click handler still ran
    await page.waitForTimeout(200);
    expect(fbq).toEqual([]);
    expect(gtag).toEqual([]);
  });
});
