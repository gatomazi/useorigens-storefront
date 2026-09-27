import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test, type Browser, type Page, type Request } from "@playwright/test";
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

// Set once, right after the manual-contact test uploads its own mockup: the storage-immutability test at the end of the file checks against
// THIS count, not a literal, since it runs after whichever tests uploaded something.
let s3ObjectsAfterAllUploads = 4;

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
  // The Norte editor only works on Norte: the switcher offers nothing else, the page is Norte's, and a form forged to another region is refused by the server.
  await open(norte.page, "/admin/home");
  await expect(norte.page.getByRole("form", { name: "Região em edição" }).getByRole("button")).toHaveCount(1);
  await expect(norte.page.getByRole("heading", { name: /Home · Seções/ })).toContainText("Norte");
  await norte.page.evaluate(() => {
    const form = document.querySelector('form input[name="scope"]')?.closest("form") as HTMLFormElement;
    (form.querySelector('input[name="scope"]') as HTMLInputElement).value = "sul";
    form.requestSubmit();
  });
  await expect(norte.page).toHaveURL(/\/admin\?err=/); // refused before anything was written
  await expect(norte.page.getByText("Você não tem permissão para editar essa região.")).toBeVisible();
  // The same holds for pages and personalization models: forged to Sul, the server writes nothing.
  for (const [path, fields] of [["/admin/paginas", { title: "Forjada" }], ["/admin/personalizacao", { name: "Forjado" }]] as const) {
    await open(norte.page, path);
    await norte.page.evaluate((values) => {
      const form = document.querySelector('form input[name="scope"]')?.closest("form") as HTMLFormElement;
      (form.querySelector('input[name="scope"]') as HTMLInputElement).value = "sul";
      for (const [name, value] of Object.entries(values)) (form.querySelector(`[name="${name}"]`) as HTMLInputElement).value = value;
      form.requestSubmit();
    }, fields as Record<string, string>);
    await expect(norte.page).toHaveURL(/\/admin\?err=/);
    await expect(norte.page.getByText("Você não tem permissão para editar essa região.")).toBeVisible();
  }
  await open(norte.page, "/admin/colecoes");
  await expect(norte.page.getByRole("button", { name: "Sincronizar coleções agora" })).toHaveCount(0);
  await norte.context.close();

  const sul = await newSession(browser, "editor-sul@e2e.test", { inToken: false });
  await open(sul.page, "/admin/usuarios");
  await expect(sul.page.getByText("Você não tem permissão para isso.")).toBeVisible();
  await open(sul.page, "/admin/colecoes");
  await expect(sul.page.getByRole("button", { name: "Sincronizar coleções agora" })).toHaveCount(0);
  await open(sul.page, "/admin/home");
  await expect(sul.page.getByRole("heading", { name: /Adicionar seção/ })).toBeVisible();
  await sul.context.close();
});

test("given the owner, when a collection section is created from an enabled internal collection with an uploaded image and published, then Postgres, the private bucket, the Volume and the storefront all agree; rollback restores the previous version", async ({ browser }) => {
  const trackers: string[] = [];
  const context = await browser.newContext();
  // Third-party measurement is replaced by local stubs: nothing leaves this machine, and every request the page makes to a tracker is recorded so the test
  // can tell "requested" from "not requested" deterministically (no waiting on an external network). The IDs come from the BUILD under test (see the config).
  await context.route(/connect\.facebook\.net|facebook\.com\/tr|googletagmanager\.com|google-analytics\.com/, (route) => {
    trackers.push(route.request().url());
    return route.fulfill({ status: 200, contentType: "application/javascript", body: "/* stub */" });
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
  expect(((await (await fetch(`${S3}/__stats`)).json()) as { objects: number }).objects).toBe(4); // rejected: the count from the one accepted upload above is unchanged
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
  await expect.poll(() => trackers.some((u) => u.includes("connect.facebook.net")) && trackers.some((u) => u.includes("googletagmanager.com/gtag/js"))).toBe(true);
  // The IDs are the build's own (NEXT_PUBLIC_*): a build without them would request no tracker at all, which is what the poll above reports.
  expect(trackers.find((u) => u.includes("googletagmanager.com/gtag/js"))).toMatch(/[?&]id=G-[A-Z0-9]{6,}/);
  expect(await storePage.evaluate(() => Array.from(((window as unknown as { fbq?: { queue?: ArrayLike<unknown>[] } }).fbq?.queue) ?? []).some((call) => call[0] === "init" && /^\d{10,20}$/.test(String(call[1]))))).toBe(true);
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
  await first.getByRole("button", { name: "Restaurar Sul" }).click();
  await expect(page.getByText(/Sul: versão \d+ restaurada/)).toBeVisible({ timeout: 120_000 });
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

test("given the manual-contact personalization flow, when a request is sent, worked and read, then Postgres, contacts, permissions and states all agree", async ({ browser }) => {
  const { context, page } = await newSession(browser, "owner@e2e.test");

  // 1. Enable the internal collection the model uses (idempotent: an earlier test in this same shared server may already have enabled it), upload
  //    the REAL reference mockup and publish an active model.
  await open(page, "/admin/colecoes?q=fe+de+origem");
  const feRow = page.locator("table.a-table tbody tr", { hasText: "Fé de Origem" });
  const enableFe = feRow.getByRole("button", { name: "Habilitar" });
  if (await enableFe.count() > 0) {
    await enableFe.click();
    await expect(page.getByText(/habilitada/)).toBeVisible();
  } else {
    await expect(feRow).toContainText("Habilitada no CMS");
  }

  const mockup = await readFile(path.join(process.cwd(), "referencias", "pai-paranaense-churrasqueiro-lenda.png"));
  await open(page, "/admin/midia");
  await page.locator('input[type="file"]').setInputFiles({ name: "pai-paranaense-churrasqueiro-lenda.png", mimeType: "image/png", buffer: mockup });
  await page.getByRole("button", { name: "Enviar", exact: true }).click();
  await expect(page.getByText(/Imagem "pai-paranaense-churrasqueiro-lenda" enviada/)).toBeVisible();
  s3ObjectsAfterAllUploads = ((await (await fetch(`${S3}/__stats`)).json()) as { objects: number }).objects;

  await open(page, "/admin/personalizacao");
  await page.locator("section[aria-labelledby=novo] input#name").fill("Pai Paranaense");
  const combo = page.getByRole("combobox", { name: /Coleção da INK/ });
  await combo.fill("fe de");
  await page.getByRole("option", { name: /Fé de Origem/ }).click();
  await page.getByRole("button", { name: "Criar rascunho" }).click();
  await expect(page).toHaveURL(/\/admin\/personalizacao\/cz-/);
  await hydrated(page);
  const mockupSelect = page.getByLabel("Mockup da página (obrigatório para ativar)");
  const mockupLabel = (await mockupSelect.locator("option").allTextContents()).find((t) => t.includes("pai-paranaense-churrasqueiro-lenda"));
  expect(mockupLabel, "uploaded mockup option").toBeTruthy();
  await mockupSelect.selectOption({ label: mockupLabel! });
  await page.getByLabel("Descrição do mockup (acessibilidade)").fill("Camiseta Pai Paranaense");
  await page.getByLabel(/O cliente escreve várias linhas/).check();
  await page.locator("#lg_min").fill("1");
  await page.locator("#lg_initial").fill("4");
  await page.locator("#lg_max").fill("6");
  await page.locator("#lg_maxlength").fill("16");
  await page.locator("#lg_defaults").fill("PAI\nPARANAENSE\nCHURRASQUEIRO\nLENDA");
  await page.getByLabel(/Modelo ativo/).check();
  await page.getByRole("button", { name: "Salvar rascunho" }).click();
  await expect(page.getByText("Modelo salvo no rascunho.")).toBeVisible();
  await page.getByRole("button", { name: "Publicar página de personalização" }).click();
  await expect(page.getByText(/Modelo publicado \(release \d+\)/)).toBeVisible({ timeout: 120_000 });

  // 2. The mockup renders for real on the public page: decoded, proportional, never distorted.
  await page.goto(`${SITE}/sul/personalizar/pai-paranaense`, { waitUntil: "domcontentloaded" });
  const img = page.getByAltText("Camiseta Pai Paranaense");
  await expect.poll(() => img.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true);
  const meta = await sharp(mockup).metadata();
  const seen = await img.evaluate((i: HTMLImageElement) => ({ w: i.naturalWidth, h: i.naturalHeight }));
  expect(Math.abs(seen.w / seen.h - (meta.width! / meta.height!)) / (meta.width! / meta.height!)).toBeLessThan(0.02);
  expect(await img.evaluate((i) => getComputedStyle(i).objectFit)).toBe("contain");
  await expect(page.getByText("Imagem ilustrativa", { exact: false })).toBeVisible();

  // 3. An anonymous customer submits, over Postgres, with a name and both channels; nothing about them leaks into the URL, the page's own
  //    network requests or the reference the browser is given.
  // Only GET navigations can carry data in the URL at all (a Server Action POST body is never part of `request.url()`); a broad
  // case-insensitive match on short fragments like "Ana" would false-positive on webpack chunk hashes, so this checks the exact encoded forms.
  const gets: string[] = [];
  page.on("request", (r) => { if (r.method() === "GET") gets.push(r.url()); });
  await page.getByLabel("Linha 1", { exact: true }).fill("PAI");
  await page.getByLabel("Linha 2", { exact: true }).fill("PARANAENSE");
  await page.getByLabel("Linha 3", { exact: true }).fill("CHURRASQUEIRO");
  await page.getByLabel("Linha 4", { exact: true }).fill("LENDA");
  await page.getByLabel(/^Nome/).fill("Ana Souza");
  await page.getByLabel(/^WhatsApp/).fill("(51) 99999-8888");
  await page.getByLabel(/^E-mail/).fill("ana.souza@exemplo.com");
  await page.getByLabel(/Autorizo a equipe/).check();
  await page.getByRole("button", { name: "Enviar solicitação", exact: true }).click();
  await expect(page.getByTestId("customization-done")).toBeVisible({ timeout: 60_000 });
  const reference = (await page.getByTestId("customization-reference").innerText()).trim(); // the SHORT reference (also what the queue and the mailto subject use)
  const privateHref = await page.getByTestId("customization-private-link").getAttribute("href");
  const fullToken = privateHref!.split("/").pop()!; // the long, unguessable token: only this one opens the private reference page
  await expect(page.getByTestId("customization-channels")).toHaveText("Contato informado: WhatsApp final 8888 · a***@exemplo.com");
  expect(page.url()).not.toMatch(/Ana|Souza|99999|exemplo/);
  const leaked = ["Ana+Souza", "Ana%20Souza", "ana.souza%40exemplo.com", "ana.souza@exemplo.com", "5551999998888", "99999998888", "9999998888"];
  for (const needle of leaked) expect(gets.some((u) => u.includes(needle)), `no GET carried "${needle}"`).toBe(false);
  page.removeAllListeners("request");
  await context.close();

  // 4. The Sul editor finds it in the fila, with the full contact; the Norte editor's forged access is refused server-side.
  const sul = await newSession(browser, "editor-sul@e2e.test");
  await open(sul.page, "/admin/personalizacao/solicitacoes");
  await expect(sul.page.getByTestId("queue-open-count")).toContainText("1 pendente");
  const row = sul.page.locator("table.a-table tbody tr", { hasText: "Ana Souza" });
  await expect(row.getByTestId("has-whatsapp")).toBeVisible();
  await expect(row.getByTestId("has-email")).toBeVisible();
  await row.getByRole("link", { name: "Abrir" }).click();
  await hydrated(sul.page);
  await expect(sul.page).toHaveURL(/\/solicitacoes\/[0-9A-Z]{26}/);
  const requestUrl = sul.page.url();
  await expect(sul.page.getByTestId("request-ref")).toHaveText(reference);
  await expect(sul.page.getByTestId("contact-name")).toHaveText("Ana Souza");
  await expect(sul.page.getByTestId("contact-whatsapp")).toHaveText("+5551999998888");
  await expect(sul.page.getByTestId("contact-email")).toHaveText("ana.souza@exemplo.com");
  await expect(sul.page.getByTestId("request-mockup")).toBeVisible();

  const norte = await newSession(browser, "editor-norte@e2e.test");
  await open(norte.page, requestUrl.replace(ADMIN, ""));
  await expect(norte.page.getByRole("heading", { name: "Página não encontrada." })).toBeVisible(); // requireAdmin() lets Norte in; canEdit(actor, record.region) then 404s it — no redirect, no form ever renders
  expect(norte.page.url()).toBe(requestUrl); // the same URL: this is a 404 response, not a redirect the client could just skip

  // The page never rendering a form for Norte is not, by itself, proof the ACTION re-checks the region: a form posts straight to this same
  // URL, so capture the exact wire request Next.js produces for a real, authorized call by Sul (an internal note), then replay that same
  // request verbatim with Norte's own session cookies. If the server trusted the client instead of re-deriving the region from the STORED
  // record, the note would land twice.
  const note = "nota original da equipe sobre esta solicitação";
  let captured: { url: string; headers: Record<string, string>; body: Buffer | null } | null = null;
  const capture = (r: Request) => { if (r.method() === "POST" && r.url() === requestUrl && !captured) captured = { url: r.url(), headers: r.headers(), body: r.postDataBuffer() }; };
  sul.page.on("request", capture);
  await sul.page.locator("#note-only").fill(note);
  await sul.page.getByRole("button", { name: "Registrar observação" }).click();
  await expect(sul.page.getByText("Observação registrada.")).toBeVisible();
  sul.page.off("request", capture);
  expect(captured, "captured the real Server Action POST").not.toBeNull();
  const forgedHeaders = { ...captured!.headers };
  delete forgedHeaders.cookie;
  delete forgedHeaders["content-length"];
  delete forgedHeaders.host;
  await norte.context.request.post(captured!.url, { headers: forgedHeaders, data: captured!.body ?? undefined }).catch(() => undefined);
  await open(sul.page, requestUrl.replace(ADMIN, ""));
  const historyAfterReplay = await sul.page.getByTestId("request-history").innerText();
  expect(historyAfterReplay.split(note).length - 1).toBe(1); // Norte's replay, same bytes and all, added nothing
  await expect(sul.page.getByTestId("request-status")).toHaveText("Recebida"); // and no state moved either
  await norte.context.close();

  // 5. wa.me and mailto only open on a human click; nothing is sent by the CMS.
  const contacted: string[] = [];
  await sul.context.route(/^https:\/\/(wa\.me|api\.whatsapp\.com)\//, (route) => { contacted.push(route.request().url()); return route.fulfill({ status: 200, contentType: "text/html", body: "<title>wa</title>" }); });
  await open(sul.page, requestUrl.replace(ADMIN, ""));
  expect(contacted).toEqual([]);
  const wa = sul.page.getByTestId("open-whatsapp");
  expect(await wa.getAttribute("href")).toMatch(/^https:\/\/wa\.me\/5551999998888\?text=/);
  const mail = sul.page.getByTestId("open-mailto");
  const mailHref = await mail.getAttribute("href");
  expect(mailHref).toMatch(/^mailto:ana\.souza@exemplo\.com\?subject=/);
  const mailParsed = new URL(mailHref!.replace("mailto:", "http://x/"));
  expect(mailParsed.searchParams.get("subject")).toBe(`Sua personalização na Use Origens (ref. ${reference})`);
  expect(mailParsed.searchParams.get("body")).toContain(reference);
  expect(mailParsed.searchParams.get("body")).toContain("Ana!");
  expect(contacted).toEqual([]); // reading the links opened nothing

  // 6. The production states, in order, with the human confirmation gate; there is no order id anywhere in the UI.
  // The honest copy legitimately says the word "pedido" (disclaiming that none is tracked); what must be ABSENT is an order-number field or label.
  await expect(sul.page.getByLabel(/número do pedido/i)).toHaveCount(0);
  await expect(sul.page.locator("#order")).toHaveCount(0);
  await expect(sul.page.getByRole("button", { name: /vincular pedido/i })).toHaveCount(0);
  await sul.page.locator("#status").selectOption("inCreation");
  await sul.page.getByRole("button", { name: "Atualizar estado" }).click();
  await expect(sul.page.getByTestId("request-status")).toHaveText("Em criação");
  await sul.page.locator("#status").selectOption("artReady");
  await sul.page.getByRole("button", { name: "Atualizar estado" }).click();
  await expect(sul.page.getByTestId("request-status")).toHaveText("Arte pronta");
  await sul.page.locator("#status").selectOption("customerContacted");
  await sul.page.getByRole("button", { name: "Atualizar estado" }).click();
  await expect(sul.page.getByText(/Marque a confirmação/)).toBeVisible();
  await expect(sul.page.getByTestId("request-status")).toHaveText("Arte pronta");
  await sul.page.locator("#status").selectOption("customerContacted");
  await sul.page.getByTestId("confirm-contacted").check();
  await sul.page.getByRole("button", { name: "Atualizar estado" }).click();
  await expect(sul.page.getByTestId("request-status")).toHaveText("Cliente contatado");
  await sul.page.locator("#status").selectOption("closed");
  await sul.page.getByRole("button", { name: "Atualizar estado" }).click();
  await expect(sul.page.getByTestId("request-status")).toHaveText("Encerrada");

  // 7. The customer's own private reference page shows the plain-language status and the masked contact — never the raw number, never cached.
  const ownRequest = await sul.context.request.get(`${SITE}/sul/personalizar/solicitacao/${fullToken}`);
  expect(ownRequest.status()).toBe(200);
  const ownHtml = await ownRequest.text();
  expect(ownHtml).toContain("Solicitação encerrada");
  expect(ownHtml).toContain("WhatsApp final 8888");
  expect(ownHtml).not.toContain("99999");
  expect(ownHtml).toContain("noindex");
  expect(ownRequest.headers()["cache-control"]).toMatch(/no-store|no-cache|private/);
  await sul.context.close();
});

test("given the manual-contact form with no request store configured, when submitted, then it reports unavailable instead of pretending success, and the public pages it shares nothing with keep working", async ({ page, request }) => {
  // The pages a Postgres outage could plausibly touch never import the request store at all: they read only the published bundle.
  const publicRenderers = ["src/app/[region]/page.tsx", "src/app/[region]/h/[slug]/page.tsx", "src/app/[region]/colecoes/[slug]/page.tsx"];
  for (const file of publicRenderers) {
    const source = await readFile(path.join(process.cwd(), file), "utf8");
    expect(source, file).not.toMatch(/customization\/(requests|server)/);
  }
  // The home and the two hotpages already published stay reachable and correct under this build's live Postgres (a genuinely unreachable
  // database for the WHOLE server is exercised by the unit tests in tests/unit/submit-action.test.ts, which stub the store's own failure
  // instead of tearing down this shared E2E environment's connection for every other test in the file).
  await expect((await request.get(`${SITE}/sul`)).status()).toBe(200);
  await page.goto(`${SITE}/sul`, { waitUntil: "domcontentloaded" });
  await expect(page.locator("section#footer, footer")).toBeVisible();
});

test("given an uploaded image still referenced by the published version, when the library is opened, then it cannot be removed, and objects are never deleted fr, when the library is opened, then it cannot be removed, and objects are never deleted from storage", async ({ browser }) => {
  const { context, page } = await newSession(browser, "owner@e2e.test");
  await open(page, "/admin/midia");
  await expect(page.getByText("Em uso no rascunho").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Excluir" }).first()).toBeDisabled();
  expect(((await (await fetch(`${S3}/__stats`)).json()) as { objects: number }).objects).toBe(s3ObjectsAfterAllUploads); // stable since the manual-contact test's own upload
  await context.close();
});
