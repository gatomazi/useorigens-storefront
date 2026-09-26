import { expect, test, type Page } from "@playwright/test";

/**
 * Hotpages, parent-category landings and personalization, end to end on the local dev server (sandbox in a temp dir; nothing here touches production).
 * Scenarios A (editorial hotpage) → B (category landing + link from the home) → C (model with 4→6 lines and the fixed first card) →
 * D (city / locality / caption) → E (operation: manual order link, restore keeps old requests, honest copy). Uses the locally synced catalogs.
 * The two reference mockups of the briefing were not in the package: two neutral placeholder pictures stand in for them.
 */
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

/** Picks an INK collection in the autocomplete by (part of) its name. */
async function pickCollection(page: Page, scopeSelector: ReturnType<Page["locator"]>, text: string, optionName: RegExp) {
  const combo = scopeSelector.getByRole("combobox").first();
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

  // Media for the later scenarios (the briefing's reference mockups were not available: neutral stand-ins).
  await open(page, "/admin/midia");
  await page.locator('input[type="file"]').setInputFiles([
    { name: "mockup-pai.png", mimeType: "image/png", buffer: await tee(10, 10, 10) },
    { name: "mockup-santiago.png", mimeType: "image/png", buffer: await tee(20, 20, 24) },
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
  await page.getByRole("button", { name: /Mover “.*” para cima/ }).last().click();
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
});

const landing: { id: string } = { id: "" };

test("B · category landing: three subthemes from real collections, an internal one without a false 'Ver todos', the wrong region refused, drafts 404, and a showcase link that goes to it", async ({ page }) => {
  // The internal collection must be enabled in the Library first (this does not touch INK).
  await open(page, "/admin/colecoes?q=fe+de+origem");
  await page.locator("table.a-table tbody tr", { hasText: "Fé de Origem" }).getByRole("button", { name: "Habilitar" }).click();
  await expect(flash(page, /habilitada para uso no CMS/)).toBeVisible();

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

const model: { paiId: string; santiagoId: string; paiRef: string; santiagoRef: string } = { paiId: "", santiagoId: "", paiRef: "", santiagoRef: "" };

/** Picks a media option (the media table lists uploads as "name (w×h)") by part of its name. */
async function pickMedia(page: Page, selector: string, part: string) {
  const select = page.locator(selector);
  const texts = await select.locator("option").allTextContents();
  const wanted = texts.find((t) => t.includes(part));
  expect(wanted, `media option containing ${part}`).toBeTruthy();
  await select.selectOption({ label: wanted! });
}

test("C · model 'Pai Paranaense' (4 lines, up to 6): mockup, first fixed card 1 + 5, public page with validation, request in the queue", async ({ page }) => {
  await open(page, "/admin/personalizacao");
  const create = page.locator("section[aria-labelledby=novo]");
  await create.getByLabel("Nome").fill("Pai Paranaense");
  await pickCollection(page, create, "fe de origem", /Fé de Origem/);
  await create.getByRole("button", { name: "Criar rascunho" }).click();
  await expect(page).toHaveURL(/\/admin\/personalizacao\/cz-[0-9a-f]+/);
  model.paiId = page.url().split("/personalizacao/")[1].split("?")[0];
  await hydrated(page);

  await pickMedia(page, "#mockup_image", "mockup-pai");
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

  // The public personalization page: 4 initial lines, up to 6, validation and an honest confirmation.
  await page.goto("/sul/personalizar/pai-paranaense", { waitUntil: "domcontentloaded", timeout: 300_000 });
  await hydrated(page);
  await expect(page.getByText("Imagem ilustrativa", { exact: false })).toBeVisible();
  for (const [i, text] of ["PAI", "PARANAENSE", "CHURRASQUEIRO", "LENDA"].entries()) await expect(page.getByLabel(`Linha ${i + 1}`, { exact: true })).toHaveValue(text);
  await expect(page.getByLabel("Linha 5", { exact: true })).toHaveCount(0);
  const add = page.getByRole("button", { name: /Adicionar linha/ });
  await add.click();
  await add.click();
  await expect(add).toBeDisabled(); // 6 is the model's ceiling
  await page.getByLabel("Linha 5", { exact: true }).fill("DE SANGUE");
  await page.getByLabel("Linha 6", { exact: true }).fill("E FÉ");
  await expect(page.getByRole("heading", { name: "Resumo da sua personalização" })).toBeVisible();

  await page.getByLabel("Linha 1", { exact: true }).fill("<b>PAI</b>");
  await page.getByRole("button", { name: "Enviar solicitação de personalização" }).click();
  await expect(page.getByRole("alert").first()).toBeVisible(); // markup is not accepted
  await expect(page.getByTestId("customization-done")).toHaveCount(0);
  await page.getByLabel("Linha 1", { exact: true }).fill("PAI");
  await page.getByLabel("Linha 2", { exact: true }).fill("MUITO MAIS DO QUE DEZESSEIS CARACTERES");
  await page.getByRole("button", { name: "Enviar solicitação de personalização" }).click();
  await expect(page.getByRole("alert").first()).toBeVisible(); // over the model's own limit
  await page.getByLabel("Linha 2", { exact: true }).fill("PARANAENSE");
  await page.getByRole("button", { name: "Enviar solicitação de personalização" }).click();
  await expect(page.getByTestId("customization-done")).toBeVisible({ timeout: 60_000 });
  model.paiRef = (await page.getByTestId("customization-reference").innerText()).trim();
  expect(model.paiRef.length).toBeGreaterThan(20);
  await expect(page.getByTestId("customization-done")).toContainText("não acompanha automaticamente uma compra");
  await expect(page.getByTestId("customization-done")).toContainText("E FÉ");

  // The operator finds it in the queue, with model, version and region.
  await open(page, "/admin/personalizacao/solicitacoes");
  const row = page.locator("table.a-table tbody tr", { hasText: "Pai Paranaense" }).first();
  await expect(row).toContainText("v1");
  await expect(row).toContainText("Sul");
  await row.getByRole("link", { name: "Abrir" }).click();
  await expect(page.getByRole("heading", { name: "O que o cliente pediu" })).toBeVisible();
  await expect(page.getByText("Linha 6")).toBeVisible();
  await expect(page.getByText("E FÉ")).toBeVisible();
});

test("D · model 'Lá de Santiago': city, optional locality and caption; labels and version travel with the request; a later edit never rewrites it", async ({ page }) => {
  await open(page, "/admin/personalizacao");
  const create = page.locator("section[aria-labelledby=novo]");
  await create.getByLabel("Nome").fill("Lá de Santiago");
  await pickCollection(page, create, "personalizados", /Personalizados/);
  await create.getByRole("button", { name: "Criar rascunho" }).click();
  await expect(page).toHaveURL(/\/admin\/personalizacao\/cz-[0-9a-f]+/);
  model.santiagoId = page.url().split("/personalizacao/")[1].split("?")[0];
  await hydrated(page);

  await pickMedia(page, "#mockup_image", "mockup-santiago");
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

  await page.goto("/sul/personalizar/la-de-santiago", { waitUntil: "domcontentloaded", timeout: 300_000 });
  await hydrated(page);
  await expect(page.getByLabel(/^Cidade/)).toBeVisible();
  await expect(page.getByLabel(/^Localidade/)).toBeVisible();
  await expect(page.getByLabel(/^Legenda/)).toBeVisible();
  await expect(page.getByLabel(/^Linha 1/)).toHaveCount(0); // no line group in this model
  await page.getByRole("button", { name: "Enviar solicitação de personalização" }).click();
  await expect(page.getByRole("alert").first()).toBeVisible(); // the city is required
  await page.getByLabel(/^Cidade/).fill("Santiago");
  await page.getByLabel(/^Legenda/).fill("Terra dos poetas");
  await page.getByRole("button", { name: "Enviar solicitação de personalização" }).click();
  await expect(page.getByTestId("customization-done")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("customization-done")).toContainText("Santiago");
  await expect(page.getByTestId("customization-done")).not.toContainText("Localidade"); // the empty optional one is left out
  model.santiagoRef = (await page.getByTestId("customization-reference").innerText()).trim();

  // The model changes (v2): the label of the city field is renamed and republished.
  await open(page, `/admin/personalizacao/${model.santiagoId}`);
  await page.locator("#f-label-0").fill("Cidade do coração");
  await page.getByRole("button", { name: "Salvar rascunho" }).click();
  await expect(flash(page, /Modelo salvo no rascunho/)).toBeVisible();
  await page.getByRole("button", { name: /Publicar página no sandbox local/ }).click();
  await expect(flash(page, /Modelo publicado/)).toBeVisible({ timeout: 300_000 });
  await page.goto("/sul/personalizar/la-de-santiago", { waitUntil: "domcontentloaded", timeout: 300_000 });
  await expect(page.getByLabel(/^Cidade do coração/)).toBeVisible();

  // The request made before still shows the original label and the original version.
  await open(page, "/admin/personalizacao/solicitacoes");
  const row = page.locator("table.a-table tbody tr", { hasText: "Lá de Santiago" }).first();
  await expect(row).toContainText("v1");
  await row.getByRole("link", { name: "Abrir" }).click();
  await expect(page.locator("dt", { hasText: /^Cidade$/ })).toBeVisible();
  await expect(page.getByText("Cidade do coração")).toHaveCount(0);
  await expect(page.getByText("Terra dos poetas")).toBeVisible();
});

test("E · operation: manual link to a fictitious INK order, status changes, a restore never rewrites requests, honest copy, nothing leaks", async ({ page }) => {
  await open(page, "/admin/personalizacao/solicitacoes");
  await page.locator("table.a-table tbody tr", { hasText: "Lá de Santiago" }).first().getByRole("link", { name: "Abrir" }).click();
  await hydrated(page);

  // No confirmation box, no link.
  await page.locator("#order").fill("INK-90001");
  await page.getByRole("button", { name: "Vincular pedido" }).click();
  await expect(page.getByText(/Marque a confirmação/)).toBeVisible();
  await page.locator("#order").fill("INK 90001!");
  await page.getByLabel(/Conferi este número/).check();
  await page.getByRole("button", { name: "Vincular pedido" }).click();
  await expect(page.getByText(/Número de pedido inválido/)).toBeVisible();
  await page.locator("#order").fill("INK-90001");
  await page.getByLabel(/Conferi este número/).check();
  await page.getByRole("button", { name: "Vincular pedido" }).click();
  await expect(flash(page, /Vinculada ao pedido INK-90001.*a INK não recebeu a personalização/)).toBeVisible();

  // The same order cannot be claimed by another request.
  await open(page, "/admin/personalizacao/solicitacoes");
  await page.locator("table.a-table tbody tr", { hasText: "Pai Paranaense" }).first().getByRole("link", { name: "Abrir" }).click();
  await hydrated(page);
  await page.locator("#order").fill("INK-90001");
  await page.getByLabel(/Conferi este número/).check();
  await page.getByRole("button", { name: "Vincular pedido" }).click();
  await expect(page.getByRole("status").locator(".a-flash.err")).toBeVisible();

  // A status change on the Pai request.
  await page.locator("#status").selectOption({ index: 0 });
  await page.locator("#note").fill("conferido pela equipe");
  await page.getByRole("button", { name: "Atualizar estado" }).click();
  await expect(flash(page, /Estado atualizado/)).toBeVisible();

  // The queue shows both, with the linked order only on the first.
  await open(page, "/admin/personalizacao/solicitacoes");
  await expect(page.locator("table.a-table tbody tr", { hasText: "Lá de Santiago" }).first()).toContainText("INK-90001");
  await expect(page.locator("table.a-table tbody tr", { hasText: "Pai Paranaense" }).first()).not.toContainText("INK-90001");

  // Restore the model to its first version: the old request keeps the labels it was made with.
  await open(page, `/admin/personalizacao/${model.santiagoId}`);
  await page.getByRole("button", { name: "Restaurar esta versão" }).first().click();
  await expect(flash(page, /restaurada como nova publicação/)).toBeVisible({ timeout: 300_000 });
  await page.goto("/sul/personalizar/la-de-santiago", { waitUntil: "domcontentloaded", timeout: 300_000 });
  await expect(page.getByLabel(/^Cidade/).first()).toBeVisible();
  await open(page, "/admin/personalizacao/solicitacoes");
  await page.locator("table.a-table tbody tr", { hasText: "Lá de Santiago" }).first().getByRole("link", { name: "Abrir" }).click();
  await expect(page.locator("dt", { hasText: /^Cidade$/ })).toBeVisible();
  await expect(page.getByTestId("linked-order")).toHaveText("INK-90001");

  // The public page never presents personalization as travelling with an INK purchase, and never links a checkout.
  const html = await publicHtml(page, "/sul/personalizar/pai-paranaense");
  expect(html).toContain("noindex");
  expect(html).not.toMatch(/checkout|carrinho/i);
  expect(html).not.toMatch(/enviad[ao] (para|à) (a )?INK|segue com (a )?sua compra/i);

  // Private surfaces: an unknown reference is a 404 (no enumeration), another region has no such model, drafts never render.
  expect(await status(page, "/sul/personalizar/solicitacao/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA")).toBe(404);
  expect(await status(page, "/norte/personalizar/la-de-santiago")).toBe(404);
  expect(await status(page, "/centro-oeste/personalizar/pai-paranaense")).toBe(404);
  const own = await page.request.get(`/sul/personalizar/solicitacao/${model.paiRef}`, { timeout: 300_000 });
  expect(own.status()).toBe(200);
  expect(own.headers()["cache-control"]).toMatch(/no-store|no-cache|private/); // dev says no-cache; `next start` adds private, no-store
  expect(own.headers()["referrer-policy"] ?? (await own.text())).toMatch(/no-referrer/);
});

test("F · captures: one 375 px and one desktop view of each new page type, and the mobile request confirmation (CAPTURE=1)", async ({ browser }) => {
  test.skip(!process.env.CAPTURE, "captures are produced on demand");
  const dir = "docs/screenshots/2026-09-26-hotpages";
  const shots: Array<[string, string]> = [["hotpage", "/sul/h/dia-dos-pais"], ["categoria", "/sul/colecoes/pais"], ["personalizar-pai", "/sul/personalizar/pai-paranaense"], ["personalizar-santiago", "/sul/personalizar/la-de-santiago"]];
  for (const [name, path] of shots) {
    for (const [label, width, height] of [["375", 375, 900], ["desktop", 1280, 900]] as const) {
      const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, baseURL: test.info().project.use.baseURL as string });
      const page = await context.newPage();
      await page.goto(path, { waitUntil: "networkidle", timeout: 300_000 });
      await page.evaluate(() => document.fonts?.ready);
      await page.screenshot({ path: `${dir}/${name}-${label}.png`, fullPage: label === "375" });
      await context.close();
    }
  }
  const context = await browser.newContext({ viewport: { width: 375, height: 900 }, baseURL: test.info().project.use.baseURL as string });
  const page = await context.newPage();
  await page.goto("/sul/personalizar/pai-paranaense", { waitUntil: "networkidle", timeout: 300_000 });
  await hydrated(page);
  const add = page.getByRole("button", { name: /Adicionar linha/ });
  await add.click();
  await add.click();
  await page.getByLabel("Linha 5", { exact: true }).fill("DE SANGUE");
  await page.getByLabel("Linha 6", { exact: true }).fill("E FÉ");
  await page.getByRole("button", { name: "Enviar solicitação de personalização" }).click();
  await expect(page.getByTestId("customization-done")).toBeVisible({ timeout: 60_000 });
  await page.screenshot({ path: `${dir}/solicitacao-375.png`, fullPage: true });
  await context.close();
});
