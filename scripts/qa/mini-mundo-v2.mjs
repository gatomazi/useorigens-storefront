// QA da v2 do "Meu Pequeno Mundo" (identidade e contexto das cidades) num navegador real (Chromium do Playwright, WebGL em software).
// Usage: node scripts/qa/mini-mundo-v2.mjs <outDir> [baseUrl]
//   baseUrl: a prévia servida na pasta do protótipo (padrão http://127.0.0.1:4321/meu-pequeno-mundo-use-origens.html), com `npm run mundo:dados` feito.
// Salva capturas (desktop 1440×900 e celular 375×812), os PNGs exportados com e sem lembrança e resultado-v2.json.
import { chromium, devices } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const [outDir, base = "http://127.0.0.1:4321/meu-pequeno-mundo-use-origens.html"] = process.argv.slice(2);
if (!outDir) throw new Error("uso: node scripts/qa/mini-mundo-v2.mjs <outDir> [baseUrl]");
mkdirSync(outDir, { recursive: true });

const PILOTO = { novaTrento: "4211504", tijucas: "4218004", garopaba: "4205704" };
const browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--ignore-gpu-blocklist"] });
const resultado = { base, quando: new Date().toISOString(), checagens: [], consoleErros: [] };
const checar = (nome, ok, detalhe = "") => {
  resultado.checagens.push({ nome, ok: !!ok, detalhe });
  console.log(`${ok ? "OK  " : "FALHOU"} ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
};
const VIEWPORTS = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  mobile: { ...devices["iPhone 13"], viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 },
};
async function novaPagina(vp, extra = {}) {
  const ctx = await browser.newContext({ ...VIEWPORTS[vp], locale: "pt-BR", acceptDownloads: true, ...extra });
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: new URL(base).origin });
  const page = await ctx.newPage();
  page.on("console", (m) => { if (m.type() === "error") resultado.consoleErros.push(`[${vp}] ${m.text()}`); });
  page.on("pageerror", (e) => resultado.consoleErros.push(`[${vp}] pageerror: ${e.message}`));
  return { ctx, page };
}
const cenaPronta = (page) => page.waitForFunction(() => document.getElementById("status-cena").hidden, null, { timeout: 30000 });
const foto = (page, nome) => page.screenshot({ path: path.join(outDir, `${nome}.png`) });
const modo = (page) => page.evaluate(() => document.getElementById("app").dataset.modo);
const semOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const urlMundo = (p) => `${base}?mundo=1${Object.entries(p).map(([k, v]) => `&${k}=${encodeURIComponent(v)}`).join("")}`;
async function alvosPequenos(page) {
  return page.evaluate(() => {
    const ruins = [];
    for (const n of document.querySelectorAll("button, a[href], input, [role=option], summary, label.incluir")) {
      if (n.closest("[hidden]") || n.closest(".oculta") || n.classList.contains("oculta")) continue;
      const r = n.getBoundingClientRect();
      if (!r.width || !r.height || r.bottom < 0 || r.top > innerHeight) continue;
      const e = getComputedStyle(n);
      if (e.visibility === "hidden" || e.display === "none") continue;
      if (n.type === "checkbox") continue; // o alvo é o rótulo inteiro (label.incluir)
      if (r.height < 44 || r.width < 44) ruins.push(`${n.tagName.toLowerCase()}#${n.id || ""} ${Math.round(r.width)}×${Math.round(r.height)} "${(n.textContent || n.getAttribute("aria-label") || "").trim().slice(0, 30)}"`);
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
}
const conecta = (page) => page.$$eval("#conecta-lista li", (lis) => lis.map((l) => l.textContent.replace(/\s+/g, " ").trim()));
const pontosVisiveis = (page) => page.$$eval(".ponto-descoberta:not(.oculta)", (bs) => bs.map((b) => `${b.dataset.id}|${b.dataset.ref}`));
const palavras = (t) => t.trim().split(/\s+/).filter(Boolean).length;
async function baixar(page, seletor, nome) {
  const [d] = await Promise.all([page.waitForEvent("download", { timeout: 60000 }), page.click(seletor)]);
  const destino = path.join(outDir, `${nome}.png`);
  await d.saveAs(destino);
  const png = readFileSync(destino); // cabeçalho IHDR: largura e altura em big-endian
  const dim = png.toString("ascii", 12, 16) === "IHDR" ? [png.readUInt32BE(16), png.readUInt32BE(20)] : null;
  return { destino, dim };
}

// ---------------------------------------------------------------- fluxo do piloto, por tamanho de tela
for (const vp of ["desktop", "mobile"]) {
  const { ctx, page } = await novaPagina(vp);
  await page.goto(base);
  await cenaPronta(page);
  await page.waitForTimeout(4000);
  checar(`[${vp}] entrada com a prévia dos três perfis`, (await modo(page)) === "intro");
  await foto(page, `${vp}-01-entrada`);

  // montagem com lembrança na origem
  await page.click("#btn-comecar");
  await buscarEEscolher(page, "nova trento", "Nova Trento · SC");
  await page.waitForTimeout(3500);
  await page.fill("#lembranca-montar", "Onde cresci, perto do santuário");
  await page.waitForTimeout(600);
  const contador = await page.textContent("[data-lembranca=montar] .contador");
  checar(`[${vp}] lembrança opcional na escolha, com contador`, contador.trim() === "31/80", contador);
  await foto(page, `${vp}-02-origem-com-lembranca`);
  await page.click("#btn-avancar");
  await buscarEEscolher(page, "tijucas", "Tijucas · SC");
  await page.waitForTimeout(3200);
  await page.click("#btn-avancar");
  await buscarEEscolher(page, "garopaba", "Garopaba · SC");
  await page.waitForTimeout(3200);
  await page.click("#btn-avancar");
  await page.waitForTimeout(4500);
  checar(`[${vp}] mundo com as três cidades do piloto`, (await page.$$("#lista-lugares .lugar")).length === 3);
  await foto(page, `${vp}-03-mundo-piloto`);
  checar(`[${vp}] sem rolagem horizontal no resultado`, await semOverflow(page));
  const pequenosMundo = await alvosPequenos(page);
  checar(`[${vp}] áreas de toque ≥ 44 px no resultado`, pequenosMundo.length === 0, pequenosMundo.join("; "));

  // pontos de descoberta: dois por ilha
  const pontos = await pontosVisiveis(page);
  checar(`[${vp}] dois pontos de descoberta em cada ilha do piloto`, Object.values(PILOTO).every((id) => pontos.filter((p) => p.startsWith(`${id}|`)).length === 2), pontos.join(", "));

  // o que conecta
  const linhas = await conecta(page);
  checar(`[${vp}] o que conecta: lugares e estado`, linhas.some((l) => l.includes("Três lugares em Santa Catarina")), linhas[0]);
  checar(`[${vp}] o que conecta: paisagens dos perfis`, linhas.some((l) => /vale/.test(l) && /rio/.test(l) && /litoral/.test(l)), linhas[1]);
  checar(`[${vp}] o que conecta: distância origem–presente em linha reta`, linhas.some((l) => /aproximadamente 30 km em linha reta/.test(l) && /Não é distância por estrada/.test(l)), linhas[2]);

  // lembrança no resultado; incluir desligado por padrão: nem URL nem imagem
  const naLista = await page.textContent("#lista-lugares li:nth-child(1) .lugar");
  checar(`[${vp}] lembrança aparece na lista do resultado`, naLista.includes("“Onde cresci, perto do santuário”"));
  checar(`[${vp}] escolha "incluir lembranças" visível e desligada`, !(await page.$eval("#incluir", (n) => n.hidden)) && !(await page.isChecked("#incluir-lembrancas")));
  checar(`[${vp}] sem incluir: a lembrança fica fora do link`, !/[?&]l[opc]=/.test(page.url()), page.url());

  // descoberta: toque no ponto do santuário
  await page.click(`.ponto-descoberta[data-ref="santuario-santa-paulina"]`);
  await page.waitForTimeout(1300);
  const titulo1 = await page.textContent("#balao-titulo");
  checar(`[${vp}] descoberta do santuário abre o balão certo`, titulo1 === "Santuário Santa Paulina" && !(await page.$eval("#balao", (n) => n.hidden)), titulo1);
  await foto(page, `${vp}-04-descoberta-santuario`);
  // o balão aberto pode cobrir o outro ponto (no celular, sempre): aciona o botão do ponto direto para testar a regra de uma por vez
  await page.$eval(`.ponto-descoberta[data-ref="casarao-gallotti"]`, (b) => b.click());
  await page.waitForTimeout(1000);
  const balões = await page.$$eval(".balao:not([hidden])", (b) => b.length);
  checar(`[${vp}] uma descoberta aberta por vez`, balões === 1 && (await page.textContent("#balao-titulo")) === "Casarão Gallotti");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  checar(`[${vp}] Esc fecha a descoberta`, await page.$eval("#balao", (n) => n.hidden));

  // fichas das três cidades
  const especifico = { "Nova Trento": /Santa Paulina/, Tijucas: /Gallotti/, Garopaba: /Siriú/ };
  for (const [k, nome] of [[1, "Nova Trento"], [2, "Tijucas"], [3, "Garopaba"]]) {
    await page.click(`#lista-lugares li:nth-child(${k}) .lugar`);
    await page.waitForSelector("#cidade-produtos a.produto", { timeout: 20000 });
    await page.waitForTimeout(2600);
    const f = await page.evaluate(() => ({
      nome: document.getElementById("cidade-nome").textContent,
      papel: [...document.querySelectorAll("#cidade-papeis li")].map((l) => l.textContent).join(" · "),
      frase: document.getElementById("cidade-frase").textContent,
      resumo: document.getElementById("cidade-resumo").textContent,
      refs: [...document.querySelectorAll("#cidade-referencias .referencia")].map((r) => r.querySelector(".ref-titulo").textContent),
      cta: document.getElementById("cidade-cta").getAttribute("href"),
      ctaTexto: document.getElementById("cidade-cta").textContent,
      ctaVisivel: (() => { const r = document.getElementById("cidade-cta").getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; })(),
      produtos: document.querySelectorAll("#cidade-produtos a.produto").length,
      dados: [...document.querySelectorAll("#cidade-dados dt")].map((d) => `${d.textContent}: ${d.nextElementSibling.firstChild.textContent}`),
      fontes: [...document.querySelectorAll("#cidade-fontes-lista a")].map((a) => a.href),
      texto: document.getElementById("painel-cidade").textContent,
    }));
    checar(`[${vp}] ficha ${nome}: cidade · UF e papel`, f.nome === `${nome} · SC` && f.papel.length > 0, `${f.nome} — ${f.papel}`);
    checar(`[${vp}] ficha ${nome}: frase e resumo de 40–70 palavras`, f.frase.length > 20 && palavras(f.resumo) >= 40 && palavras(f.resumo) <= 70, `${palavras(f.resumo)} palavras`);
    checar(`[${vp}] ficha ${nome}: até três referências`, f.refs.length >= 1 && f.refs.length <= 3, f.refs.join(" | "));
    checar(`[${vp}] ficha ${nome}: conteúdo desta cidade`, especifico[nome].test(f.texto) && Object.entries(especifico).every(([outra, re]) => outra === nome || !re.test(f.refs.join(" "))));
    checar(`[${vp}] ficha ${nome}: "Ver camisetas" visível sem rolar e com link real`, f.ctaVisivel && f.ctaTexto === `Ver camisetas de ${nome}` && /^https:\/\/www\.useorigens\.com\.br\/sul\/sc\//.test(f.cta), f.cta);
    checar(`[${vp}] ficha ${nome}: camisetas do catálogo`, f.produtos > 0, `${f.produtos} camisetas`);
    checar(`[${vp}] ficha ${nome}: mais sobre com dados datados`, ["Gentílico", "População", "Área territorial", "Sede municipal", "Divisão regional atual"].every((c) => f.dados.some((d) => d.startsWith(c))), f.dados.join(" | "));
    checar(`[${vp}] ficha ${nome}: fontes com links`, f.fontes.length >= 3 && f.fontes.every((u) => u.startsWith("https://")), `${f.fontes.length} fontes`);
    if (k === 1) {
      await foto(page, `${vp}-05-ficha-${nome.toLowerCase().replace(" ", "-")}`);
      const pequenos = await alvosPequenos(page);
      checar(`[${vp}] áreas de toque ≥ 44 px na ficha`, pequenos.length === 0, pequenos.join("; "));
      // seções recolhidas abertas, para a evidência
      await page.click("#cidade-mais summary");
      await page.click("#cidade-fontes summary");
      await page.$eval("#cidade-mais", (d) => d.scrollIntoView({ block: "start" }));
      await page.waitForTimeout(500);
      await foto(page, `${vp}-06-ficha-${nome.toLowerCase().replace(" ", "-")}-mais-e-fontes`);
      // "Ver na maquete" (teclado/leitor de tela) abre a mesma descoberta
      await page.$eval("#ref-santuario-santa-paulina", (n) => n.scrollIntoView({ block: "center" }));
      await page.click("#ref-santuario-santa-paulina .ref-acao");
      await page.waitForTimeout(1200);
      const foco = await page.evaluate(() => document.activeElement?.id);
      checar(`[${vp}] "Ver na maquete" na ficha abre a descoberta e leva o foco`, (await page.textContent("#balao-titulo")) === "Santuário Santa Paulina" && foco === "balao-titulo", foco);
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);
    } else await foto(page, `${vp}-05-ficha-${nome.toLowerCase().replace(" ", "-")}`);
    await page.click("#btn-fechar-cidade");
    await page.waitForTimeout(1500);
  }

  // imagem: sem lembrança, depois com lembrança
  const sem = await baixar(page, "#btn-baixar", `${vp}-07-exportado-sem-lembranca`);
  checar(`[${vp}] PNG 1080 × 1350 sem lembrança`, sem.dim?.[0] === 1080 && sem.dim?.[1] === 1350, String(sem.dim));
  await page.click("#incluir");
  await page.waitForTimeout(600);
  checar(`[${vp}] incluir: a lembrança entra no link (lo)`, /[?&]lo=Onde\+cresci%2C\+perto\+do\+santu%C3%A1rio/.test(page.url()) || /[?&]lo=Onde/.test(page.url()), page.url());
  const com = await baixar(page, "#btn-baixar", `${vp}-08-exportado-com-lembranca`);
  checar(`[${vp}] PNG 1080 × 1350 com lembrança`, com.dim?.[0] === 1080 && com.dim?.[1] === 1350, String(com.dim));
  await page.click("#btn-link");
  await page.waitForTimeout(400);
  const copiado = await page.evaluate(() => navigator.clipboard.readText().catch(() => ""));
  checar(`[${vp}] link copiado leva a lembrança só quando incluída`, /[?&]lo=/.test(copiado) && !/[?&]l[pc]=/.test(copiado), copiado);
  await foto(page, `${vp}-09-mundo-com-lembranca-incluida`);

  // recarregar restaura lembrança e escolha
  await page.reload();
  await cenaPronta(page);
  await page.waitForTimeout(3500);
  checar(`[${vp}] recarregar mantém lembrança e "incluir"`, (await page.textContent("#lista-lugares li:nth-child(1) .lugar")).includes("Onde cresci") && (await page.isChecked("#incluir-lembrancas")));
  await page.click("#incluir");
  await page.waitForTimeout(400);
  checar(`[${vp}] desligar "incluir" tira a lembrança do link`, !/[?&]l[opc]=/.test(page.url()));
  if (vp === "desktop") {
    const memo = [];
    for (let ciclo = 0; ciclo < 2; ciclo++) {
      for (const [termo, nome] of [["bage", "Bagé · RS"], ["tijucas", "Tijucas · SC"], ["garopaba", "Garopaba · SC"], ["nova trento", "Nova Trento · SC"]]) {
        await page.click("#btn-editar");
        await page.click("#passos li:nth-child(1) button");
        await page.click("#btn-trocar");
        await buscarEEscolher(page, termo, nome);
        await page.waitForTimeout(1800);
        await page.click("#btn-ver-mundo");
        await page.waitForTimeout(2200);
      }
      memo.push(await page.evaluate(() => window.__meuPequenoMundo.memoria()));
    }
    checar("trocas repetidas entre perfis não acumulam GPU nem cena", JSON.stringify(memo[0]) === JSON.stringify(memo[1]), memo.map((m) => JSON.stringify(m)).join(" · "));
  }
  await ctx.close();
}

// ---------------------------------------------------------------- casos de borda
{
  const { ctx, page } = await novaPagina("mobile");
  // mesma cidade em origem e presente
  await page.goto(urlMundo({ origem: PILOTO.tijucas, presente: PILOTO.tijucas, coracao: PILOTO.garopaba }));
  await cenaPronta(page);
  await page.waitForTimeout(3500);
  const l1 = await conecta(page);
  checar("mesma cidade em origem e presente: frase curta, sem 0 km", l1.some((l) => l.includes("são a mesma cidade")) && !l1.some((l) => /\b0 km/.test(l)), l1.join(" | "));
  checar("mesma cidade: uma ilha e uma lista com dois lugares", (await page.$$("#lista-lugares .lugar")).length === 2);
  await foto(page, "mobile-10-mesma-cidade");
  // uma cidade só
  await page.goto(urlMundo({ origem: PILOTO.garopaba }));
  await page.waitForTimeout(3500);
  const l2 = await conecta(page);
  checar("uma cidade: conclui e o que conecta não inventa distância", (await modo(page)) === "mundo" && l2.length >= 1 && !l2.some((l) => /km/.test(l)), l2.join(" | "));
  await foto(page, "mobile-11-uma-cidade");
  // cidade sem perfil
  await page.goto(urlMundo({ origem: "4301602", presente: "4106902" }));
  await page.waitForTimeout(3500);
  const l3 = await conecta(page);
  checar("cidades sem perfil: distância a partir das sedes do IBGE", l3.some((l) => /aproximadamente [\d.]+ km em linha reta/.test(l)), l3.join(" | "));
  await page.click("#lista-lugares li:nth-child(1) .lugar");
  await page.waitForSelector("#cidade-produtos a.produto", { timeout: 20000 });
  await page.waitForTimeout(2000);
  const semPerfil = await page.evaluate(() => ({
    aviso: !document.getElementById("cidade-sem-texto").hidden,
    refs: !document.getElementById("cidade-referencias-secao").hidden,
    dados: [...document.querySelectorAll("#cidade-dados dt")].map((d) => d.textContent),
    paisagem: document.getElementById("cidade-paisagem").textContent,
    pontos: document.querySelectorAll(".ponto-descoberta:not(.oculta)").length,
  }));
  checar("cidade sem perfil: ficha com dados do IBGE e camisetas, sem campos vazios", semPerfil.aviso && !semPerfil.refs && semPerfil.dados.includes("Sede municipal") && !semPerfil.dados.includes("População"), semPerfil.dados.join(", "));
  checar("cidade sem perfil: cenário identificado como ilustrativo", /ilustrativ/i.test(semPerfil.paisagem), semPerfil.paisagem);
  checar("cidade sem perfil: nenhum ponto de descoberta", semPerfil.pontos === 0);
  await foto(page, "mobile-12-ficha-sem-perfil");
  // coordenada ausente (Região Administrativa criada depois de 2022)
  await page.goto(urlMundo({ origem: "4301602", presente: "df-ra:arapoanga" }));
  await page.waitForTimeout(3500);
  const l4 = await conecta(page);
  checar("sem coordenada: a distância é omitida", (await modo(page)) === "mundo" && !l4.some((l) => /km/.test(l)), l4.join(" | "));
  // lembranças no link: válidas, longas demais, com controle
  await page.goto(urlMundo({ origem: PILOTO.novaTrento, presente: PILOTO.tijucas, lo: "Minha família mora aqui ❤", lp: "x".repeat(500), lc: "sem lugar" }));
  await page.waitForTimeout(3500);
  const memLink = await page.$$eval("#lista-lugares .lugar-lembranca", (ns) => ns.map((n) => n.textContent));
  checar("link com lembrança: acentos e emoji preservados; texto longo demais e sem lugar ignorados", memLink.length === 1 && memLink[0] === "“Minha família mora aqui ❤”", memLink.join(" | "));
  checar("link com lembrança: 'incluir' vem ligado", await page.isChecked("#incluir-lembrancas"));
  await page.goto(urlMundo({ origem: PILOTO.novaTrento, lo: "<img src=x onerror=alert(1)>" }));
  await page.waitForTimeout(3000);
  const injetado = await page.evaluate(() => ({ img: document.querySelectorAll("#lista-lugares img:not([src^='data:'])").length, texto: document.querySelector("#lista-lugares .lugar-lembranca")?.textContent }));
  checar("lembrança vinda do link é texto, nunca HTML", injetado.img === 0 && injetado.texto === "“<img src=x onerror=alert(1)>”", injetado.texto);
  await ctx.close();
}
{
  // compatibilidade: link e progresso da v1
  const { ctx, page } = await novaPagina("desktop");
  await page.goto(urlMundo({ origem: "4205407", presente: "5208707", coracao: "1302603" }));
  await cenaPronta(page);
  await page.waitForTimeout(3500);
  checar("link da versão anterior abre o mundo", (await modo(page)) === "mundo" && (await page.$$("#lista-lugares .lugar")).length === 3);
  await page.evaluate(() => localStorage.setItem("useorigens:meu-pequeno-mundo", JSON.stringify({ v: 1, papeis: { origem: "4211504", presente: "4218004", coracao: null }, passo: 2, concluido: true, em: "2026-10-13T12:00:00.000Z" })));
  await page.goto(base);
  await cenaPronta(page);
  await page.waitForTimeout(3500);
  checar("progresso salvo na versão anterior (v1) é restaurado", (await modo(page)) === "mundo" && (await page.$$("#lista-lugares .lugar")).length === 2);
  // qualquer ação que salva (aqui: editar e voltar ao mundo) regrava o progresso no formato novo
  await page.click("#btn-editar");
  await page.click("#btn-ver-mundo");
  await page.waitForTimeout(1500);
  const salvo = await page.evaluate(() => JSON.parse(localStorage.getItem("useorigens:meu-pequeno-mundo")));
  checar("ao salvar de novo, o progresso passa para o formato v2", salvo?.v === 2 && salvo.papeis.origem === "4211504", `v${salvo?.v}`);
  // recomeçar apaga lembranças
  await page.fill("#lembranca-ficha", "teste").catch(() => {});
  await page.click("#btn-recomecar");
  await page.click("#btn-recomecar-confirmar");
  await page.waitForTimeout(800);
  checar("começar de novo apaga lugares e lembranças", await page.evaluate(() => localStorage.getItem("useorigens:meu-pequeno-mundo") === null));
  await ctx.close();
}
{
  // movimento reduzido: tudo funciona sem animação
  const { ctx, page } = await novaPagina("desktop", { reducedMotion: "reduce" });
  await page.goto(urlMundo({ origem: PILOTO.novaTrento, presente: PILOTO.tijucas, coracao: PILOTO.garopaba }));
  await cenaPronta(page);
  await page.waitForTimeout(2500);
  await page.click(`.ponto-descoberta[data-ref="baleia-franca"]`);
  await page.waitForTimeout(600);
  checar("movimento reduzido: descoberta abre e se posiciona", !(await page.$eval("#balao", (n) => n.hidden)) && (await page.$eval("#balao", (n) => n.style.transform)) !== "translate3d(-9999px, -9999px, 0px)");
  await foto(page, "desktop-10-movimento-reduzido-baleia");
  await ctx.close();
}

await browser.close();
const ok = resultado.checagens.filter((c) => c.ok).length;
writeFileSync(path.join(outDir, "resultado-v2.json"), JSON.stringify(resultado, null, 2));
console.log(`\n${ok}/${resultado.checagens.length} checagens ok; erros de console: ${resultado.consoleErros.length}`);
for (const e of resultado.consoleErros) console.log("  " + e);
