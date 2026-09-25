import { expect, test as base, type Page } from "@playwright/test";

/**
 * Every navigation waits until the page is INTERACTIVE, not merely loaded: `<HydrationSignal />` (src/components/layout) sets
 * `data-hydrated="true"` on <html> after React has hydrated and installed its handlers. Without it, a test that clicks right after
 * `goto` can hit a control that is already visible in the server HTML but has no handler yet — the click is lost and the test
 * fails (or, worse, passes for the wrong reason). This replaces sleeps and click retries: it waits for a concrete state.
 *
 * Only HTML documents from the app are awaited; API responses, redirects to other origins and downloads are returned as they are.
 */
async function settle(page: Page, response: Awaited<ReturnType<Page["goto"]>>) {
  const type = response?.headers()["content-type"] ?? "";
  if (response && type.includes("text/html") && new URL(response.url()).origin === new URL(page.url() || response.url()).origin) {
    await page.waitForFunction(() => document.documentElement.dataset.hydrated === "true", undefined, { timeout: 20_000 });
  }
  return response;
}

export const test = base.extend({
  page: async ({ page }, provide) => {
    const goto = page.goto.bind(page);
    const reload = page.reload.bind(page);
    page.goto = async (url, options) => settle(page, await goto(url, options));
    page.reload = async (options) => settle(page, await reload(options));
    await provide(page);
  },
});

export { expect };

/**
 * Events are ADDRESSED to the visited region's ID (Meta `trackSingle`/`trackSingleCustom`, GA4 `send_to`; src/lib/analytics/track.ts). These tests are
 * about WHAT an event carries, not where it goes (that is covered by unit tests and the per-region tracking E2E), so mocks record the classic shape.
 */
export const normalizeFbq = (a: unknown[]): unknown[] => (a[0] === "trackSingle" ? ["track", ...a.slice(2)] : a[0] === "trackSingleCustom" ? ["trackCustom", ...a.slice(2)] : a);
export const normalizeGtag = (a: unknown[]): unknown[] => {
  if (a[0] !== "event" || typeof a[2] !== "object" || a[2] === null) return a;
  const { send_to: _to, ...rest } = a[2] as Record<string, unknown>;
  void _to;
  return [a[0], a[1], rest];
};
