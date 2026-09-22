import { expect, test } from "@playwright/test";

test.describe("infra: health, readiness, no external calls", () => {
  test("given GET /api/health, when called, then it answers 200 with no I/O", async ({ page }) => {
    const res = await page.request.get("/api/health");
    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });

  test("given GET /api/ready with a real synced snapshot, when called, then it reports ready with meaningful coverage per region", async ({ page }) => {
    const res = await page.request.get("/api/ready");
    const body = await res.json();
    // This machine's local snapshot is real and synced (see docs/design/sul-integrated-final-review.md), so
    // readiness must be true here; a fresh, never-synced environment would instead see `ready: false`.
    expect(res.status()).toBe(200);
    expect(body.ready).toBe(true);
    expect(body.snapshot.present).toBe(true);
    expect(body.snapshot.totalProducts).toBeGreaterThan(0);
    // Coverage is a ratio (readiness.ts), not a bare ">0" count — real coverage here is 1191/1191 (ADR 0004).
    expect(body.coverageByRegion.sul.coveredCities).toBeGreaterThan(0);
    expect(body.coverageByRegion.sul.ratio).toBeGreaterThanOrEqual(0.5);
  });

  test("given POST /api/admin/catalog-sync with no Authorization header, when called, then it is rejected (401 or 503), never runs a sync", async ({ page }) => {
    const res = await page.request.post("/api/admin/catalog-sync");
    expect([401, 503]).toContain(res.status());
  });

  test("given POST /api/admin/catalog-sync with a wrong token, when called, then it is 401 (or 503 if the route has no token configured at all)", async ({ page }) => {
    const res = await page.request.post("/api/admin/catalog-sync", { headers: { Authorization: "Bearer wrong-token-entirely" } });
    expect([401, 503]).toContain(res.status());
  });

  test("given GET /api/admin/catalog-sync (status check) with no auth, when called, then it is rejected the same way as POST", async ({ page }) => {
    const res = await page.request.get("/api/admin/catalog-sync");
    expect([401, 503]).toContain(res.status());
  });

  test("given a normal page request, when the catalog is already synced, then the readiness gate (proxy.ts) lets it through normally", async ({ page }) => {
    // The dedicated empty-Volume/never-synced scenario (503, maintenance page) is covered end-to-end by
    // `npm run verify:bootstrap` against an isolated snapshot dir — this suite's shared server always points
    // at the real, already-synced dev snapshot, so the meaningful assertion here is the opposite case: a
    // ready instance must never show the maintenance page.
    const res = await page.request.get("/sul/sc/tijucas");
    expect(res.status()).toBe(200);
  });

  test("given a request whose Host is not the canonical production domain, when the catalog is ready, then the page still carries noindex (staging gate §3)", async ({ page }) => {
    // This suite always runs against localhost, which never matches NEXT_PUBLIC_SITE_URL's real host — the
    // exact "temporary Railway URL" case: ready or not, a non-canonical host must never be indexable.
    const res = await page.request.get("/sul/sc/tijucas");
    expect(res.status()).toBe(200);
    expect(res.headers()["x-robots-tag"]).toBe("noindex");
  });

  for (const route of ["/sul", "/sul/sc", "/sul/sc/tijucas", "/sul/pr/pato-branco/ponto-de-origem"]) {
    test(`given ${route}, when the network is observed, then nothing is requested from INK or IBGE domains`, async ({ page }) => {
      const externalCalls: string[] = [];
      page.on("request", (req) => {
        const url = req.url();
        if (url.includes("reserva.ink") || url.includes("servicodados.ibge.gov.br")) externalCalls.push(url);
      });
      // domcontentloaded, not networkidle: only the request log matters here, not full image/byte loading.
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(500);
      expect(externalCalls, JSON.stringify(externalCalls)).toEqual([]);
    });
  }

  test("given the search dialog, when a query is typed, then nothing is requested from INK or IBGE domains", async ({ page }) => {
    const externalCalls: string[] = [];
    page.on("request", (req) => {
      const url = req.url();
      if (url.includes("reserva.ink") || url.includes("servicodados.ibge.gov.br")) externalCalls.push(url);
    });
    await page.goto("/sul", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: /Busque sua cidade/ }).first().click();
    await page.getByRole("combobox").fill("floripa");
    await page.waitForTimeout(300);
    expect(externalCalls, JSON.stringify(externalCalls)).toEqual([]);
  });

  test("given the same page loaded twice (cold then warm cache), when the network is observed both times, then still zero external calls either time", async ({ page }) => {
    const externalCalls: string[] = [];
    page.on("request", (req) => {
      const url = req.url();
      if (url.includes("reserva.ink") || url.includes("servicodados.ibge.gov.br")) externalCalls.push(url);
    });
    await page.goto("/sul/sc/tijucas", { waitUntil: "domcontentloaded" });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(500);
    expect(externalCalls, JSON.stringify(externalCalls)).toEqual([]);
  });
});
