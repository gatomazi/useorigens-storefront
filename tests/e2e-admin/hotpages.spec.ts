import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

/**
 * Hotpages, parent-category landings and personalization, end to end on the local dev server (sandbox in a temp dir; nothing here touches production).
 * Scenarios A (editorial hotpage) → B (category landing + link from the home) → C (model with 4→6 lines and the fixed first card) →
 * D (city / locality / caption) → E (operation: manual order link, restore keeps old requests, honest copy). Uses the locally synced catalogs.
 * Mockups: the two reference pictures are read from `referencias/` (pai-paranaense-churrasqueiro-lenda.png, la-de-santiago.png) and uploaded through the CMS media flow
 * exactly as they are. When a file is missing the test says which one and uses a neutral stand-in, so nothing is ever invented in its place.
 */
const REFERENCE_DIR = path.join(process.cwd(), "referencias");
const REFERENCES = { pai: "pai-paranaense-churrasqueiro-lenda.png", santiago: "la-de-santiago.png" } as const;
const read = (file: string) => readFile(path.join(REFERENCE_DIR, file)).catch(() => null);
/** Part of the uploaded file name each model's mockup is picked by (the real name when the reference exists, the stand-in's otherwise). */
const mockupName = { pai: "mockup-pai", santiago: "mockup-santiago" };

const hydrated = (page: Page) => page.waitForFunction(() => document.documentElement.dataset.hydrated === "true", undefined, { timeout: 180_000 });
async function open(page: Page, url: string) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 300_000 });
  await hydrated(page);
}
const flash = (page: Page, text: RegExp) => page.getByRole("status").locator("p", { hasText: text });
const sections = (html: string) => [...html.matchAll(/<section[^>]*id="([^"]+)"/g)].map((m) => m[1]);
const publicHtml = async (page: Page, url: string) => (await page.request.get(url, { timeout: 300_000 })).text();
const status = async (page: Page, url: string) => (await page.request.get(url, { timeout: 300_000 })).status();
const waitPost = (page: Page) => page.waitForResponse((r) => r.request().method() === "POST", { timeout: 120_000 });

/** Picks an INK collection in the autocomplete by (part of) its name. The text autocomplete, not a `<select>` (also a combobox): the new-model form has "Origem" first. */
async function pickCollection(page: Page, scopeSelector: ReturnType<Page["locator"]>, text: string, optionName: RegExp) {
  const combo = scopeSelector.locator('input[role="combobox"]').first();
  await combo.fill(text);
  await page.getByRole("option", { name: optionName }).first().click();
}

test.describe.configure({ mode: "serial" });

const state: { sulHomeBefore: string[]; pageId: string } = { sulHomeBefore: [], pageId: "" };

test("A · hotpage: create, compose, style, reorder, preview, publish, restore — the home never changes", async ({ page }) => {
  const { default: sharp } = await import("sharp");
  const tee = (r: number, g: number, b: number) => sharp({ create: { width: 900, height: 1000, channels: 3, background: { r, g, b } } }).png().toBuffer();
  await open(page, "/admin");
  state.sulHomeBefore = sections(await publicHtml(page, "/sul"));

  // Media for the later scenarios: the real reference mockups when present, neutral stand-ins (and a loud note) when not.
  const realPai = await read(REFERENCES.pai);
  const realSantiago = await read(REFERENCES.santiago);
  const missing = [!realPai && `referencias/${REFERENCES.pai}`, !realSantiago && `referencias/${REFERENCES.santiago}`].filter(Boolean) as string[];
  if (missing.length > 0) test.info().annotations.push({ type: "missing-reference-mockup", description: missing.join(", ") });
  if (realPai) mockupName.pai = REFERENCES.pai.replace(/\.png$/, "");
  if (realSantiago) mockupName.santiago = REFERENCES.santiago.replace(/\.png$/, "");
  await open(page, "/admin/midia");
  await page.locator('input[type="file"]').setInputFiles([
    realPai ? { name: REFERENCES.pai, mimeType: "image/png", buffer: realPai } : { name: "mockup-pai.png", mimeType: "image/png", buffer: await tee(10, 10, 10) },
    realSantiago ? { name: REFERENCES.santiago, mimeType: "image/png", buffer: realSantiago } : { name: "mockup-santiago.png", mimeType: "image/png", buffer: await tee(20, 20, 24) },
    { name: "card-pai.png", mimeType: "image/png", buffer: await tee(30, 24, 20) },
  ]);
  await page.getByRole("button", { name: "Enviar", exact: true }).click();
  await expect(page.getByRole("status", { name: "Resultado do envio" }).getByText("Enviada", { exact: true })).toHaveCount(3, { timeout: 180_000 });

  // Create the hotpage. Not public: 404 until published.
  expect(await status(page, "/sul/h/dia-dos-pais")).toBe(404);
  await open(page, "/admin/paginas");
  await page.getByLabel("Título", { exact: true }).fill("Dia dos Pais");
  await page.getByRole("button", { name: "Criar rascunho" }).click();
  await expect(page).toHaveURL(/\/admin\/paginas\/pg-[0-9a-f]+/);
  state.pageId = page.url().split("/paginas/")[1].split("?")[0];
  await expect(page.getByRole("heading", { name: "Dia dos Pais", level: 1 })).toBeVisible();
  await expect(page.locator("code", { hasText: "/sul/h/dia-dos-pais" }).first()).toBeVisible();
  expect(await status(page, "/sul/h/dia-dos-pais")).toBe(404); // a draft has no public URL

  // Two collections (real, public) as sections.
  const add = page.locator("section[aria-labelledby=add]");
  await pickCollection(page, add, "da nossa terra", /Da Nossa Terra/);
  await add.getByLabel("Título (opcional)").fill("Pais da nossa terra");
  await add.getByRole("button", { name: "Criar seção" }).click();
  await expect(flash(page, /Seção criada/)).toBeVisible();
  await open(page, `/admin/paginas/${state.pageId}`);
  await pickCollection(page, page.locator("section[aria-labelledby=add]"), "fala daqui", /Fala Daqui/);
  await page.locator("section[aria-labelledby=add]").getByLabel("Título (opcional)").fill("Pais que falam daqui");
  await page.locator("section[aria-labelledby=add]").getByRole("button", { name: "Criar seção" }).click();
  await expect(flash(page, /Seção criada/)).toBeVisible();
  await open(page, `/admin/paginas/${state.pageId}`);
  await page.getByRole("button", { name: "Adicionar Campanha regional" }).click();
  await expect(flash(page, /Seção criada/)).toBeVisible();

  // Hero: title, subtitle, colour and a picture.
  await open(page, `/admin/paginas/${state.pageId}`);
  await page.locator("tr", { hasText: "Topo da página" }).getByRole("link", { name: "Editar" }).click();
  await hydrated(page);
  await page.getByLabel("Título", { exact: true }).fill("Presentes para pais");
  await page.getByLabel("Subtítulo").fill("Camisetas com o nome, a cidade e o jeito de quem a gente admira.");
  await page.getByLabel("Cor sólida").check();
  await page.getByLabel("Cor", { exact: true }).selectOption("token:near-black");
  await page.getByLabel("Imagem desktop (opcional)").selectOption("legacy:sul/fala-daqui-desktop");
  await page.getByLabel("Imagem mobile (opcional)").selectOption("legacy:sul/fala-daqui-mobile");
  await page.getByLabel("Véu", { exact: true }).selectOption("regional-wash-dark");
  await page.getByRole("button", { name: "Salvar rascunho" }).click();
  await expect(flash(page, /Rascunho salvo/)).toBeVisible();

  // Reorder: the campaign goes up above the second carousel.
  await open(page, `/admin/paginas/${state.pageId}`);
  const rows = page.locator("section[aria-label='Seções da página'] tbody tr");
  await expect(rows).toHaveCount(4);
  const posted = waitPost(page);
  await page.getByRole("button", { name: /^Mover “/ }).last().press("Space");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Space");
  await posted;
  await page.waitForLoadState("networkidle");
  await expect(rows.nth(2)).toContainText("Campanha");

  // Preview at 375 and desktop uses the storefront's own components.
  for (const kind of ["mobile", "desktop"] as const) {
    const frame = page.frameLocator(`iframe[data-preview="${kind}"]`);
    await expect(frame.getByRole("heading", { name: "Presentes para pais", level: 1 }), `${kind} preview`).toBeVisible({ timeout: 300_000 });
    await expect(frame.getByRole("heading", { name: "Pais da nossa terra" })).toBeVisible();
    await expect(frame.getByRole("heading", { name: "Pais que falam daqui" })).toBeVisible();
  }

  // Publish the page only.
  await page.getByLabel("Nota (opcional)").fill("primeira versão");
  await page.getByRole("button", { name: "Publicar página no sandbox local" }).click();
  await expect(flash(page, /Página publicada/)).toBeVisible({ timeout: 300_000 });
  const html = await publicHtml(page, "/sul/h/dia-dos-pais");
  expect(html).toContain("Presentes para pais");
  expect(html).toMatch(/<meta name="robots" content="noindex/); // published but not indexable until the owner turns it on
  expect(html).toContain('rel="canonical"');
  expect(sections(await publicHtml(page, "/sul"))).toEqual(state.sulHomeBefore); // the home did not change

  // Edit and publish again, then restore the first version: only the page changes back.
  await open(page, `/admin/paginas/${state.pageId}`);
  await page.getByLabel("Título (nome editorial)").fill("Dia dos Pais 2026");
  await page.getByRole("button", { name: "Salvar rascunho" }).first().click();
  await expect(flash(page, /Rascunho da página salvo/)).toBeVisible();
  await page.getByRole("button", { name: "Publicar página no sandbox local" }).click();
  await expect(flash(page, /Página publicada/)).toBeVisible({ timeout: 300_000 });
  await page.getByRole("button", { name: /Restaurar a versão \d+ desta página/ }).first().click();
  await expect(flash(page, /restaurada como nova publicação/)).toBeVisible({ timeout: 300_000 });
  expect(sections(await publicHtml(page, "/sul"))).toEqual(state.sulHomeBefore);
  expect(await publicHtml(page, "/sul/h/dia-dos-pais")).toContain("Presentes para pais");

  // The preview is not a public page: it is noindex, and the public URL of a draft-only page never exists.
  const preview = await page.request.get(`/admin/preview?page=${state.pageId}`, { timeout: 300_000 });
  expect(await preview.text()).toMatch(/<meta name="robots" content="noindex/);
});

const landing: { id: string } = { id: "" };

test("B · category landing: three subthemes from real collections, an internal one without a false 'Ver todos', the wrong region refused, drafts 404, and a showcase link that goes to it", async ({ page }) => {
  // The internal collection must be enabled in the Library first (this does not touch INK). Idempotent: another spec sharing this sandbox
  // (playwright.admin.config.ts pins roundtrip.spec.ts before this file for exactly this reason) may already have enabled it.
  await open(page, "/admin/colecoes?q=fe+de+origem");
  const feRow = page.locator("table.a-table tbody tr", { hasText: "Fé de Origem" });
  const enableFe = feRow.getByRole("button", { name: "Habilitar" });
  if (await enableFe.count() > 0) {
    await enableFe.click();
    await expect(flash(page, /habilitada para uso no CMS/)).toBeVisible();
  } else {
    await expect(feRow).toContainText("Habilitada no CMS");
  }

  await open(page, "/admin/paginas");
  await page.getByLabel("Tipo", { exact: true }).first().selectOption("categoryLanding");
  await page.locator("#title").fill("Pais");
  await page.getByRole("button", { name: "Criar rascunho" }).click();
  await expect(page).toHaveURL(/\/admin\/paginas\/pg-[0-9a-f]+/);
  landing.id = page.url().split("/paginas/")[1].split("?")[0];
  await expect(page.locator("code", { hasText: "/sul/colecoes/pais" }).first()).toBeVisible();

  const addSection = async (search: string, option: RegExp, title: string) => {
    await open(page, `/admin/paginas/${landing.id}`);
    const add = page.locator("section[aria-labelledby=add]");
    await pickCollection(page, add, search, option);
    await add.getByLabel("Título (opcional)").fill(title);
    await add.getByRole("button", { name: "Criar seção" }).click();
    await expect(flash(page, /Seção criada/)).toBeVisible();
  };
  await addSection("da nossa terra", /Da Nossa Terra/, "Pais da nossa terra");
  await addSection("fe de origem", /Fé de Origem/, "Pais com fé de origem");
  await addSection("do nosso jeito", /Do Nosso Jeito/, "Pais do nosso jeito");

  // The internal collection's section says there is no public page, so no "Ver todos".
  await open(page, `/admin/paginas/${landing.id}`);
  await page.locator("tr", { hasText: "Pais com fé de origem" }).getByRole("link", { name: "Editar" }).click();
  await hydrated(page);
  await expect(page.getByText(/Coleção interna: link “Ver todos” desativado/)).toBeVisible();

  // A form forged with another region's collection is refused by the server.
  await open(page, `/admin/paginas/${landing.id}`);
  await page.evaluate(() => {
    const input = document.querySelector('section[aria-labelledby=add] input[name="collection"]') as HTMLInputElement;
    input.value = "use-norte:1";
    input.closest("form")!.requestSubmit();
  });
  await expect(page.getByRole("status").getByText(/outra loja da INK|Escolha uma coleção|não existe/)).toBeVisible({ timeout: 120_000 });

  // A second landing that stays a draft: 404 in the storefront, always.
  await open(page, "/admin/paginas");
  await page.getByLabel("Tipo", { exact: true }).first().selectOption("categoryLanding");
  await page.locator("#title").fill("Rascunho de teste");
  await page.getByRole("button", { name: "Criar rascunho" }).click();
  await expect(page).toHaveURL(/\/admin\/paginas\/pg-[0-9a-f]+/);
  const draftId = page.url().split("/paginas/")[1].split("?")[0];
  expect(await status(page, "/sul/colecoes/rascunho-de-teste")).toBe(404);

  // Publish the landing: public URL with the three subthemes; the internal collection shows products but has no collection link.
  await open(page, `/admin/paginas/${landing.id}`);
  await page.getByRole("button", { name: "Publicar página no sandbox local" }).click();
  await expect(flash(page, /Página publicada/)).toBeVisible({ timeout: 300_000 });
  const html = await publicHtml(page, "/sul/colecoes/pais");
  for (const heading of ["Pais da nossa terra", "Pais com fé de origem", "Pais do nosso jeito"]) expect(html).toContain(heading);
  const internal = html.slice(html.indexOf("Pais com fé de origem"), html.indexOf("Pais do nosso jeito"));
  expect(internal).toContain("usesul.com.br/usesul/product/"); // real products of the same store
  expect(internal).not.toContain("/collections/"); // no invented "Ver todos"
  expect(await status(page, "/sul/colecoes/rascunho-de-teste")).toBe(404);

  // A showcase card leads to the landing: first a link to a DRAFT page is refused at publish; then to the published one.
  const setHomeCta = async (label: RegExp) => {
    await open(page, "/admin/home");
    await page.locator("tr", { hasText: "Feito Para Você" }).getByRole("link", { name: "Editar" }).click();
    await hydrated(page);
    await page.getByLabel("Destino", { exact: true }).selectOption("page");
    const select = page.getByLabel("Página", { exact: true });
    const texts = await select.locator("option").allTextContents();
    const wanted = texts.find((t) => label.test(t));
    expect(wanted, `option matching ${label}`).toBeTruthy();
    await select.selectOption({ label: wanted! });
    await page.getByRole("button", { name: "Salvar rascunho" }).click();
    await expect(flash(page, /Rascunho salvo/)).toBeVisible();
  };
  void draftId;
  await setHomeCta(/Categoria-pai: Rascunho de teste/);
  await open(page, "/admin/publicar");
  await expect(page.getByText(/que não existe ou ainda não foi publicada/)).toBeVisible(); // the publish screen names the blocker
  await expect(page.getByRole("button", { name: "Publicar no sandbox local" })).toBeDisabled();
  await setHomeCta(/Categoria-pai: Pais(?! \()/);
  await open(page, "/admin/publicar");
  await page.getByRole("button", { name: "Publicar no sandbox local" }).click();
  await expect(flash(page, /Publicado no sandbox local/)).toBeVisible({ timeout: 300_000 });
  expect(await publicHtml(page, "/sul")).toContain('href="/sul/colecoes/pais"');
});


const model: { paiId: string; santiagoId: string; paiPrivate: string } = { paiId: "", santiagoId: "", paiPrivate: "" };
const BUY_NOW = /comprar agora|finalizar compra|checkout|carrinho/i;
const send = (page: Page) => page.getByRole("button", { name: "Enviar solicitação", exact: true });

/** Picks a media option (the media table lists uploads as "name (w×h)") by part of its name. */
async function pickMedia(page: Page, selector: string, part: string) {
  const select = page.locator(selector);
  const texts = await select.locator("option").allTextContents();
  const wanted = texts.find((t) => t.includes(part));
  expect(wanted, `media option containing ${part}`).toBeTruthy();
  await select.selectOption({ label: wanted! });
}

/** The image is really drawn (decoded, non-empty) and keeps the aspect ratio of the file that was uploaded: the art is not cropped or stretched. */
async function expectMockup(page: Page, img: ReturnType<Page["locator"]>, ratio: number | null) {
  await expect.poll(() => img.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0), { message: "mockup decoded" }).toBe(true);
  if (ratio) {
    const { w, h } = await img.evaluate((i: HTMLImageElement) => ({ w: i.naturalWidth, h: i.naturalHeight }));
    expect(Math.abs(w / h - ratio) / ratio).toBeLessThan(0.02);
  }
}
async function ratioOf(file: string, fallback: number): Promise<number> {
  const bytes = await read(file);
  if (!bytes) return fallback;
  const { default: sharp } = await import("sharp");
  const meta = await sharp(bytes).metadata();
  return (meta.width ?? 1) / (meta.height ?? 1);
}

async function fillContact(page: Page, c: { name?: string; whatsapp?: string; email?: string; confirm?: boolean }) {
  if (c.name !== undefined) await page.getByLabel(/^Nome/).fill(c.name);
  if (c.whatsapp !== undefined) await page.getByLabel(/^WhatsApp/).fill(c.whatsapp);
  if (c.email !== undefined) await page.getByLabel(/^E-mail/).fill(c.email);
  if (c.confirm !== undefined) await page.getByLabel(/Autorizo a equipe/).setChecked(c.confirm);
}
async function openPublic(page: Page, url: string) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 300_000 });
  await hydrated(page);
}

test("C · model 'Pai Paranaense' (4 lines, up to 6): mockup, first fixed card 1 + 5, contact form, three ways of being reached, request in the queue", async ({ page }) => {
  const paiRatio = await ratioOf(REFERENCES.pai, 0.9);
  await open(page, "/admin/personalizacao");
  const create = page.locator("section[aria-labelledby=novo]");
  await create.getByLabel("Nome").fill("Pai Paranaense");
  await pickCollection(page, create, "fe de origem", /Fé de Origem/);
  await create.getByRole("button", { name: "Criar rascunho" }).click();
  await expect(page).toHaveURL(/\/admin\/personalizacao\/cz-[0-9a-f]+/);
  model.paiId = page.url().split("/personalizacao/")[1].split("?")[0];
  await hydrated(page);

  await pickMedia(page, "#mockup_image", mockupName.pai);
  await page.locator("#mockup_alt").fill("Camiseta com o texto do Pai Paranaense");
  await page.getByLabel(/O cliente escreve várias linhas/).check();
  await page.locator("#lg_label").fill("Linhas da camiseta");
  await page.locator("#lg_line_label").fill("Linha {n}");
  await page.locator("#lg_min").fill("1");
  await page.locator("#lg_initial").fill("4");
  await page.locator("#lg_max").fill("6");
  await page.locator("#lg_maxlength").fill("16");
  await page.locator("#lg_defaults").fill("PAI\nPARANAENSE\nCHURRASQUEIRO\nLENDA");
  await page.getByLabel(/Modelo ativo/).check();
  await page.getByRole("button", { name: "Salvar rascunho" }).click();
  await expect(flash(page, /Modelo salvo no rascunho/)).toBeVisible();
  // The editor no longer has any checkout-flavoured field.
  await expect(page.locator("#ink_product_id")).toHaveCount(0);
  // The admin preview (mobile 375 and desktop) draws the mockup untouched.
  for (const kind of ["mobile", "desktop"] as const) {
    const frame = page.frameLocator(`iframe[data-preview="${kind}"]`);
    await expectMockup(page, frame.getByAltText("Camiseta com o texto do Pai Paranaense"), paiRatio);
    await expect(frame.getByRole("button", { name: "Testar o envio (prévia)" })).toBeVisible(); // the preview never sends
    await expect(frame.getByLabel(/^Nome/)).toBeVisible(); // and it shows the contact section
  }

  // Publishing the model: only this model; the public page exists afterwards, before that it is a 404.
  expect(await status(page, "/sul/personalizar/pai-paranaense")).toBe(404);
  expect(await status(page, "/norte/personalizar/pai-paranaense")).toBe(404);
  await page.getByRole("button", { name: /Publicar página no sandbox local/ }).click();
  await expect(flash(page, /Modelo publicado/)).toBeVisible({ timeout: 300_000 });
  expect(await status(page, "/sul/personalizar/pai-paranaense")).toBe(200);
  expect(await status(page, "/norte/personalizar/pai-paranaense")).toBe(404); // another region never serves it

  // First card of the landing's "fé de origem" carousel: 6 cards in total = 1 reserved + 5 products.
  await open(page, `/admin/paginas/${landing.id}`);
  await page.locator("tr", { hasText: "Pais com fé de origem" }).getByRole("link", { name: "Editar" }).click();
  await hydrated(page);
  await page.locator("#source_limit").fill("6");
  await page.getByLabel(/Destacar um produto personalizável como primeiro card/).check();
  await page.locator("#cc_customizer").selectOption({ index: 1 });
  await page.getByRole("button", { name: "Salvar rascunho" }).click();
  await expect(flash(page, /Rascunho salvo/)).toBeVisible();
  await open(page, `/admin/paginas/${landing.id}`);
  await page.getByRole("button", { name: "Publicar página no sandbox local" }).click();
  await expect(flash(page, /Página publicada/)).toBeVisible({ timeout: 300_000 });

  await page.goto("/sul/colecoes/pais", { waitUntil: "domcontentloaded", timeout: 300_000 });
  const carousel = page.locator("section", { has: page.getByRole("heading", { name: "Pais com fé de origem" }) });
  await expect(carousel.locator("li")).toHaveCount(6);
  await expect(carousel.locator("li").first()).toHaveAttribute("data-customizer-card", "true");
  await expect(carousel.locator("li[data-customizer-card] a").first()).toHaveAttribute("href", "/sul/personalizar/pai-paranaense");
  await expect(carousel.locator("[data-customizer-card]")).toHaveCount(1);
  await carousel.locator("[data-customizer-card]").scrollIntoViewIfNeeded();
  await expectMockup(page, carousel.locator("[data-customizer-card] img").first(), null);
  await expect(carousel.locator("[data-customizer-card]")).toContainText("Personalizável");
  expect(await carousel.locator("[data-customizer-card]").innerText()).not.toMatch(BUY_NOW); // it is not a buyable product

  // The public page: intro copy that separates a request from a purchase; 4 initial lines, up to 6.
  await openPublic(page, "/sul/personalizar/pai-paranaense");
  await expect(page.getByTestId("customization-intro")).toContainText("Esta etapa não é uma compra nem reserva um produto");
  await expectMockup(page, page.getByAltText("Camiseta com o texto do Pai Paranaense"), paiRatio);
  await expect(page.getByText("Imagem ilustrativa", { exact: false })).toBeVisible();
  await expect(page.getByTestId("contact-fieldset")).toBeVisible();
  await expect(page.getByLabel(/Autorizo a equipe/)).not.toBeChecked(); // unticked by default
  for (const [i, text] of ["PAI", "PARANAENSE", "CHURRASQUEIRO", "LENDA"].entries()) await expect(page.getByLabel(`Linha ${i + 1}`, { exact: true })).toHaveValue(text);
  await expect(page.getByLabel("Linha 5", { exact: true })).toHaveCount(0);
  const add = page.getByRole("button", { name: /Adicionar linha/ });
  await add.click();
  await add.click();
  await expect(add).toBeDisabled(); // 6 is the model's ceiling
  await page.getByLabel("Linha 5", { exact: true }).fill("DE SANGUE");
  await page.getByLabel("Linha 6", { exact: true }).fill("E FÉ");
  await expect(page.getByRole("heading", { name: "Resumo da sua personalização" })).toBeVisible();
  expect(await page.locator("body").innerText()).not.toMatch(BUY_NOW);

  // Nothing filled in the contact: three problems at once, and what was typed stays.
  await send(page).click();
  await expect(page.getByRole("alert").filter({ hasText: /Nome:/ })).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: /WhatsApp ou um e-mail/ })).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: /Marque a autorização/ })).toBeVisible();
  await expect(page.getByLabel("Linha 5", { exact: true })).toHaveValue("DE SANGUE");
  await expect(page.getByTestId("customization-done")).toHaveCount(0);

  // Bad contact data, and a missing confirmation.
  await fillContact(page, { name: "A", whatsapp: "99999-8888", email: "sem-arroba", confirm: false });
  await send(page).click();
  await expect(page.getByRole("alert").filter({ hasText: /Nome:/ })).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: /WhatsApp:/ })).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: /E-mail:/ })).toBeVisible();
  await fillContact(page, { name: "Ana Souza", whatsapp: "(51) 99999-8888", email: "", confirm: false });
  await send(page).click();
  await expect(page.getByRole("alert").filter({ hasText: /Marque a autorização/ })).toBeVisible(); // valid channel, but no confirmation
  await expect(page.getByTestId("customization-done")).toHaveCount(0);

  // The personalization lines are validated too (markup, over the model's own limit).
  await fillContact(page, { confirm: true });
  await page.getByLabel("Linha 1", { exact: true }).fill("<b>PAI</b>");
  await send(page).click();
  await expect(page.getByRole("alert").first()).toBeVisible();
  await expect(page.getByTestId("customization-done")).toHaveCount(0);
  await page.getByLabel("Linha 1", { exact: true }).fill("PAI");
  await page.getByLabel("Linha 2", { exact: true }).fill("MUITO MAIS DO QUE DEZESSEIS CARACTERES");
  await send(page).click();
  await expect(page.getByRole("alert").first()).toBeVisible();
  await page.getByLabel("Linha 2", { exact: true }).fill("PARANAENSE");

  // 1) name + WhatsApp only.
  await send(page).click();
  const done = page.getByTestId("customization-done");
  await expect(done).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("customization-reference")).toHaveText(/^[0-9A-Z]{8}$/);
  await expect(done).toContainText("Vamos preparar sua estampa e entrar em contato pelo WhatsApp ou e-mail informado quando ela estiver pronta para comprar");
  await expect(done).toContainText("Nenhuma compra foi realizada nesta etapa");
  await expect(done).toContainText("E FÉ");
  await expect(page.getByTestId("customization-channels")).toHaveText("Contato informado: WhatsApp final 8888");
  const doneText = await done.innerText();
  expect(doneText).not.toContain("99999"); // the number is masked on screen
  expect(doneText).not.toMatch(BUY_NOW);
  expect(page.url()).not.toMatch(/Ana|Souza|99999|@/); // no contact in the URL
  model.paiPrivate = (await page.getByTestId("customization-private-link").getAttribute("href")) ?? "";
  expect(model.paiPrivate).toMatch(/^\/sul\/personalizar\/solicitacao\/[A-Za-z0-9_-]{32}$/);

  // 2) name + e-mail only (a fresh page: a fresh idempotency key).
  await openPublic(page, "/sul/personalizar/pai-paranaense");
  await fillContact(page, { name: "Bruno", email: "  Bruno.Lima@Exemplo.COM ", confirm: true });
  await send(page).click();
  await expect(page.getByTestId("customization-done")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("customization-channels")).toHaveText("Contato informado: B***@exemplo.com");

  // 3) both channels, and a double click that must create ONE request.
  await openPublic(page, "/sul/personalizar/pai-paranaense");
  await fillContact(page, { name: "Carla Dias", whatsapp: "+55 51 98888-7777", email: "carla@exemplo.com", confirm: true });
  await send(page).dblclick();
  await expect(page.getByTestId("customization-done")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("customization-channels")).toContainText("WhatsApp final 7777");
  await expect(page.getByTestId("customization-channels")).toContainText("c***@exemplo.com");

  // The queue: the three requests, with who asked and which channels exist, never the numbers themselves.
  await open(page, "/admin/personalizacao/solicitacoes");
  const rows = page.locator("table.a-table tbody tr", { hasText: "Pai Paranaense" });
  await expect(rows).toHaveCount(3);
  const carla = rows.filter({ hasText: "Carla Dias" });
  await expect(carla).toHaveCount(1); // the double click made one request
  await expect(carla.getByTestId("has-whatsapp")).toBeVisible();
  await expect(carla.getByTestId("has-email")).toBeVisible();
  await expect(rows.filter({ hasText: "Ana Souza" }).getByTestId("has-email")).toHaveCount(0);
  await expect(rows.filter({ hasText: "Bruno" }).getByTestId("has-whatsapp")).toHaveCount(0);
  for (const row of await rows.all()) await expect(row).toContainText("Recebida");
  const tableText = await page.locator("table.a-table").innerText();
  expect(tableText).not.toMatch(/99999|98888|@exemplo/); // the queue never prints the contact itself
  await expect(page.getByTestId("queue-open-count")).toContainText("3 pendente(s)");
  await expect(page.getByTestId("pending-requests").first()).toContainText("3");
  await open(page, "/admin");
  await expect(page.getByTestId("overview-pending-requests")).toContainText("3");
  // Search by name works; searching by the phone number does not (the contact is not indexed).
  await open(page, "/admin/personalizacao/solicitacoes?q=Bruno");
  await expect(page.locator("table.a-table tbody tr", { hasText: "Pai Paranaense" })).toHaveCount(1);
  await open(page, "/admin/personalizacao/solicitacoes?q=988887777");
  await expect(page.locator("table.a-table tbody tr", { hasText: "Pai Paranaense" })).toHaveCount(0);
});

test("D · model 'Lá de Santiago': city, optional locality and caption; labels and version travel with the request; a later edit never rewrites it", async ({ page }) => {
  const santiagoRatio = await ratioOf(REFERENCES.santiago, 0.9);
  await open(page, "/admin/personalizacao");
  const create = page.locator("section[aria-labelledby=novo]");
  await create.getByLabel("Nome").fill("Lá de Santiago");
  await pickCollection(page, create, "personalizados", /Personalizados/);
  await create.getByRole("button", { name: "Criar rascunho" }).click();
  await expect(page).toHaveURL(/\/admin\/personalizacao\/cz-[0-9a-f]+/);
  model.santiagoId = page.url().split("/personalizacao/")[1].split("?")[0];
  await hydrated(page);

  await pickMedia(page, "#mockup_image", mockupName.santiago);
  await page.locator("#mockup_alt").fill("Camiseta Lá de Santiago");
  const addField = page.getByRole("button", { name: /Adicionar campo/ });
  for (const [i, [label, max, required]] of ([["Cidade", "30", true], ["Localidade", "30", false], ["Legenda", "40", false]] as const).entries()) {
    await addField.click();
    await page.locator(`#f-label-${i}`).fill(label);
    await page.locator(`#f-max-${i}`).fill(max);
    if (required) await page.locator(`[data-testid=field-row-${i}] input[type=checkbox]`).check();
  }
  await page.getByLabel(/Modelo ativo/).check();
  await page.getByRole("button", { name: "Salvar rascunho" }).click();
  await expect(flash(page, /Modelo salvo no rascunho/)).toBeVisible();
  await page.getByRole("button", { name: /Publicar página no sandbox local/ }).click();
  await expect(flash(page, /Modelo publicado/)).toBeVisible({ timeout: 300_000 });

  await openPublic(page, "/sul/personalizar/la-de-santiago");
  await expectMockup(page, page.getByAltText("Camiseta Lá de Santiago"), santiagoRatio);
  await expect(page.getByLabel(/^Cidade/)).toBeVisible();
  await expect(page.getByLabel(/^Localidade/)).toBeVisible();
  await expect(page.getByLabel(/^Legenda/)).toBeVisible();
  await expect(page.getByLabel(/^Linha 1/)).toHaveCount(0); // no line group in this model
  await send(page).click();
  await expect(page.getByRole("alert").filter({ hasText: /Cidade: preencha/ })).toBeVisible(); // the city is required
  await page.getByLabel(/^Cidade/).fill("Santiago");
  await page.getByLabel(/^Legenda/).fill("Terra dos poetas");
  await fillContact(page, { name: "Diego", email: "diego@exemplo.com", confirm: true });
  await send(page).click();
  await expect(page.getByTestId("customization-done")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("customization-done")).toContainText("Santiago");
  await expect(page.getByTestId("customization-done")).not.toContainText("Localidade"); // the empty optional one is left out
  await expect(page.getByTestId("customization-done")).toContainText("Nenhuma compra foi realizada nesta etapa");

  // The model changes (v2): the label of the city field is renamed and republished.
  await open(page, `/admin/personalizacao/${model.santiagoId}`);
  await page.locator("#f-label-0").fill("Cidade do coração");
  await page.getByRole("button", { name: "Salvar rascunho" }).click();
  await expect(flash(page, /Modelo salvo no rascunho/)).toBeVisible();
  await page.getByRole("button", { name: /Publicar página no sandbox local/ }).click();
  await expect(flash(page, /Modelo publicado/)).toBeVisible({ timeout: 300_000 });
  await openPublic(page, "/sul/personalizar/la-de-santiago");
  await expect(page.getByLabel(/^Cidade do coração/)).toBeVisible();

  // The request made before still shows the original label and the original version.
  await open(page, "/admin/personalizacao/solicitacoes");
  const row = page.locator("table.a-table tbody tr", { hasText: "Lá de Santiago" }).first();
  await expect(row).toContainText("v1");
  await expect(row).toContainText("Diego");
  await row.getByRole("link", { name: "Abrir" }).click();
  await expect(page.locator("dt", { hasText: /^Cidade$/ })).toBeVisible();
  await expect(page.getByText("Cidade do coração")).toHaveCount(0);
  await expect(page.getByText("Terra dos poetas")).toBeVisible();
  await expectMockup(page, page.getByTestId("request-mockup"), null);
});

test("E · operation: the queue is the workbench: protected contact, manual channels, the art states, a product link that only stays on the region's store, and no order anywhere", async ({ page, context }) => {
  // Every request to WhatsApp is watched: nothing may open it but a person's click.
  const contacted: string[] = [];
  await context.route(/^https:\/\/(wa\.me|api\.whatsapp\.com)\//, (route) => { contacted.push(route.request().url()); return route.fulfill({ status: 200, contentType: "text/html", body: "<title>wa</title>" }); });
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);

  await open(page, "/admin/personalizacao/solicitacoes?q=Ana");
  await page.locator("table.a-table tbody tr", { hasText: "Ana Souza" }).getByRole("link", { name: "Abrir" }).click();
  await hydrated(page);
  await expect(page.getByTestId("request-status")).toHaveText("Recebida");

  // The full contact is here (authenticated panel) and only here.
  await expect(page.getByTestId("contact-name")).toHaveText("Ana Souza");
  await expect(page.getByTestId("contact-whatsapp")).toHaveText("+5551999998888");
  await expect(page.getByTestId("contact-email")).toHaveText("não informado");
  await expect(page.getByTestId("request-mockup")).toBeVisible();
  const ref = (await page.getByTestId("request-ref").innerText()).trim();
  expect(contacted).toEqual([]); // opening the request contacted nobody

  // Nothing about orders, payment or checkout exists in the operation.
  await expect(page.locator("#order")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Vincular pedido/ })).toHaveCount(0);
  await expect(page.getByLabel(/número do pedido/i)).toHaveCount(0);
  const options = await page.locator("#status option").allTextContents();
  expect(options.join(" ")).not.toMatch(/pedido|vincul|pag|compra/i);

  // Suggested message + channels: WhatsApp opens only on a click; e-mail is absent (no address); copy goes to the clipboard.
  const message = page.locator("#suggested-message");
  await expect(message).toContainText("Olá, Ana!");
  await expect(message).toContainText(ref);
  await expect(message).not.toContainText("https://");
  const wa = page.getByTestId("open-whatsapp");
  expect(await wa.getAttribute("href")).toMatch(/^https:\/\/wa\.me\/5551999998888\?text=/);
  await expect(wa).toHaveAttribute("target", "_blank");
  await expect(wa).toHaveAttribute("rel", /noopener/);
  await expect(page.getByTestId("open-mailto")).toHaveCount(0);
  expect(contacted).toEqual([]); // still nothing sent
  await message.fill("Olá, Ana! Sua estampa ficou pronta.");
  expect(decodeURIComponent((await wa.getAttribute("href")) ?? "")).toContain("Sua estampa ficou pronta"); // the link follows the edited text
  const [popup] = await Promise.all([context.waitForEvent("page"), wa.click()]);
  await popup.waitForLoadState("domcontentloaded").catch(() => undefined);
  expect(popup.url()).toContain("wa.me/5551999998888");
  await popup.close();
  expect(contacted.length).toBe(1); // exactly one, and only after the click
  await page.getByTestId("copy-message").click();
  await expect(page.getByTestId("copy-message")).toHaveText("Mensagem copiada");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("Olá, Ana! Sua estampa ficou pronta.");
  await expect(page.getByTestId("request-status")).toHaveText("Recebida"); // clicking a channel does not change the status

  // The states: Recebida → Em criação → Arte pronta → Cliente contatado (needs a person's confirmation) → Encerrada.
  const move = async (label: string, opts: { confirm?: boolean; note?: string } = {}) => {
    await page.locator("#status").selectOption({ label });
    if (opts.note) await page.locator("#note").fill(opts.note);
    if (opts.confirm) await page.getByTestId("confirm-contacted").check();
    await page.getByRole("button", { name: "Atualizar estado" }).click();
  };
  expect((await page.locator("#status option").allTextContents()).sort()).toEqual(["Cancelada", "Em criação", "Encerrada"]); // "Encerrada" is reachable directly: sometimes the whole process happens off-system
  await move("Em criação", { note: "comecei a arte" });
  await expect(flash(page, /Estado atualizado/)).toBeVisible();
  await expect(page.getByTestId("request-status")).toHaveText("Em criação");
  await move("Arte pronta");
  await expect(page.getByTestId("request-status")).toHaveText("Arte pronta");
  await move("Cliente contatado"); // without the confirmation
  await expect(page.getByText(/Marque a confirmação de que você já falou com o cliente/)).toBeVisible();
  await expect(page.getByTestId("request-status")).toHaveText("Arte pronta");

  // The product link: only https on this region's INK store; anything else is refused; a saved one goes into the suggested message.
  const link = page.locator("#product_link");
  for (const bad of ["https://www.usenorte.com.br/x", "https://www.usesul.com.br.evil.example/x", "https://www.usesul.com.br@evil.example/x", "javascript:alert(1)", "http://www.usesul.com.br/x"]) {
    await link.fill(bad);
    await page.getByRole("button", { name: /Salvar link|Atualizar link/ }).click();
    await expect(page.getByRole("status").locator(".a-flash.err")).toBeVisible();
    await expect(page.getByTestId("product-link-saved")).toHaveCount(0);
  }
  await link.fill("https://www.usesul.com.br/usesul/product/pai-paranaense-ana#x");
  await page.getByRole("button", { name: /Salvar link/ }).click();
  await expect(flash(page, /Link do produto salvo/)).toBeVisible();
  await expect(page.getByTestId("product-link-saved")).toBeVisible();
  await expect(page.locator("#suggested-message")).toContainText("https://www.usesul.com.br/usesul/product/pai-paranaense-ana");
  await expect(page.locator("#suggested-message")).not.toContainText("#x");

  await move("Cliente contatado", { confirm: true, note: "enviei o link no WhatsApp" });
  await expect(flash(page, /Estado atualizado/)).toBeVisible();
  await expect(page.getByTestId("request-status")).toHaveText("Cliente contatado");
  await expect(page.getByText("Contato registrado pela equipe")).toBeVisible();
  await page.locator("#note-only").fill("cliente gostou da arte");
  await page.getByRole("button", { name: "Registrar observação" }).click();
  await expect(flash(page, /Observação registrada/)).toBeVisible();
  await move("Encerrada");
  await expect(page.getByTestId("request-status")).toHaveText("Encerrada");
  const history = await page.getByTestId("request-history").innerText();
  for (const expected of ["Solicitação recebida", "Estado: Em criação · comecei a arte", "Estado: Arte pronta", "Estado: Cliente contatado · enviei o link no WhatsApp", "Observação: cliente gostou da arte", "Link do produto definido", "Estado: Encerrada"]) expect(history).toContain(expected);
  expect(history).not.toMatch(/pedido|INK-/i);

  // The shortcut this state machine allows on purpose: skip straight from Recebida to Encerrada (the whole creation-and-contact process
  // sometimes happens off-system; the operator just logs the closing). "Bruno"'s request from scenario C never moved from Recebida.
  await open(page, "/admin/personalizacao/solicitacoes?q=Bruno");
  await page.locator("table.a-table tbody tr", { hasText: "Bruno" }).getByRole("link", { name: "Abrir" }).click();
  await hydrated(page);
  await expect(page.getByTestId("request-status")).toHaveText("Recebida");
  await page.locator("#status").selectOption({ label: "Encerrada" });
  await page.locator("#note").fill("feito fora do sistema, só fechando o registro");
  await page.getByRole("button", { name: "Atualizar estado" }).click();
  await expect(flash(page, /Estado atualizado/)).toBeVisible();
  await expect(page.getByTestId("request-status")).toHaveText("Encerrada");
  await expect(page.getByTestId("request-history")).toContainText("Estado: Encerrada · feito fora do sistema, só fechando o registro");

  // The customer's private reference page: the status in plain words, the contact masked, and no product link or order.
  const privateHtml = await publicHtml(page, model.paiPrivate);
  expect(privateHtml).toContain("Solicitação encerrada");
  expect(privateHtml).toContain("WhatsApp final 8888");
  expect(privateHtml).not.toContain("99999");
  expect(privateHtml).not.toContain("pai-paranaense-ana");
  expect(privateHtml).not.toMatch(/checkout|carrinho|pedido n/i);
  expect(privateHtml).toContain("noindex");
  expect(await status(page, model.paiPrivate.replace("/sul/", "/norte/"))).toBe(404); // another region's URL never shows it
  expect(await status(page, "/sul/personalizar/solicitacao/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA")).toBe(404);

  // A model restore never rewrites requests already made; the queue shows the other statuses coherently.
  await open(page, `/admin/personalizacao/${model.santiagoId}`);
  await page.getByRole("button", { name: "Restaurar esta versão" }).first().click();
  await expect(flash(page, /restaurada como nova publicação/)).toBeVisible({ timeout: 300_000 });
  await openPublic(page, "/sul/personalizar/la-de-santiago");
  await expect(page.getByLabel(/^Cidade/).first()).toBeVisible();
  await open(page, "/admin/personalizacao/solicitacoes");
  await page.locator("table.a-table tbody tr", { hasText: "Lá de Santiago" }).first().getByRole("link", { name: "Abrir" }).click();
  await expect(page.locator("dt", { hasText: /^Cidade$/ })).toBeVisible();
  await expect(page.getByTestId("contact-email")).toHaveText("diego@exemplo.com");

  // Public surfaces: no CTA of purchase, no product link, other regions have nothing.
  const html = await publicHtml(page, "/sul/personalizar/pai-paranaense");
  expect(html).toContain("noindex");
  expect(html).not.toMatch(BUY_NOW);
  expect(html).not.toMatch(/enviad[ao] (para|à) (a )?INK|segue com (a )?sua compra/i);
  expect(html).toContain("Enviar solicitação");
  expect(await status(page, "/norte/personalizar/la-de-santiago")).toBe(404);
  expect(await status(page, "/centro-oeste/personalizar/pai-paranaense")).toBe(404);
  expect(contacted.length).toBe(1); // the whole scenario reached WhatsApp exactly once: the click that was made

  // The customer's reference page is private: never cached, never indexed, never leaking a referrer.
  const own = await page.request.get(model.paiPrivate, { timeout: 300_000 });
  expect(own.status()).toBe(200);
  expect(own.headers()["cache-control"]).toMatch(/no-store|no-cache|private/); // dev says no-cache; `next start` adds private, no-store
  expect(own.headers()["referrer-policy"] ?? (await own.text())).toMatch(/no-referrer/);
});

test("F · captures: one 375 px and one desktop view of each new page type, the customer's confirmation and the operator's queue (CAPTURE=1)", async ({ browser, page }) => {
  test.skip(!process.env.CAPTURE, "captures are produced on demand");
  const dir = "docs/screenshots/2026-09-26-hotpages";
  const base = test.info().project.use.baseURL as string;
  const shots: Array<[string, string]> = [["hotpage", "/sul/h/dia-dos-pais"], ["categoria", "/sul/colecoes/pais"], ["personalizar-pai", "/sul/personalizar/pai-paranaense"], ["personalizar-santiago", "/sul/personalizar/la-de-santiago"]];
  for (const [name, target] of shots) {
    for (const [label, width, height] of [["375", 375, 900], ["desktop", 1280, 900]] as const) {
      const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, baseURL: base });
      const shot = await context.newPage();
      await shot.goto(target, { waitUntil: "networkidle", timeout: 300_000 });
      await shot.evaluate(() => document.fonts?.ready);
      await shot.screenshot({ path: `${dir}/${name}-${label}.png`, fullPage: label === "375" });
      await context.close();
    }
  }
  const context = await browser.newContext({ viewport: { width: 375, height: 900 }, baseURL: base });
  const mobile = await context.newPage();
  await mobile.goto("/sul/personalizar/pai-paranaense", { waitUntil: "networkidle", timeout: 300_000 });
  await hydrated(mobile);
  const add = mobile.getByRole("button", { name: /Adicionar linha/ });
  await add.click();
  await add.click();
  await mobile.getByLabel("Linha 5", { exact: true }).fill("DE SANGUE");
  await mobile.getByLabel("Linha 6", { exact: true }).fill("E FÉ");
  await fillContact(mobile, { name: "Marina Lopes", whatsapp: "(51) 98888-1234", email: "", confirm: true });
  await mobile.screenshot({ path: `${dir}/formulario-contato-375.png`, fullPage: true });
  await send(mobile).click();
  await expect(mobile.getByTestId("customization-done")).toBeVisible({ timeout: 60_000 });
  await mobile.screenshot({ path: `${dir}/solicitacao-375.png`, fullPage: true });
  await context.close();

  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page, "/admin/personalizacao/solicitacoes");
  await page.screenshot({ path: `${dir}/fila-desktop.png`, fullPage: true });
  await page.locator("table.a-table tbody tr", { hasText: "Marina Lopes" }).getByRole("link", { name: "Abrir" }).click();
  await expect(page).toHaveURL(/\/solicitacoes\/[0-9A-Z]{26}/);
  await expect(page.getByTestId("request-ref")).toBeVisible();
  await hydrated(page);
  await page.screenshot({ path: `${dir}/solicitacao-painel-desktop.png`, fullPage: true });
});
