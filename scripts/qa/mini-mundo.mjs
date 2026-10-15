// QA do protótipo "Meu Pequeno Mundo" (prototipos/meu-pequeno-mundo/) num navegador real (Chromium do Playwright).
// Usage: node scripts/qa/mini-mundo.mjs <outDir> [baseUrl]
//   baseUrl: a prévia servida por um servidor estático na pasta do protótipo (padrão http://127.0.0.1:4321/meu-pequeno-mundo-use-origens.html)
// Percorre os critérios de aceite em 1440×900 e 375×812, salva capturas, o PNG exportado pela própria página e um resumo em resultado.json.
// WebGL roda em software (SwiftShader) no Chromium sem tela: as animações ficam mais lentas que num aparelho, por isso as esperas são generosas.
import { chromium, devices } from "@playwright/test";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const [outDir, base = "http://127.0.0.1:4321/meu-pequeno-mundo-use-origens.html"] = process.argv.slice(2);
if (!outDir) throw new Error("uso: node scripts/qa/mini-mundo.mjs <outDir> [baseUrl]");
mkdirSync(outDir, { recursive: true });
const arquivoLocal = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../prototipos/meu-pequeno-mundo/meu-pequeno-mundo-use-origens.html");

const browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--ignore-gpu-blocklist"] });
const resultado = { base, quando: new Date().toISOString(), checagens: [], consoleErros: [], consoleErrosEsperados: [] };
// Erros de console contam só nos fluxos principais; nos testes de falha (sem WebGL, CDN bloqueado) o próprio navegador registra o recurso que falhou.
let fase = "principal";
const checar = (nome, ok, detalhe = "") => {
  resultado.checagens.push({ nome, ok: !!ok, detalhe });
  console.log(`${ok ? "OK  " : "FALHOU"} ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
};

const VIEWPORTS = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  mobile: { ...devices["iPhone 13"], viewport: { width: 375, height: 812 } },
};

async function novaPagina(nomeVp, extra = {}) {
  const ctx = await browser.newContext({ ...VIEWPORTS[nomeVp], locale: "pt-BR", acceptDownloads: true, ...extra });
  const page = await ctx.newPage();
  const lista = () => (fase === "principal" ? resultado.consoleErros : resultado.consoleErrosEsperados);
  page.on("console", (m) => {
    if (m.type() === "error") lista().push(`[${nomeVp}] ${m.text()}`);
  });
  page.on("pageerror", (e) => resultado.consoleErros.push(`[${nomeVp}] pageerror: ${e.message}`));
  return { ctx, page };
}
const cenaPronta = (page) => page.waitForFunction(() => document.getElementById("status-cena").hidden, null, { timeout: 30000 });
const modo = (page) => page.evaluate(() => document.getElementById("app").dataset.modo);
const foto = (page, nome) => page.screenshot({ path: path.join(outDir, `${nome}.png`) });
const etiquetasVisiveis = (page) =>
  page.evaluate(() => [...document.querySelectorAll(".etiqueta:not(.oculta)")].map((b) => b.textContent.trim()));
const semOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
async function alvosPequenos(page) {
  return page.evaluate(() => {
    const ruins = [];
    for (const n of document.querySelectorAll("button, a[href], input, [role=option]")) {
      if (n.closest("[hidden]") || n.closest(".oculta")) continue;
      const r = n.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      const estilo = getComputedStyle(n);
      if (estilo.visibility === "hidden" || estilo.display === "none") continue;
      if (r.height < 44 || r.width < 44) ruins.push(`${n.tagName.toLowerCase()}#${n.id || ""}.${n.className || ""} ${Math.round(r.width)}×${Math.round(r.height)} "${(n.textContent || n.getAttribute("aria-label") || "").trim().slice(0, 30)}"`);
    }
    return ruins;
  });
}
async function buscarEEscolher(page, termo, esperado) {
  await page.fill("#busca-campo", termo);
  await page.waitForSelector("#busca-lista [role=option]");
  const opcoes = await page.$$eval("#busca-lista [role=option] .res-nome", (ns) => ns.map((n) => n.textContent));
  const k = opcoes.findIndex((o) => o === esperado);
  if (k < 0) throw new Error(`"${esperado}" não apareceu na busca por "${termo}": ${opcoes.join(", ")}`);
  await page.click(`#opcao-${k}`);
  return opcoes;
}

// No celular, Baixar, Copiar link, Editar e Começar de novo ficam em "Detalhes" (o resultado começa compacto): abre antes de clicar.
async function noMundo(page, seletor) {
  const fechado = await page.$eval("#btn-detalhes", (b) => getComputedStyle(b).display !== "none" && b.getAttribute("aria-expanded") === "false").catch(() => false);
  if (fechado && (await page.$(`#detalhes-mundo ${seletor}`))) { await page.click("#btn-detalhes"); await page.waitForTimeout(300); }
  await page.click(seletor);
}

// ---------------------------------------------------------------- fluxo completo, por tamanho de tela
for (const vp of ["mobile", "desktop"]) {
  const { ctx, page } = await novaPagina(vp);
  await page.goto(base);
  await cenaPronta(page);
  await page.waitForTimeout(3500);
  checar(`[${vp}] entrada abre com a prévia animada`, (await modo(page)) === "intro");
  await foto(page, `${vp}-01-entrada`);
  checar(`[${vp}] sem rolagem horizontal na entrada`, await semOverflow(page));

  // 1. busca e primeira ilha
  await page.click("#btn-comecar");
  await page.fill("#busca-campo", "floria");
  await page.waitForSelector("#busca-lista [role=option]");
  const primeiros = await page.$$eval("#busca-lista .res-nome", (ns) => ns.map((n) => n.textContent));
  checar(`[${vp}] busca mostra "Cidade · UF"`, primeiros.includes("Florianópolis · SC"), primeiros.slice(0, 3).join(" | "));
  await foto(page, `${vp}-02-busca`);
  await page.fill("#busca-campo", "xyzxyz");
  await page.waitForTimeout(200);
  const vazio = await page.textContent("#busca-status");
  checar(`[${vp}] busca sem resultado explica`, /Nenhuma cidade encontrada/.test(vazio), vazio.trim());
  await page.fill("#busca-campo", "");
  await buscarEEscolher(page, "floria", "Florianópolis · SC");
  await page.waitForTimeout(3500);
  checar(`[${vp}] primeira ilha construída`, (await etiquetasVisiveis(page)).length === 1, (await etiquetasVisiveis(page)).join(" | "));
  await foto(page, `${vp}-03-primeira-ilha`);

  // 2. mesmo lugar em dois papéis
  checar(`[${vp}] oferece adicionar onde vive hoje`, (await page.textContent("#btn-avancar")).includes("onde vivo hoje"));
  await page.click("#btn-avancar");
  await page.click("#atalhos .chip");
  await page.waitForTimeout(1500);
  const deDois = await etiquetasVisiveis(page);
  checar(`[${vp}] mesma cidade em dois papéis = uma ilha`, deDois.length === 1 && /Origem · Presente/.test(deDois[0]), deDois.join(" | "));
  await foto(page, `${vp}-04-mesma-cidade`);

  // 3. lugar do coração e conclusão com 2 ilhas
  await page.click("#btn-avancar");
  await buscarEEscolher(page, "manaus", "Manaus · AM");
  await page.waitForTimeout(3500);
  await page.click("#btn-avancar");
  await page.waitForTimeout(2500);
  checar(`[${vp}] conclui com duas ilhas`, (await modo(page)) === "mundo" && (await page.$$("#lista-lugares .lugar")).length === 2);
  await foto(page, `${vp}-05-mundo-2-lugares`);

  // 4. troca de cidade (presente: Florianópolis → Goiânia) = três ilhas
  await noMundo(page, "#btn-editar");
  await page.click("#passos li:nth-child(2) button");
  await page.click("#btn-trocar");
  await buscarEEscolher(page, "goiania", "Goiânia · GO");
  await page.waitForTimeout(3500);
  await page.click("#btn-ver-mundo");
  await page.waitForTimeout(3500);
  const tres = await page.$$eval("#lista-lugares .lugar-conhecer", (ns) => ns.map((n) => n.getAttribute("aria-label")));
  checar(`[${vp}] troca atualiza o mundo (três lugares)`, tres.length === 3, tres.join(" | "));
  const etqTres = await etiquetasVisiveis(page);
  checar(`[${vp}] três etiquetas sobre as ilhas`, etqTres.length === 3, etqTres.join(" | "));
  await foto(page, `${vp}-06-mundo-3-lugares`);
  checar(`[${vp}] sem rolagem horizontal no resultado`, await semOverflow(page));
  const pequenos = await alvosPequenos(page);
  checar(`[${vp}] áreas de toque ≥ 44 px no resultado`, pequenos.length === 0, pequenos.join("; "));

  // 5. painel da cidade com camisetas reais
  await page.click("#lista-lugares li:nth-child(1) .lugar-conhecer");
  await page.waitForSelector("#cidade-produtos .produto:not(.esqueleto)", { timeout: 15000 });
  await page.waitForTimeout(2500);
  const cta = await page.getAttribute("#cidade-cta", "href");
  const produtos = await page.$$eval("#cidade-produtos a.produto", (as) => as.map((a) => ({ href: a.href, nome: a.querySelector(".produto-nome").textContent, img: a.querySelector("img")?.src })));
  checar(`[${vp}] painel da cidade: CTA para a página real`, cta === "https://www.useorigens.com.br/sul/sc/florianopolis", cta);
  checar(`[${vp}] painel da cidade: camisetas com links reais`, produtos.length > 0 && produtos.every((p) => p.href.startsWith("https://www.useorigens.com.br/sul/sc/florianopolis/")), `${produtos.length} produtos`);
  resultado.produtosFlorianopolis = produtos;
  await foto(page, `${vp}-07-cidade`);
  const pequenosCidade = await alvosPequenos(page);
  checar(`[${vp}] áreas de toque ≥ 44 px no painel da cidade`, pequenosCidade.length === 0, pequenosCidade.join("; "));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(1500);
  checar(`[${vp}] Esc fecha o painel da cidade`, await page.isHidden("#painel-cidade"));

  // 5b. tocar numa etiqueta abre a cidade
  const etq = await page.$(".etiqueta:not(.oculta)");
  if (etq) {
    await etq.click();
    await page.waitForTimeout(1200);
    checar(`[${vp}] tocar na placa abre o painel`, await page.isVisible("#painel-cidade"));
    await page.click("#btn-fechar-cidade");
    await page.waitForTimeout(1500);
  }

  // 6. exportação (download) e compartilhamento sem suporte nativo
  const [download] = await Promise.all([page.waitForEvent("download", { timeout: 30000 }), noMundo(page, "#btn-baixar")]);
  const png = path.join(outDir, `${vp}-mundo-exportado.png`);
  await download.saveAs(png);
  const cabecalho = readFileSync(png);
  const largura = cabecalho.readUInt32BE(16), altura = cabecalho.readUInt32BE(20);
  checar(`[${vp}] PNG exportado em 1080 × 1350`, largura === 1080 && altura === 1350, `${largura}×${altura}, ${download.suggestedFilename()}`);
  await page.click("#btn-compartilhar");
  await page.waitForTimeout(1200);
  const dialogo = await page.isVisible("#dlg-compartilhar");
  checar(`[${vp}] sem compartilhamento nativo: oferece baixar`, dialogo || (await page.evaluate(() => !!navigator.canShare)), dialogo ? "diálogo aberto" : "canShare existe");
  if (dialogo) { await foto(page, `${vp}-08-compartilhar-sem-suporte`); await page.click("#dlg-fechar"); }

  // 7. restauração ao recarregar
  const urlMundo = page.url();
  await page.reload();
  await cenaPronta(page);
  await page.waitForTimeout(3500);
  checar(`[${vp}] recarregar restaura o mundo`, (await modo(page)) === "mundo" && (await page.$$("#lista-lugares .lugar")).length === 3);
  checar(`[${vp}] URL tem versão e IDs`, /mundo=1&origem=4205407&presente=5208707&coracao=1302603/.test(urlMundo), urlMundo);

  // 7b. progresso no meio da construção também volta
  await noMundo(page, "#btn-editar");
  await page.click("#passos li:nth-child(3) button");
  await page.reload();
  await cenaPronta(page);
  await page.waitForTimeout(1500);
  checar(`[${vp}] recarregar no meio da construção volta ao passo`, (await modo(page)) === "montar" && (await page.textContent("#pergunta")) === "Qual lugar você leva consigo?");
  await page.click("#btn-avancar");
  await page.waitForTimeout(800);

  // 8. abrir o link num navegador sem nada salvo
  const outro = await novaPagina(vp);
  await outro.page.goto(urlMundo);
  await cenaPronta(outro.page);
  await outro.page.waitForTimeout(4000);
  checar(`[${vp}] link reconstrói o mundo`, (await modo(outro.page)) === "mundo" && (await outro.page.$$("#lista-lugares .lugar")).length === 3);
  await foto(outro.page, `${vp}-09-aberto-por-link`);
  await outro.ctx.close();

  // 9. remover e recomeçar (com confirmação)
  await noMundo(page, "#btn-editar");
  await page.click("#passos li:nth-child(3) button");
  await page.click("#btn-remover");
  await page.waitForTimeout(2000);
  checar(`[${vp}] remover tira a ilha`, (await etiquetasVisiveis(page)).length === 2, (await etiquetasVisiveis(page)).join(" | "));
  await page.click("#btn-pular"); // etapa 3 vazia: "Pular e ver meu mundo" (texto, sem botão cheio que destaque pular)
  await page.waitForTimeout(1500);
  await noMundo(page, "#btn-recomecar");
  checar(`[${vp}] recomeçar pede confirmação`, await page.isVisible("#dlg-recomecar"));
  await page.click("#btn-recomecar-cancelar");
  checar(`[${vp}] cancelar mantém o mundo`, (await page.$$("#lista-lugares .lugar")).length === 2);
  await noMundo(page, "#btn-recomecar");
  await page.click("#btn-recomecar-confirmar");
  await page.waitForTimeout(1500);
  checar(`[${vp}] confirmar apaga e volta à primeira pergunta`, (await modo(page)) === "montar" && (await etiquetasVisiveis(page)).length === 0);
  await page.reload();
  await cenaPronta(page);
  checar(`[${vp}] depois de recomeçar, recarregar abre a entrada`, (await modo(page)) === "intro");
  await ctx.close();
}

// ---------------------------------------------------------------- um mundo de três cidades, para as capturas do relatório
for (const vp of ["mobile", "desktop"]) {
  const { ctx, page } = await novaPagina(vp);
  await page.goto(`${base}?mundo=1&origem=4301602&presente=4106902&coracao=1501402`);
  await cenaPronta(page);
  await page.waitForTimeout(5000);
  await foto(page, `${vp}-10-tres-cidades-bage-curitiba-belem`);
  await page.click("#lista-lugares li:nth-child(3) .lugar-conhecer");
  await page.waitForSelector("#cidade-produtos .produto:not(.esqueleto)", { timeout: 15000 });
  await page.waitForTimeout(3000);
  await foto(page, `${vp}-11-cidade-belem`);
  await ctx.close();
}

// ---------------------------------------------------------------- nomes longos (e uma Região Administrativa, que cai no cenário regional ilustrativo)
{
  const { ctx, page } = await novaPagina("mobile");
  await page.goto(`${base}?mundo=1&origem=5105507&presente=4215687&coracao=df-ra%3Asol-nascente-por-do-sol`);
  await cenaPronta(page);
  await page.waitForTimeout(5000);
  await foto(page, "mobile-18-nomes-longos");
  checar("nomes longos sem rolagem horizontal", await semOverflow(page));
  await page.click("#lista-lugares li:nth-child(3) .lugar-conhecer");
  await page.waitForTimeout(1500);
  const paisagem = await page.textContent("#cidade-paisagem");
  checar("lugar sem curadoria mostra 'Cenário ilustrativo'", /^Cenário ilustrativo/.test(paisagem), paisagem);
  await page.click("#btn-fechar-cidade");
  await page.waitForTimeout(800);
  const [download] = await Promise.all([page.waitForEvent("download", { timeout: 30000 }), noMundo(page, "#btn-baixar")]);
  await download.saveAs(path.join(outDir, "mobile-nomes-longos-exportado.png"));
  checar("nomes longos: PNG exportado", true);
  await ctx.close();
}

// ---------------------------------------------------------------- trocas repetidas não acumulam geometrias, texturas nem objetos
// Um ciclo de aquecimento sobe para a GPU as geometrias compartilhadas (uma por tipo de árvore/construção, criadas uma vez só);
// depois, o mesmo ciclo repetido tem de terminar exatamente com a mesma memória.
{
  const { ctx, page } = await novaPagina("desktop");
  await page.goto(`${base}?mundo=1&origem=4301602&presente=4106902&coracao=1501402`);
  await cenaPronta(page);
  await page.waitForTimeout(4000);
  const memoria = () => page.evaluate(() => window.__meuPequenoMundo.memoria());
  const inicio = await memoria();
  async function ciclo() {
    await noMundo(page, "#btn-editar");
    await page.click("#passos li:nth-child(2) button");
    for (const [termo, nome] of [["manaus", "Manaus · AM"], ["goiania", "Goiânia · GO"], ["cuiab", "Cuiabá · MT"], ["joinville", "Joinville · SC"], ["palmas", "Palmas · TO"], ["curitiba", "Curitiba · PR"]]) {
      await page.click("#btn-trocar");
      await buscarEEscolher(page, termo, nome);
      await page.waitForTimeout(2200);
    }
    await page.click("#passos li:nth-child(3) button");
    await page.click("#btn-remover");
    await page.waitForTimeout(1500);
    await buscarEEscolher(page, "belem", "Belém · PA");
    await page.waitForTimeout(3500);
    await page.click("#btn-avancar");
    await page.waitForTimeout(3000);
  }
  await ciclo();
  const antes = await memoria();
  await ciclo();
  const depois = await memoria();
  resultado.memoria = { inicio, antes, depois };
  checar(
    "o mesmo ciclo de 6 trocas + 1 remoção, repetido, não acumula nada na GPU nem na cena",
    depois.ilhas === 3 && depois.geometrias === antes.geometrias && depois.texturas === antes.texturas && depois.objetos === antes.objetos && depois.objetos === inicio.objetos && depois.animacoes === 0,
    `início ${JSON.stringify(inicio)} · após 1º ciclo ${JSON.stringify(antes)} · após 2º ciclo ${JSON.stringify(depois)}`,
  );
  await ctx.close();
}

// ---------------------------------------------------------------- links inválidos
{
  const { ctx, page } = await novaPagina("mobile");
  const casos = [
    ["desconhecida", "?mundo=1&origem=9999999&presente=4205407", /Não encontramos/],
    ["versao", "?mundo=7&origem=4205407", /formato que não reconhecemos/],
    ["formato", "?mundo=1&origem=%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E", /Não encontramos|não tem lugares/],
    ["vazio", "?mundo=1", /não tem lugares/],
  ];
  for (const [nome, qs, padrao] of casos) {
    await page.goto(base + qs);
    await page.waitForTimeout(2500);
    const aviso = (await page.textContent("#aviso-montar").catch(() => "")) + (await page.textContent("#aviso-mundo").catch(() => ""));
    const injetado = await page.evaluate(() => !!document.querySelector("#app img[src='x']"));
    checar(`link inválido (${nome}) mostra aviso e não quebra`, padrao.test(aviso) && !injetado, aviso.trim().slice(0, 120));
    if (nome === "desconhecida") {
      const pergunta = await page.textContent("#pergunta");
      checar("cidade desconhecida leva a escolher de novo o papel certo", pergunta === "Onde sua história começou?" && (await etiquetasVisiveis(page)).length === 1, pergunta);
      await foto(page, "mobile-12-link-cidade-desconhecida");
    }
  }
  await ctx.close();
}

// ---------------------------------------------------------------- compartilhamento nativo (simulado): arquivo PNG e cancelamento
{
  const { ctx, page } = await novaPagina("mobile");
  await page.addInitScript(() => {
    window.__compartilhado = [];
    navigator.canShare = (d) => !!d?.files?.length;
    navigator.share = async (d) => {
      window.__compartilhado.push({ nome: d.files[0].name, tipo: d.files[0].type, tamanho: d.files[0].size, texto: d.text });
      if (window.__cancelar) throw new DOMException("cancelado", "AbortError");
    };
  });
  await page.goto(`${base}?mundo=1&origem=4205407&coracao=1302603`);
  await cenaPronta(page);
  await page.waitForTimeout(5000);
  await page.click("#btn-compartilhar");
  await page.waitForTimeout(2500);
  const env = await page.evaluate(() => window.__compartilhado);
  checar("compartilhamento nativo recebe o PNG", env.length === 1 && env[0].tipo === "image/png" && env[0].nome === "meu-pequeno-mundo-use-origens.png", JSON.stringify(env[0] ?? {}));
  await page.evaluate(() => { window.__cancelar = true; });
  await page.click("#btn-compartilhar");
  await page.waitForTimeout(1500);
  checar("cancelar a janela nativa mantém o resultado", (await modo(page)) === "mundo" && !(await page.isVisible("#dlg-compartilhar")));
  await ctx.close();
}

// ---------------------------------------------------------------- copiar o link e diferenciar toque de arrasto na maquete
{
  const { ctx, page } = await novaPagina("desktop", { permissions: ["clipboard-read", "clipboard-write"] });
  await page.goto(`${base}?mundo=1&origem=4205407&coracao=1302603`);
  await cenaPronta(page);
  await page.waitForTimeout(4500);
  await noMundo(page, "#btn-link");
  await page.waitForTimeout(400);
  const copiado = await page.evaluate(() => navigator.clipboard.readText());
  checar("copiar link coloca a URL do mundo na área de transferência", /\?mundo=1&origem=4205407&coracao=1302603$/.test(copiado), copiado);
  // um ponto da ilha: logo abaixo da etiqueta da primeira cidade
  const caixa = await page.locator(".etiqueta:not(.oculta)").first().boundingBox();
  const x = caixa.x + caixa.width / 2, y = caixa.y + caixa.height + 90;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 40, y + 5, { steps: 6 });
  await page.mouse.move(x + 120, y + 10, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(900);
  checar("arrastar gira a maquete sem abrir a cidade", await page.isHidden("#painel-cidade"));
  await page.click("#btn-visao-inicial");
  await page.waitForTimeout(1500);
  const caixa2 = await page.locator(".etiqueta:not(.oculta)").first().boundingBox();
  await page.mouse.click(caixa2.x + caixa2.width / 2, caixa2.y + caixa2.height + 90);
  await page.waitForTimeout(900);
  checar("tocar na ilha abre a cidade", await page.isVisible("#painel-cidade"), await page.textContent("#cidade-nome"));
  await ctx.close();
}

// ---------------------------------------------------------------- teclado e movimento reduzido
{
  const { ctx, page } = await novaPagina("desktop", { reducedMotion: "reduce" });
  await page.goto(`${base}?mundo=1&origem=4314902&presente=5300108&coracao=4209102`);
  await cenaPronta(page);
  await page.waitForTimeout(1500);
  await foto(page, "desktop-13-movimento-reduzido");
  await page.focus("#palco");
  for (const k of ["ArrowLeft", "ArrowLeft", "ArrowUp", "+", "Home"]) await page.keyboard.press(k);
  await page.keyboard.press("Tab");
  const focoTab = await page.evaluate(() => document.activeElement?.textContent?.trim().slice(0, 40));
  // percorre a lista de lugares e abre um pelo teclado
  await page.focus("#lista-lugares li:nth-child(2) .lugar-conhecer");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(800);
  const focoPainel = await page.evaluate(() => document.activeElement?.id);
  checar("teclado: Enter na lista abre a cidade e o foco vai para o nome", focoPainel === "cidade-nome", `${focoTab} → ${focoPainel}`);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
  const voltou = await page.evaluate(() => document.activeElement?.closest?.(".lugar")?.dataset.id);
  checar("teclado: Esc devolve o foco ao lugar da lista", voltou === "5300108", String(voltou));
  // busca pelo teclado
  await noMundo(page, "#btn-editar");
  await page.click("#btn-trocar");
  await page.keyboard.type("cuiab");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(800);
  checar("teclado: setas e Enter escolhem na busca", (await page.textContent("#escolha-nome")) === "Cuiabá · MT");
  await foto(page, "desktop-14-teclado-busca");
  await ctx.close();
}

// ---------------------------------------------------------------- sem WebGL e sem a dependência 3D
fase = "falhas";
{
  const { ctx, page } = await novaPagina("mobile");
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (tipo, ...resto) {
      return /webgl/i.test(tipo) ? null : original.call(this, tipo, ...resto);
    };
  });
  await page.goto(`${base}?mundo=1&origem=4205407&coracao=1302603`);
  await page.waitForTimeout(3000);
  const estatico = await page.isVisible("#estatico");
  const cartoes = await page.$$("#estatico-lista button");
  checar("sem WebGL: apresentação estática com os lugares", estatico && cartoes.length === 2);
  await page.click("#lista-lugares li:nth-child(1) .lugar-conhecer");
  await page.waitForSelector("#cidade-produtos .produto:not(.esqueleto)", { timeout: 15000 });
  checar("sem WebGL: camisetas continuam acessíveis", (await page.$$("#cidade-produtos a.produto")).length > 0);
  await foto(page, "mobile-15-sem-webgl");
  await page.click("#btn-fechar-cidade");
  const [download] = await Promise.all([page.waitForEvent("download", { timeout: 20000 }), noMundo(page, "#btn-baixar")]);
  await download.saveAs(path.join(outDir, "mobile-sem-webgl-exportado.png"));
  checar("sem WebGL: imagem ainda é gerada", true, download.suggestedFilename());
  await ctx.close();
}
{
  const { ctx, page } = await novaPagina("mobile");
  await page.route("**/three@0.186.1/**", (r) => r.abort());
  await page.goto(base);
  await page.waitForTimeout(3000);
  const aviso = await page.textContent("#estatico-aviso");
  checar("falha ao carregar o Three.js mostra aviso", /Não foi possível carregar a maquete 3D/.test(aviso), aviso);
  await page.click("#btn-comecar");
  await buscarEEscolher(page, "bage", "Bagé · RS");
  checar("falha do 3D não impede escolher", (await page.textContent("#escolha-nome")) === "Bagé · RS");
  await foto(page, "mobile-16-falha-cdn");
  await ctx.close();
}

// ---------------------------------------------------------------- arquivo aberto do disco: demonstração
{
  const { ctx, page } = await novaPagina("desktop");
  await page.goto("file://" + arquivoLocal);
  await cenaPronta(page);
  await page.click("#btn-comecar");
  await buscarEEscolher(page, "bel", "Belém · PA");
  await page.waitForTimeout(3000);
  await page.click("#btn-ver-mundo");
  await page.waitForTimeout(2500);
  checar("arquivo local: selo de demonstração", await page.isVisible("#selo-demo"));
  checar("arquivo local: copiar link desabilitado e explicado", (await page.isDisabled("#btn-link")) && (await page.isVisible("#nota-link")));
  await page.click("#lista-lugares li:nth-child(1) .lugar-conhecer");
  await page.waitForTimeout(1200);
  const txt = await page.textContent("#cidade-produtos");
  checar("arquivo local: 'Catálogo ainda não conectado' e CTA desabilitado", /Catálogo ainda não conectado/.test(txt) && (await page.getAttribute("#cidade-cta", "aria-disabled")) === "true");
  await foto(page, "desktop-17-demonstracao-arquivo-local");
  await page.click("#btn-fechar-cidade");
  const [download] = await Promise.all([page.waitForEvent("download", { timeout: 30000 }), noMundo(page, "#btn-baixar")]);
  await download.saveAs(path.join(outDir, "desktop-demonstracao-exportado.png"));
  checar("arquivo local: download da imagem funciona", true);
  await ctx.close();
}

await browser.close();
const falhas = resultado.checagens.filter((c) => !c.ok);
resultado.resumo = { total: resultado.checagens.length, falhas: falhas.length, consoleErros: resultado.consoleErros.length };
writeFileSync(path.join(outDir, "resultado.json"), JSON.stringify(resultado, null, 2));
console.log(`\n${resultado.checagens.length - falhas.length}/${resultado.checagens.length} checagens ok; erros de console: ${resultado.consoleErros.length}`);
for (const e of resultado.consoleErros) console.log("  console:", e);
process.exitCode = falhas.length || resultado.consoleErros.length ? 1 : 0;
