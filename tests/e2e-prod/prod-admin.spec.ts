import { expect, test, type Browser, type Page } from "@playwright/test";
import sharp from "sharp";

/**
 * The production-mode admin against a real `next start` build (see playwright.prod.config.ts): host separation, anonymous access,
 * Login with Railway (fake provider), allowlist, per-region permissions, and the whole editorial flow on Postgres + a private bucket + the Volume.
 */
const ADMIN = "http://127.0.0.1:3400";
const STORE = "http://localhost:3400"; // same server, a host that is NOT the admin host (like Railway's temporary address)
const SITE = ADMIN; // the admin lives at /admin on the storefront's own host: the public site is served there too
const IDP = "http://127.0.0.1:4555";
const S3 = "http://127.0.0.1:4600";

const hydrated = (page: Page) => page.waitForFunction(() => document.documentElement.dataset.hydrated === "true", undefined, { timeout: 60_000 });
async function open(page: Page, path: string) {
  await page.goto(`${ADMIN}${path}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await hydrated(page).catch(() => undefined); // the login page has no hydration marker
}
const identity = (email: string, opts: { verified?: boolean; inToken?: boolean; sub?: string } = {}) =>
  fetch(`${IDP}/__identity`, { method: "POST", body: JSON.stringify({ email, sub: opts.sub ?? `sub-${email}`, verified: opts.verified ?? true, inToken: opts.inToken ?? true }) });

async function signIn(page: Page, email: string, opts: { verified?: boolean; inToken?: boolean; sub?: string } = {}) {
  await identity(email, opts);
  await page.goto(`${ADMIN}/admin/login`);
  await page.getByRole("link", { name: "Entrar com Railway" }).click();
  await page.waitForURL(/\/admin(\/login\?erro=\w+(&ref=[^&]*)?)?$/);
}
async function newSession(browser: Browser, email: string, opts: { verified?: boolean; inToken?: boolean } = {}) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(page, email, opts);
  return { context, page };
}
const rows = (page: Page) => page.locator("table.a-table tbody tr");
const titles = async (page: Page) => (await rows(page).locator("td:nth-child(2) p.font-bold").allInnerTexts()).map((t) => t.trim());

test.describe.configure({ mode: "serial" });

test("given no session, when the admin host is visited, then only the login page is reachable and every other admin path sends the visitor there", async ({ request }) => {
  const headersOk = (h: Record<string, string>) => {
    expect(h["x-robots-tag"]).toContain("noindex");
    expect(h["cache-control"]).toContain("no-store");
  };
  for (const p of ["/admin", "/admin/home", "/admin/home/seed-hero", "/admin/colecoes", "/admin/publicar", "/admin/midia", "/admin/usuarios", "/admin/preview"]) {
    const r = await request.get(`${ADMIN}${p}`, { maxRedirects: 0 });
    expect([302, 303, 307, 308], p).toContain(r.status());
    expect(r.headers().location, p).toContain("/admin/login");
    headersOk(r.headers());
  }
  const login = await request.get(`${ADMIN}/admin/login`);
  expect(login.status()).toBe(200);
  headersOk(login.headers());
  expect(await login.text()).toContain("Entrar com Railway");
  expect((await request.get(`${ADMIN}/`, { maxRedirects: 0 })).status()).not.toBe(404); // the storefront root is unchanged
  const cb = await request.get(`${ADMIN}/admin/auth/callback?code=x&state=y`, { maxRedirects: 0 });
  expect(cb.headers().location).toContain("erro=sessao"); // no login cookie: never reaches the provider
});

test("given another host, /admin does not exist; and on the admin host the storefront is served exactly as before", async ({ request }) => {
  for (const p of ["/admin", "/admin/login", "/admin/auth/start", "/admin/auth/callback?code=x&state=y", "/admin/home", "/admin/media/aaaaaaaaaaaaaaaaaaaaaaaa.webp", "/admin/preview"]) {
    expect((await request.get(`${STORE}${p}`, { maxRedirects: 0 })).status(), p).toBe(404);
  }
  // Public navigation on the admin host is untouched: same pages, same status, no admin headers.
  for (const p of ["/sul", "/sul/privacidade", "/sul/sc", "/api/health", "/api/ready"]) {
    const [onAdminHost, elsewhere] = await Promise.all([request.get(`${SITE}${p}`, { maxRedirects: 0 }), request.get(`${STORE}${p}`, { maxRedirects: 0 })]);
    expect(onAdminHost.status(), p).toBe(elsewhere.status());
    expect(onAdminHost.status(), p).toBe(200);
    expect(onAdminHost.headers()["cache-control"] ?? "", p).not.toContain("no-store");
  }
  expect((await request.get(`${SITE}/anything`, { maxRedirects: 0 })).status()).toBe(404);
  expect((await request.get(`${SITE}/media/${"a".repeat(64)}/640.webp`)).status()).toBe(404); // nothing published
  // A look-alike Host header on the admin address is not the admin host.
  expect((await request.get(`${ADMIN}/admin/login`, { headers: { Host: "127.0.0.1:3401" } })).status()).toBe(404);
  // X-Forwarded-Host is not identity: it neither opens the admin on another host nor changes anything on the admin host.
  expect((await request.get(`${STORE}/admin/login`, { headers: { "X-Forwarded-Host": "127.0.0.1:3400" } })).status()).toBe(404);
});

test("given Railway answers with an e-mail that is not on the allowlist (or is unverified), when signing in, then access is refused and no session is created", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(page, "stranger@e2e.test");
  await expect(page).toHaveURL(/\/admin\/login\?erro=acesso/);
  await expect(page.getByText("Este e-mail não tem acesso ao painel")).toBeVisible();
  await expect(page.getByText(/Identificador da sua conta Railway/)).toBeVisible(); // the account id, so the owner can bind it if needed
  expect((await context.cookies()).some((c) => c.name === "__Secure-uo_admin")).toBe(false);
  await page.goto(`${ADMIN}/admin`);
  await expect(page).toHaveURL(/\/admin\/login/);

  await signIn(page, "owner@e2e.test", { verified: false }); // the owner's address, but Railway does not vouch for it
  await expect(page).toHaveURL(/erro=acesso/);
  expect((await context.cookies()).some((c) => c.name === "__Secure-uo_admin")).toBe(false);
  await context.close();
});

test("given the configured owner, when signing in, then the session cookie is hardened, the panel opens, and editors can be registered per region", async ({ browser }) => {
  const { context, page } = await newSession(browser, "owner@e2e.test");
  await expect(page).toHaveURL(`${ADMIN}/admin`);
  await expect(page.getByRole("heading", { name: "Visão geral" })).toBeVisible();
  const cookie = (await context.cookies()).find((c) => c.name === "__Secure-uo_admin");
  expect(cookie).toMatchObject({ httpOnly: true, secure: true, sameSite: "Lax", path: "/admin" }); // scoped to the admin paths only
  // The public site on the SAME host never receives the session cookie.
  const publicRequest = page.waitForRequest((r) => new URL(r.url()).pathname === "/sul");
  await page.goto(`${ADMIN}/sul`, { waitUntil: "load" });
  expect((await (await publicRequest).allHeaders()).cookie ?? "").not.toContain("uo_admin");
  await page.goto(`${ADMIN}/admin`);
  expect(await page.evaluate(() => document.cookie)).not.toContain("uo_admin"); // not readable by scripts
  expect(cookie!.value).not.toMatch(/owner|@/);

  await open(page, "/admin/usuarios");
  await page.getByLabel("E-mail do editor").fill("editor-norte@e2e.test");
  await page.getByLabel("Sul").uncheck();
  await page.getByLabel("Norte", { exact: true }).check();
  await page.getByRole("button", { name: "Cadastrar ou atualizar" }).click();
  await expect(page.getByText("Editor cadastrado.")).toBeVisible();
  await page.getByLabel("E-mail do editor").fill("editor-sul@e2e.test");
  await page.getByLabel("Sul").check();
  await page.getByRole("button", { name: "Cadastrar ou atualizar" }).click();
  await expect(page.getByText("Editor cadastrado.")).toBeVisible();
  await expect(page.getByRole("cell", { name: "editor-norte@e2e.test" })).toBeVisible();

  // Sign out invalidates the server-side session: the old cookie no longer opens anything.
  const token = cookie!.value;
  await page.getByRole("button", { name: "Sair" }).first().click();
  await expect(page).toHaveURL(/\/admin\/login/);
  await context.addCookies([{ ...cookie!, value: token }]);
  await page.goto(`${ADMIN}/admin`);
  await expect(page).toHaveURL(/\/admin\/login/);
  await context.close();
});

test("given a provider whose ID token carries no e-mail, when the userinfo endpoint vouches for it, then the allowlisted editor still gets in (same account only)", async ({ browser }) => {
  const { context, page } = await newSession(browser, "editor-sul@e2e.test", { inToken: false });
  await expect(page).toHaveURL(`${ADMIN}/admin`);
  await expect(page.getByRole("heading", { name: "Visão geral" })).toBeVisible();
  await context.close();
});

test("given an editor of another region, when editing the Sul home or managing people, then the server refuses; an editor of Sul may edit but not manage people or sync", async ({ browser }) => {
  const norte = await newSession(browser, "editor-norte@e2e.test");
  await expect(norte.page).toHaveURL(`${ADMIN}/admin`);
  await open(norte.page, "/admin/usuarios");
  await expect(norte.page).toHaveURL(/\/admin\?err=/);
  await expect(norte.page.getByText("Você não tem permissão para isso.")).toBeVisible();
  await open(norte.page, "/admin/home");
  const combo = norte.page.getByRole("combobox", { name: /Coleção \(busque pelo nome\)/ });
  await combo.fill("da nossa terra");
  await norte.page.getByRole("option", { name: /Da Nossa Terra/ }).click();
  await norte.page.getByRole("button", { name: "Criar seção" }).click();
  await expect(norte.page).toHaveURL(/\/admin\?err=/); // refused before anything was written
  await open(norte.page, "/admin/home");
  expect((await titles(norte.page)).length).toBe(10); // the seed home: nothing was created
  await open(norte.page, "/admin/colecoes");
  await expect(norte.page.getByRole("button", { name: "Sincronizar coleções agora" })).toHaveCount(0);
  await norte.context.close();

  const sul = await newSession(browser, "editor-sul@e2e.test", { inToken: false });
  await open(sul.page, "/admin/usuarios");
  await expect(sul.page.getByText("Você não tem permissão para isso.")).toBeVisible();
  await open(sul.page, "/admin/colecoes");
  await expect(sul.page.getByRole("button", { name: "Sincronizar coleções agora" })).toHaveCount(0);
  await open(sul.page, "/admin/home");
  await expect(sul.page.getByRole("heading", { name: /Nova seção/ })).toBeVisible();
  await sul.context.close();
});

test("given the owner, when a collection section is created from an enabled internal collection with an uploaded image and published, then Postgres, the private bucket, the Volume and the storefront all agree; rollback restores the previous version", async ({ browser }) => {
  const trackers: string[] = [];
  const context = await browser.newContext();
  await context.route(/connect\.facebook\.net|facebook\.com\/tr|googletagmanager\.com|google-analytics\.com/, (route) => {
    trackers.push(route.request().url());
    return route.abort();
  });
  await context.route("**/_next/image**", (route) => route.abort());
  const page = await context.newPage();
  await signIn(page, "owner@e2e.test");

  // 1. Library → internal collection → enable.
  await open(page, "/admin/colecoes?q=fe+de+origem");
  const row = page.locator("table.a-table tbody tr", { hasText: "Fé de Origem" });
  await expect(row).toContainText("Interna (oculta na INK)");
  await row.getByRole("button", { name: "Habilitar" }).click();
  await expect(page.getByText(/“Fé de Origem” habilitada/)).toBeVisible();

  // 2. Upload an image: only processed WebP variants reach the bucket, under the content hash.
  await open(page, "/admin/midia");
  // Noise does not compress: the file is several MB, well past the 1 MB default limit of Server Actions (a real upload failed with it in production).
  const png = await sharp({ create: { width: 1800, height: 700, channels: 3, background: { r: 30, g: 90, b: 60 }, noise: { type: "gaussian", mean: 128, sigma: 60 } } }).png().toBuffer();
  expect(png.length).toBeGreaterThan(2 * 1024 * 1024);
  await page.locator('input[type="file"]').setInputFiles({ name: "banner e2e.png", mimeType: "image/png", buffer: png });
  await page.getByRole("button", { name: "Enviar", exact: true }).click();
  await expect(page.getByText(/Imagem "banner e2e" enviada/)).toBeVisible();
  const stats = (await (await fetch(`${S3}/__stats`)).json()) as { objects: number; keys: string[] };
  expect(stats.objects).toBe(4); // 640, 1080, 1600 and the 1800 master
  expect(stats.keys.every((k) => /^media\/[0-9a-f]{64}\/\d+\.webp$/.test(k))).toBe(true);
  await page.locator('input[type="file"]').setInputFiles({ name: "evil.svg", mimeType: "image/svg+xml", buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>') });
  await page.getByRole("button", { name: "Enviar", exact: true }).click();
  await expect(page.getByText(/formato não permitido|não foi possível ler a imagem/)).toBeVisible();
  expect(((await (await fetch(`${S3}/__stats`)).json()) as { objects: number }).objects).toBe(4);
  // The bucket is private: nothing is readable anonymously, neither publicly (not published yet) nor through the admin route.
  const sha = stats.keys[0].split("/")[1];
  expect((await context.request.get(`${SITE}/media/${sha}/640.webp`)).status()).toBe(404); // uploaded, but not published
  expect((await fetch(`${ADMIN}/admin/media/${sha}/640.webp`)).status).toBe(404); // no session
  // Signed-in reads go through the browser itself (it holds the `__Secure-` cookie; a bare request context does not send it over http).
  const inBrowser = (path: string) => page.evaluate(async (u) => { const r = await fetch(u); return { status: r.status, type: r.headers.get("content-type"), cache: r.headers.get("cache-control") }; }, path);
  const own = await inBrowser(`/admin/media/${sha}/640.webp`);
  expect(own).toMatchObject({ status: 200, type: "image/webp" });
  expect(own.cache).toContain("no-store");
  expect((await inBrowser(`/admin/media/${"e".repeat(64)}/640.webp`)).status).toBe(404); // not a known upload
  expect((await inBrowser(`/admin/media/${sha}/../640.webp`)).status).toBe(404);

  // 3. Create the section, style it with the upload, save.
  await open(page, "/admin/home");
  const combo = page.getByRole("combobox", { name: /Coleção \(busque pelo nome\)/ });
  await combo.fill("fe de");
  await page.getByRole("option", { name: /Fé de Origem/ }).click();
  await page.getByLabel("Título (opcional)").fill("Terra em foco");
  await page.getByRole("button", { name: "Criar seção" }).click();
  await expect(page).toHaveURL(/\/admin\/home\/custom-[0-9a-f]+/);
  const uploadValue = (await page.getByLabel("Imagem mobile (opcional)").locator('option[value^="upload:"]').first().getAttribute("value"))!;
  await page.getByLabel("Imagem mobile (opcional)").selectOption(uploadValue);
  await page.getByLabel("Imagem desktop (opcional)").selectOption(uploadValue);
  await page.getByLabel("Véu", { exact: true }).selectOption("regional-wash-dark");
  await page.getByRole("button", { name: "Salvar rascunho" }).click();
  await expect(page.getByText("Rascunho salvo.")).toBeVisible();

  // 4. A second tab on a stale revision cannot overwrite the draft.
  const stale = await context.newPage();
  await open(stale, "/admin/home");
  await open(page, "/admin/home");
  await page.getByRole("button", { name: "Mover “Terra em foco” para cima" }).click();
  await expect(page.getByText("Ordem alterada.")).toBeVisible();
  await stale.getByRole("button", { name: "Mover “Terra em foco” para cima" }).click();
  await expect(stale.getByText(/O rascunho mudou em outra aba/)).toBeVisible();
  await stale.close();

  // 5. Preview (375 and desktop) uses the same renderer and the bucket variants, and sends nothing to a tracker.
  await open(page, "/admin/home");
  for (const kind of ["mobile", "desktop"] as const) {
    const frame = page.frameLocator(`iframe[data-preview="${kind}"]`);
    const section = frame.locator("section#colecao-terra-em-foco");
    await expect(section, `${kind} preview`).toBeVisible({ timeout: 120_000 });
    await expect(section.locator("picture source").first()).toHaveAttribute("srcset", /\/admin\/media\/[0-9a-f]{64}\/640\.webp 640w/); // drafts: the authenticated route
  }
  expect(trackers).toEqual([]);

  // 6. Publish: Postgres release, published.json on the Volume, storefront.
  await open(page, "/admin/publicar");
  await page.getByLabel(/Nota da publicação/).fill("primeira versão");
  await page.getByRole("button", { name: "Publicar", exact: true }).click();
  await expect(page.getByText(/Publicado \(release \d+\)/)).toBeVisible({ timeout: 120_000 });
  await expect(page.getByText("Coerente").first()).toBeVisible();
  const storePage = await context.newPage();
  await storePage.goto(`${SITE}/sul`, { waitUntil: "domcontentloaded" });
  const storeSection = storePage.locator("section#colecao-terra-em-foco");
  await expect(storeSection.locator("h2")).toHaveText("Terra em foco");
  const srcset = await storeSection.locator("picture source").first().getAttribute("srcset");
  expect(srcset).toMatch(/^\/media\/[0-9a-f]{64}\/640\.webp 640w/); // published: the storefront's OWN route, no foreign host
  expect(srcset).not.toContain("http");
  const firstUrl = srcset!.split(",")[0].trim().split(" ")[0];
  const served = await context.request.get(`${SITE}${firstUrl}`);
  expect(served.status()).toBe(200); // served from the private bucket through the storefront
  expect(served.headers()["cache-control"]).toContain("immutable");
  expect(served.headers()["content-type"]).toBe("image/webp");
  expect(served.headers()["x-content-type-options"]).toBe("nosniff");
  expect((await served.body()).subarray(0, 4).toString()).toBe("RIFF"); // real WebP bytes
  // Only the published manifest is readable; nothing else of the bucket, and no traversal.
  for (const bad of [`/media/${"e".repeat(64)}/640.webp`, `/media/${sha}/640.svg`, `/media/${sha}/../640.webp`, `/media/${sha}/640.webp/extra`, "/media/..%2f..%2fetc%2fpasswd", "/media/"]) {
    expect((await context.request.get(`${SITE}${bad}`)).status(), bad).toBe(404);
  }
  expect(await storeSection.locator("a[href*='/collections/']").count()).toBe(0); // internal collection: no "Ver todos"
  expect(await storeSection.locator("a[href^='https://www.usesul.com.br/']").count()).toBeGreaterThanOrEqual(3);

  // Published tracking = today's env fallback: nothing before consent; after consent, Meta and GA are requested exactly as before.
  await storePage.getByRole("region", { name: "Preferências de cookies" }).waitFor();
  await storePage.waitForTimeout(800);
  expect(trackers).toEqual([]);
  await storePage.getByRole("button", { name: /Aceitar/ }).click();
  await expect.poll(() => trackers.some((u) => u.includes("connect.facebook.net")) && trackers.some((u) => u.includes("googletagmanager.com"))).toBe(true);
  expect(trackers.some((u) => u.includes("1558923262073052") || u.includes("G-8GYTEJ1F77"))).toBe(true);
  await storePage.close();

  // 7. Second version, then restore the first: the storefront follows; history keeps everything.
  await open(page, "/admin/home");
  await page.getByRole("link", { name: "Editar" }).nth((await titles(page)).indexOf("Terra em foco")).click();
  await hydrated(page);
  await page.getByLabel("Título", { exact: true }).fill("Terra em foco 2");
  await page.getByRole("button", { name: "Salvar rascunho" }).click();
  await expect(page.getByText("Rascunho salvo.")).toBeVisible();
  await open(page, "/admin/publicar");
  await page.getByRole("button", { name: "Publicar", exact: true }).click();
  await expect(page.getByText(/release \d+/).first()).toBeVisible({ timeout: 120_000 });
  const live2 = await context.newPage();
  // ISR: the first request after an invalidation may be answered from the stale copy while the page regenerates; the next one is fresh.
  const freshTitle = async (text: string) => {
    let attempts = 0;
    await expect(async () => {
      attempts++;
      await live2.goto(`${SITE}/sul`, { waitUntil: "domcontentloaded" });
      await expect(live2.locator("section#colecao-terra-em-foco h2")).toHaveText(text, { timeout: 2_000 });
    }).toPass({ timeout: 30_000 });
    return attempts;
  };
  expect(await freshTitle("Terra em foco 2")).toBeLessThanOrEqual(3);
  await open(page, "/admin/publicar");
  const first = page.locator("tbody tr", { hasText: "primeira versão" });
  await first.getByRole("button", { name: "Restaurar esta versão" }).click();
  await expect(page.getByText(/Versão \d+ restaurada/)).toBeVisible({ timeout: 120_000 });
  expect(await freshTitle("Terra em foco")).toBeLessThanOrEqual(3);
  await open(page, "/admin/publicar");
  await expect(page.locator("tbody tr").first()).toContainText("Restauração");
  await expect(page.locator("tbody tr")).toHaveCount(3);

  // 8. The audit trail names what happened (owner-only page).
  await open(page, "/admin/usuarios");
  const activity = page.getByRole("region", { name: "Atividade recente" });
  for (const action of ["login", "rollback", "publish", "media.upload", "draft.save"]) await expect(activity).toContainText(action);
  await context.close();
});

test("given an uploaded image still referenced by the published version, when the library is opened, then it cannot be removed, and objects are never deleted from storage", async ({ browser }) => {
  const { context, page } = await newSession(browser, "owner@e2e.test");
  await open(page, "/admin/midia");
  await expect(page.getByText("Em uso no rascunho").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Excluir" }).first()).toBeDisabled();
  expect(((await (await fetch(`${S3}/__stats`)).json()) as { objects: number }).objects).toBe(4);
  await context.close();
});
