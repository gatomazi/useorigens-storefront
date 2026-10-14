/**
 * Meu Pequeno Mundo — estado, interface, exportação e inicialização (seções 4, 6, 7 e 8 do protótipo). O ponto de entrada é
 * `iniciarMundo(opcoes)`, chamado depois que a marcação (MundoMarkup) está no DOM: pela página /meu-pequeno-mundo da loja ou pelo
 * protótipo independente. Textos vindos de dados, do link ou da pessoa entram sempre por textContent/atributos, nunca como HTML.
 */
import { AMBIENTES, CATALOGO, CONTEXTO, ESTADOS, FONTES, PAISAGENS, PAPEIS, REGIOES, TEXTOS, paisagemDe } from './config.js';
import { ID_VALIDO, adaptadorCatalogo, adaptadorDemonstracao, arredondarKm, contexto, distanciaKm, normalizar } from './dados.js';
import { TAU, criarCena } from './cena.js';

/** Opções da página que hospeda a experiência (ver iniciarMundo). */
const OPCOES = {
  registrar: () => {}, // telemetria: (evento, campos) — só campos fechados, nunca texto da pessoa
  entrada: null, // de onde a pessoa chegou: 'home' | 'cidade' | 'rodape' | 'link' | null
  cidadeSugerida: null, // id do catálogo vindo da página de uma cidade (?cidade=…), só uma sugestão
  carregarThree: null, // () => Promise<{ THREE, OrbitControls, mergeGeometries }>; padrão: import() dos módulos
  // true (protótipo independente): o endereço acompanha o mundo, como na v1. false (loja): a barra fica limpa — o mundo vive no
  // armazenamento local (ou na sessão, quando veio por link) e o link completo só existe ao copiar/compartilhar. Assim nenhuma
  // ferramenta que capture a URL da página (analytics) leva o mundo ou as lembranças.
  urlNaBarra: true,
  lojaHref: null, // para onde a marca leva (a loja de onde a pessoa veio); null mantém o link da marcação
  consulta: null, // a consulta com que a página abriu (a loja limpa a barra antes de carregar qualquer analytics); null: location.search
};
const consultaInicial = () => OPCOES.consulta ?? location.search;
/** Parâmetros de chegada (contexto de entrada, nunca parte do mundo): saem da barra assim que lidos. */
const ENTRADA = { parametros: ['entrada', 'cidade', 'loja'], origens: ['home', 'cidade', 'rodape'], lojas: ['sul', 'norte', 'centro-oeste'] };
const CHAVE_LINK_SESSAO = 'useorigens:meu-pequeno-mundo:link';
/* ==========================================================================
   4. ESTADO — papéis, passos, persistência local versionada e link do mundo.
   ========================================================================== */
// v2: guarda também as lembranças. O formato v1 continua sendo lido (progresso de quem montou o mundo antes).
const ARMAZENAMENTO = { chave: 'useorigens:meu-pequeno-mundo', versao: 2, aceitas: [1, 2] };
// O link segue na versão 1: as lembranças entram como parâmetros opcionais (lo, lp, lc), que um leitor antigo simplesmente ignora.
const LINK = { versao: '1', parametro: 'mundo', lembranca: { origem: 'lo', presente: 'lp', coracao: 'lc' }, maxBruto: 400 };

const estado = {
  modo: 'carregando', // carregando | intro | montar | mundo
  passo: 0,
  papeis: { origem: null, presente: null, coracao: null }, // id do lugar em cada papel
  cidadeAberta: null, // id do lugar com o painel aberto
  doLink: false, // mundo aberto por link: só passa a ser salvo quando a pessoa mexer nele
  salvarFalhou: false,
  lembrancas: {}, // id do lugar → texto da pessoa (uma por cidade, mesmo com vários papéis)
  incluirLembrancas: false, // a pessoa escolheu levar as lembranças para a imagem e o link
  descobertaAberta: null, // { id, referencia } do marco aberto na maquete
  detalhes: false, // no celular, o painel do resultado começa compacto
  sugestao: null, // id de um lugar sugerido pela página de onde a pessoa veio (?cidade=…): só entra no mundo por um toque dela
};

/** Lembrança: texto da pessoa, nunca HTML. Normaliza acentos, tira controles e marcas de direção, junta espaços e corta em 80 caracteres. */
function limparLembranca(valor) {
  if (typeof valor !== 'string') return '';
  const limpo = valor.normalize('NFC').replace(/[\p{Cc}\u200e\u200f\u202a-\u202e\u2066-\u2069\u2028\u2029]/gu, ' ').replace(/\s+/g, ' ').trim();
  return [...limpo].slice(0, TEXTOS.lembranca.limite).join('').trim();
}
/** As lembranças dos lugares que estão no mundo agora (as de lugares que saíram não são guardadas). */
function lembrancasDoMundo() {
  const saida = {};
  for (const p of PAPEIS) {
    const id = estado.papeis[p];
    if (id && estado.lembrancas[id]) saida[id] = estado.lembrancas[id];
  }
  return saida;
}
const temLembranca = () => Object.keys(lembrancasDoMundo()).length > 0;

/** Lugares únicos do mundo, na ordem da história. Uma cidade em dois papéis vira uma ilha só, com os dois papéis. */
function lugaresUnicos() {
  const porId = new Map();
  for (const papel of PAPEIS) {
    const id = estado.papeis[papel];
    if (!id) continue;
    const lugar = dados.lugar(id);
    if (!lugar) continue;
    if (!porId.has(id)) porId.set(id, { lugar, papeis: [] });
    porId.get(id).papeis.push(papel);
  }
  return [...porId.values()];
}

const temLugar = () => PAPEIS.some((p) => estado.papeis[p]);

function lerSalvo() {
  try {
    const bruto = localStorage.getItem(ARMAZENAMENTO.chave);
    if (!bruto) return null;
    const d = JSON.parse(bruto);
    if (!d || !ARMAZENAMENTO.aceitas.includes(d.v) || typeof d.papeis !== 'object' || d.papeis === null) return null;
    const papeis = {};
    for (const p of PAPEIS) papeis[p] = typeof d.papeis[p] === 'string' && ID_VALIDO.test(d.papeis[p]) ? d.papeis[p] : null;
    const passo = Number.isInteger(d.passo) && d.passo >= 0 && d.passo <= 2 ? d.passo : 0;
    const lembrancas = {};
    if (d.v >= 2 && d.lembrancas && typeof d.lembrancas === 'object') {
      for (const [id, txt] of Object.entries(d.lembrancas)) {
        const limpo = ID_VALIDO.test(id) ? limparLembranca(txt) : '';
        if (limpo) lembrancas[id] = limpo;
      }
    }
    return { papeis, passo, concluido: d.concluido === true, lembrancas, incluirLembrancas: d.incluirLembrancas === true };
  } catch {
    return null; // armazenamento bloqueado ou dado corrompido: segue sem ele
  }
}

function salvar() {
  if (estado.doLink) return;
  try {
    if (!temLugar()) {
      localStorage.removeItem(ARMAZENAMENTO.chave);
      return;
    }
    localStorage.setItem(
      ARMAZENAMENTO.chave,
      JSON.stringify({
        v: ARMAZENAMENTO.versao, papeis: estado.papeis, passo: estado.passo, concluido: estado.modo === 'mundo',
        lembrancas: lembrancasDoMundo(), incluirLembrancas: estado.incluirLembrancas, em: new Date().toISOString(),
      }),
    );
    estado.salvarFalhou = false;
  } catch {
    estado.salvarFalhou = true;
  }
}

function apagarSalvo() {
  try { localStorage.removeItem(ARMAZENAMENTO.chave); } catch { /* sem armazenamento: nada a apagar */ }
}

const linkDisponivel = () => location.protocol === 'https:' || location.protocol === 'http:';

/** Lê ?mundo=1&origem=…&presente=…&coracao=… sem confiar em nada: versão, formato de cada ID e, depois, existência no catálogo. */
function lerLink() {
  let params;
  try { params = new URLSearchParams(consultaInicial()); } catch { return { status: 'nenhum' }; }
  if (!params.has(LINK.parametro) && !OPCOES.urlNaBarra) {
    try { params = new URLSearchParams(sessionStorage.getItem(CHAVE_LINK_SESSAO) ?? ''); } catch { /* sem sessão: segue sem link */ }
  }
  if (!params.has(LINK.parametro)) return { status: 'nenhum' };
  if (params.get(LINK.parametro) !== LINK.versao) return { status: 'versao' };
  const papeis = { origem: null, presente: null, coracao: null };
  const invalidos = [];
  for (const p of PAPEIS) {
    const valor = params.get(p);
    if (valor === null || valor === '') continue;
    if (valor.length <= 70 && ID_VALIDO.test(valor)) papeis[p] = valor;
    else invalidos.push(p);
  }
  if (!PAPEIS.some((p) => papeis[p]) && invalidos.length === 0) return { status: 'vazio' };
  // lembranças: só as de um papel que veio com lugar válido; texto conferido como qualquer outro (tamanho, controles, 80 caracteres)
  const lembrancas = {};
  for (const p of PAPEIS) {
    const bruto = params.get(LINK.lembranca[p]);
    if (!bruto || !papeis[p] || bruto.length > LINK.maxBruto) continue;
    const limpo = limparLembranca(bruto);
    if (limpo && !lembrancas[papeis[p]]) lembrancas[papeis[p]] = limpo;
  }
  return { status: 'ok', papeis, invalidos, lembrancas };
}

function urlDoMundo({ comMundo = true } = {}) {
  const url = new URL(location.href);
  for (const k of [LINK.parametro, ...PAPEIS, ...Object.values(LINK.lembranca), ...ENTRADA.parametros]) url.searchParams.delete(k);
  url.hash = '';
  if (!comMundo || !temLugar()) return url.toString();
  url.searchParams.set(LINK.parametro, LINK.versao);
  for (const p of PAPEIS) if (estado.papeis[p]) url.searchParams.set(p, estado.papeis[p]);
  if (estado.incluirLembrancas) {
    const ja = new Set(); // a mesma cidade em dois papéis leva a lembrança uma vez só, no primeiro papel
    for (const p of PAPEIS) {
      const id = estado.papeis[p];
      if (!id || ja.has(id) || !estado.lembrancas[id]) continue;
      ja.add(id);
      url.searchParams.set(LINK.lembranca[p], estado.lembrancas[id]);
    }
  }
  return url.toString();
}

/** O endereço só carrega o mundo no resultado: durante a construção, recarregar volta ao passo salvo localmente. */
function sincronizarUrl() {
  if (!linkDisponivel() || estado.modo === 'carregando') return;
  if (!OPCOES.urlNaBarra) {
    // loja: a barra fica sem o mundo; o mundo aberto por link (ainda não editado) fica na sessão desta aba para recarregar
    try {
      if (estado.doLink && temLugar()) sessionStorage.setItem(CHAVE_LINK_SESSAO, new URL(urlDoMundo()).search);
      else sessionStorage.removeItem(CHAVE_LINK_SESSAO);
    } catch { /* sem sessão: recarregar volta ao progresso salvo */ }
  }
  const alvo = urlDoMundo({ comMundo: OPCOES.urlNaBarra && estado.modo === 'mundo' });
  if (alvo === location.href) return;
  try { history.replaceState(null, '', alvo); } catch { /* alguns ambientes bloqueiam replaceState: o link copiado continua certo */ }
}

/* ==========================================================================
   6. INTERFACE — painéis, busca, etiquetas sobre a maquete e acessibilidade.
   Texto vindo de dados ou do link entra sempre por textContent/atributos: nunca vira HTML.
   ========================================================================== */
const $ = (id) => document.getElementById(id);
const el = {
  app: $('app'), palco: $('palco'), canvas: $('cena'), etiquetas: $('etiquetas'), dica: $('dica-palco'),
  status: $('status-cena'), statusTexto: $('status-cena-texto'), estatico: $('estatico'), estaticoLista: $('estatico-lista'),
  estaticoAviso: $('estatico-aviso'), descricao: $('palco-descricao'), seloDemo: $('selo-demo'), camera: $('camera'),
  intro: $('painel-intro'), montar: $('painel-montar'), mundoP: $('painel-mundo'), cidade: $('painel-cidade'),
  btnComecar: $('btn-comecar'), passos: $('passos'), papelAtual: $('papel-atual'), pergunta: $('pergunta'),
  escolha: $('escolha'), escolhaSelo: $('escolha-selo'), escolhaNome: $('escolha-nome'), escolhaMeta: $('escolha-meta'),
  busca: $('busca'), campo: $('busca-campo'), lista: $('busca-lista'), buscaStatus: $('busca-status'), atalhos: $('atalhos'),
  btnVoltar: $('btn-voltar'), btnAvancar: $('btn-avancar'), btnVerMundo: $('btn-ver-mundo'), btnTrocar: $('btn-trocar'), btnRemover: $('btn-remover'),
  avisoMontar: $('aviso-montar'), avisoMundo: $('aviso-mundo'), mundoTitulo: $('mundo-titulo'), listaLugares: $('lista-lugares'),
  btnCompartilhar: $('btn-compartilhar'), btnBaixar: $('btn-baixar'), btnLink: $('btn-link'), notaLink: $('nota-link'), notaSalvar: $('nota-salvar'),
  btnEditar: $('btn-editar'), btnRecomecar: $('btn-recomecar'), btnDetalhes: $('btn-detalhes'), btnDetalhesTexto: $('btn-detalhes-texto'),
  btnPular: $('btn-pular'), acoesTexto: $('acoes-texto'), troca: $('troca'), trocaNome: $('troca-nome'), btnCancelarTroca: $('btn-cancelar-troca'),
  campoBusca: $('campo-busca'), btnVisaoInicial: $('btn-visao-inicial'),
  cidadePapeis: $('cidade-papeis'), cidadeNome: $('cidade-nome'), cidadeEstado: $('cidade-estado'), cidadePaisagem: $('cidade-paisagem'),
  cidadeCta: $('cidade-cta'), cidadeProdutos: $('cidade-produtos'), produtosTitulo: $('produtos-titulo'), btnFecharCidade: $('btn-fechar-cidade'),
  btnCidadeAnt: $('btn-cidade-ant'), btnCidadeProx: $('btn-cidade-prox'),
  dlgRecomecar: $('dlg-recomecar'), dlgCompartilhar: $('dlg-compartilhar'), toast: $('toast'),
  descobertas: $('descobertas'), balao: $('balao'), balaoTipo: $('balao-tipo'), balaoTitulo: $('balao-titulo'), balaoTexto: $('balao-texto'),
  balaoNota: $('balao-nota'), btnBalaoCidade: $('btn-balao-cidade'), btnFecharBalao: $('btn-fechar-balao'),
  cidadeFrase: $('cidade-frase'), cidadeResumo: $('cidade-resumo'), cidadeConheca: $('cidade-conheca'), cidadePaisagemPerfil: $('cidade-paisagem-perfil'),
  balaoCurto: $('balao-curto'), cidadeRefs: $('cidade-referencias'), cidadeDados: $('cidade-dados'), cidadeMais: $('cidade-mais'),
  cidadeFontes: $('cidade-fontes'), cidadeFontesLista: $('cidade-fontes-lista'), cidadeRevisao: $('cidade-revisao'),
  conecta: $('conecta'), conectaLista: $('conecta-lista'), incluir: $('incluir'), incluirCheck: $('incluir-lembrancas'),
  lembrancaMontar: $('lembranca-montar'), lembrancaFicha: $('lembranca-ficha'),
  sugestaoMontar: $('sugestao-montar'), sugestaoMundo: $('sugestao-mundo'), marca: document.querySelector('#app .marca'),
};

const reduzMQ = matchMedia('(prefers-reduced-motion: reduce)');
const largoMQ = matchMedia('(min-width: 900px)');
let mundo = null; // a cena 3D; null enquanto carrega ou sem WebGL
let dados = adaptadorDemonstracao();
let estadoDados = 'carregando'; // carregando | pronto | erro
let cenaFalhou = false;
estado.trocando = false;
estado.aviso = null;

function preencherTextos() {
  for (const n of document.querySelectorAll('[data-texto]')) {
    const valor = n.dataset.texto.split('.').reduce((o, k) => o?.[k], TEXTOS);
    if (typeof valor === 'string') n.textContent = valor;
  }
}

let toastTimer = 0;
function avisar(texto) {
  el.toast.textContent = texto;
  el.toast.classList.add('visivel');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.toast.classList.remove('visivel'), 2800);
}

const nomeComUf = (l) => `${l.n} · ${l.u}`;
const papeisDe = (id) => PAPEIS.filter((p) => estado.papeis[p] === id);
function metaLugar(l) {
  return l.t === 'ra' ? `${TEXTOS.busca.ra}` : `${ESTADOS[l.u]} · ${REGIOES[l.r].nome}`;
}

/* ----- cena: o que vai para a maquete ----- */
/** O que a cena recebe de cada lugar: só o perfil visual (nunca texto). Sem perfil, a paisagem da curadoria regional. */
function receitaDePerfil(perfil) {
  const v = perfil.visual;
  return { perfil: true, base: v.base, cores: v.cores, relevo: v.relevo, agua: v.agua, vegetacao: v.vegetacao, construcoes: v.construcoes, extras: v.extras, marcos: v.marcos };
}
function receitaDe(lugar) {
  const perfil = contexto.perfil(lugar.i);
  if (perfil && (perfil.visual.relevo || perfil.visual.agua || perfil.visual.marcos.length)) return receitaDePerfil(perfil);
  const p = paisagemDe(lugar);
  return { perfil: false, base: p.chave, agua: p.agua ? { modulo: p.agua } : null };
}
function itensDoMundo() {
  return lugaresUnicos().map(({ lugar, papeis }) => ({
    id: lugar.i, papeis, regiao: lugar.r, capital: lugar.c, receita: receitaDe(lugar), textoPlaca: lugar.n, subPlaca: lugar.u,
  }));
}
// A prévia da entrada mostra os três perfis do piloto (vale, rio e litoral); sem o contexto, as paisagens regionais de antes.
const PREVIA_PILOTO = ['4211504', '4218004', '4205704'];
function itensPrevia() {
  const pilotos = PREVIA_PILOTO.map((id) => contexto.perfil(id));
  const comPerfil = pilotos.every(Boolean);
  const legado = [
    { base: 'litoral', agua: { modulo: 'costa' } }, { base: 'cerrado', agua: { modulo: 'vereda' } }, { base: 'amazonia', agua: { modulo: 'rio-largo' } },
  ];
  return ['origem', 'presente', 'coracao'].map((papel, k) => ({
    id: `previa:${papel}`, papeis: [], regiao: ['sul', 'centro-oeste', 'norte'][k], capital: !comPerfil && k === 1,
    receita: comPerfil ? receitaDePerfil(pilotos[k]) : { perfil: false, ...legado[k] },
    textoPlaca: TEXTOS.cena.previa[papel], subPlaca: '',
  }));
}
function sincronizarCena({ animar = true } = {}) {
  if (!mundo) return;
  const intro = estado.modo === 'intro';
  const itens = intro ? itensPrevia() : estado.modo === 'carregando' ? [] : itensDoMundo();
  mundo.definirMundo(itens, { animar });
  mundo.definirMarcador(estado.modo === 'montar' && itens.length === 0);
  mundo.definirAutoGiro(intro);
}

/* ----- etiquetas sobre as ilhas (o leitor de tela usa a lista equivalente no painel) ----- */
const etiquetas = new Map();
function renderEtiquetas() {
  const lugares = estado.modo === 'montar' || estado.modo === 'mundo' ? lugaresUnicos() : [];
  const ids = new Set(lugares.map((l) => l.lugar.i));
  for (const [id, b] of etiquetas) if (!ids.has(id)) { b.remove(); etiquetas.delete(id); }
  for (const { lugar, papeis } of lugares) {
    let b = etiquetas.get(lugar.i);
    if (!b) {
      b = document.createElement('button');
      b.type = 'button';
      b.className = 'etiqueta';
      b.tabIndex = -1;
      b.append(Object.assign(document.createElement('span'), { className: 'etq-papel' }), Object.assign(document.createElement('span'), { className: 'etq-nome' }));
      b.addEventListener('click', () => aoTocar({ id: lugar.i, descoberta: null }));
      el.etiquetas.append(b);
      etiquetas.set(lugar.i, b);
    }
    b.style.setProperty('--cor-regiao', REGIOES[lugar.r].cor);
    b.children[0].textContent = papeis.map((p) => TEXTOS.papeis[p].curto).join(' · ');
    b.children[1].textContent = lugar.n;
    b.dataset.w = b.dataset.h = ''; // medidas refeitas no próximo quadro
  }
}
/** Retângulos das etiquetas no último quadro (os pontos de descoberta desviam deles). */
let retangulosEtiquetas = [];
/** Etiquetas sempre inteiras na tela e sem se cobrir: a caixa desliza (a seta continua apontando para a placa) e sobe se esbarrar noutra. */
function posicionarEtiquetas(projecoes) {
  const esconderTodas = estado.cidadeAberta !== null || estado.modo === 'intro';
  const largura = el.palco.clientWidth;
  const limiteTopo = largoMQ.matches ? 72 : 58; // abaixo do cabeçalho e dos botões da câmera
  const postas = [];
  const visiveis = [];
  retangulosEtiquetas = [];
  for (const p of projecoes) {
    const b = etiquetas.get(p.id);
    if (!b) continue;
    const oculta = esconderTodas || !p.visivel;
    b.classList.toggle('oculta', oculta);
    if (!oculta) visiveis.push([p, b]);
  }
  visiveis.sort((a, b) => b[0].y - a[0].y); // as de baixo (mais perto) ficam no lugar; as de cima cedem
  for (const [p, b] of visiveis) {
    if (!b.dataset.w) { b.dataset.w = String(b.offsetWidth); b.dataset.h = String(b.offsetHeight); }
    const w = Number(b.dataset.w), h = Number(b.dataset.h);
    const prender = (v) => Math.round(Math.min(Math.max(v, w / 2 + 6), largura - w / 2 - 6));
    const colide = (cx, b) => postas.find((r) => cx - w / 2 < r.dir + 4 && cx + w / 2 > r.esq - 4 && b - h < r.base + 4 && b > r.topo - 4);
    let x = prender(p.x);
    let base = Math.max(Math.round(p.y) - 8, limiteTopo + h); // borda de baixo da caixa
    for (let volta = 0; volta < 4; volta++) {
      const bate = colide(x, base);
      if (!bate) break;
      if (bate.topo - 6 - h >= limiteTopo) { base = bate.topo - 6; continue; } // sobe, se couber
      // não cabe em cima: desliza para o lado em que a placa está
      const centro = (bate.esq + bate.dir) / 2;
      x = prender(p.x >= centro ? bate.dir + 6 + w / 2 : bate.esq - 6 - w / 2);
    }
    postas.push({ esq: x - w / 2, dir: x + w / 2, topo: base - h, base });
    retangulosEtiquetas = postas;
    const seta = Math.round(Math.max(-(w / 2 - 14), Math.min(w / 2 - 14, p.x - x)));
    const chave = `${x},${base},${seta}`;
    if (b.dataset.pos === chave) continue;
    b.dataset.pos = chave;
    b.style.setProperty('--seta', `${seta}px`);
    b.style.transform = `translate3d(${x}px, ${base}px, 0) translate(-50%, -100%)`;
  }
}

/* ----- apresentação estática (sem WebGL) ----- */
function renderEstatico() {
  if (!cenaFalhou) return;
  el.estatico.hidden = estado.modo === 'carregando';
  el.estaticoLista.replaceChildren();
  if (estado.modo !== 'montar' && estado.modo !== 'mundo') return;
  for (const { lugar, papeis } of lugaresUnicos()) {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.style.setProperty('--cor-regiao', REGIOES[lugar.r].cor);
    const papel = Object.assign(document.createElement('span'), { className: 'etq-papel', textContent: papeis.map((p) => TEXTOS.papeis[p].rotulo).join(' · ') });
    papel.style.color = REGIOES[lugar.r].cor;
    b.append(papel, Object.assign(document.createElement('span'), { className: 'etq-nome', textContent: nomeComUf(lugar) }));
    b.addEventListener('click', () => aoTocar({ id: lugar.i, descoberta: null }));
    li.append(b);
    el.estaticoLista.append(li);
  }
}

/* ----- painel de construção ----- */
function renderMontar() {
  const papel = PAPEIS[estado.passo];
  const t = TEXTOS.papeis[papel];
  el.passos.replaceChildren(...PAPEIS.map((p, k) => {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    if (k === estado.passo) b.setAttribute('aria-current', 'step');
    const lugar = estado.papeis[p] && dados.lugar(estado.papeis[p]);
    const num = Object.assign(document.createElement('span'), { className: 'passo-num', textContent: `${k + 1} · ${TEXTOS.papeis[p].curto}` });
    const valor = Object.assign(document.createElement('span'), { className: `passo-valor${lugar ? '' : ' vazio'}`, textContent: lugar ? lugar.n : TEXTOS.montar.escolher });
    b.append(num, valor);
    b.setAttribute('aria-label', `Etapa ${k + 1}, ${TEXTOS.papeis[p].rotulo}: ${lugar ? nomeComUf(lugar) : 'sem cidade'}`);
    b.addEventListener('click', () => irParaPasso(k));
    li.append(b);
    return li;
  }));
  el.papelAtual.textContent = t.rotulo;
  el.pergunta.textContent = t.pergunta;

  const id = estado.papeis[papel];
  const lugar = id && dados.lugar(id);
  const mostrarEscolha = !!lugar && !estado.trocando;
  el.escolha.hidden = !mostrarEscolha;
  el.busca.hidden = mostrarEscolha;
  el.troca.hidden = !(estado.trocando && lugar);
  if (lugar) el.trocaNome.textContent = lugar.n;
  if (lugar) {
    el.escolhaSelo.src = REGIOES[lugar.r].selo;
    el.escolhaNome.textContent = nomeComUf(lugar);
    el.btnTrocar.setAttribute('aria-label', TEXTOS.montar.trocar(nomeComUf(lugar)));
    const outros = papeisDe(id).filter((p) => p !== papel).map((p) => TEXTOS.papeis[p].rotulo.toLowerCase());
    el.escolhaMeta.textContent = metaLugar(lugar) + (outros.length ? ` · também ${outros.join(' e ')}` : '');
    preencherLembranca(el.lembrancaMontar, id, papel);
  }
  renderAtalhos(papel);

  // Uma ação cheia só quando há escolha (seguir para a próxima etapa ou ver o mundo). Pular e "ver meu mundo" são texto,
  // com o mesmo peso em todas as etapas; durante a troca só o "Cancelar" da busca e o "Voltar".
  const escolhido = !!lugar && !estado.trocando;
  el.btnVoltar.textContent = TEXTOS.montar.voltar;
  el.btnAvancar.disabled = false;
  el.btnAvancar.classList.remove('m-btn-ghost');
  el.btnAvancar.hidden = !escolhido;
  el.btnAvancar.textContent = estado.passo < 2 ? t.proximo : TEXTOS.montar.verMundo;
  el.btnPular.hidden = escolhido || estado.trocando || (estado.passo === 2 && !temLugar());
  el.btnPular.textContent = estado.passo < 2 ? TEXTOS.montar.pular : TEXTOS.montar.pularVer;
  el.btnVerMundo.hidden = estado.trocando || !temLugar() || estado.passo === 2;
  renderAviso(el.avisoMontar);
  renderSugestao(el.sugestaoMontar);
  if (!el.busca.hidden) atualizarBusca();
}

function renderAtalhos(papel) {
  el.atalhos.replaceChildren();
  if (papel === 'origem') { el.atalhos.hidden = true; return; }
  const ja = lugaresUnicos().filter(({ lugar }) => estado.papeis[papel] !== lugar.i);
  if (!ja.length) { el.atalhos.hidden = true; return; }
  el.atalhos.hidden = false;
  const rotulo = Object.assign(document.createElement('span'), { className: 'nota', textContent: TEXTOS.montar.atalhosTitulo });
  rotulo.style.cssText = 'flex-basis:100%;margin:0';
  el.atalhos.append(rotulo);
  for (const { lugar } of ja) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'm-chip';
    b.textContent = papel === 'presente' && estado.papeis.origem === lugar.i ? TEXTOS.papeis.presente.mesmo(lugar.n) : TEXTOS.papeis[papel].mesmo?.(lugar.n) ?? lugar.n;
    b.setAttribute('aria-label', `${TEXTOS.papeis[papel].rotulo}: ${nomeComUf(lugar)}, que já está no seu mundo`);
    b.addEventListener('click', () => escolher(lugar.i));
    el.atalhos.append(b);
  }
}

/* ----- sugestão vinda da página de uma cidade: a pessoa escolhe o papel (ou "Agora não"); nada muda sem esse toque ----- */
function renderSugestao(alvo) {
  const lugar = estado.sugestao && dados.lugar(estado.sugestao);
  alvo.hidden = !lugar;
  if (!lugar) { alvo.replaceChildren(); return; }
  const frase = document.createElement('p');
  frase.append(`${TEXTOS.sugestao.veio} `, Object.assign(document.createElement('strong'), { textContent: nomeComUf(lugar) }), '.');
  const como = Object.assign(document.createElement('p'), { className: 'sugestao-como', textContent: TEXTOS.sugestao.como });
  const botoes = Object.assign(document.createElement('div'), { className: 'sugestao-papeis' });
  for (const papel of PAPEIS) {
    const b = Object.assign(document.createElement('button'), { type: 'button', className: 'm-chip' });
    const ocupante = estado.papeis[papel] && dados.lugar(estado.papeis[papel]);
    b.append(Object.assign(document.createElement('span'), { textContent: TEXTOS.papeis[papel].rotulo }));
    if (ocupante) b.append(Object.assign(document.createElement('span'), { className: 'sugestao-troca', textContent: TEXTOS.sugestao.noLugar(ocupante.n) }));
    b.addEventListener('click', () => aceitarSugestao(papel));
    botoes.append(b);
  }
  const nao = Object.assign(document.createElement('button'), { type: 'button', className: 'link-acao', textContent: TEXTOS.sugestao.agoraNao });
  nao.addEventListener('click', () => { estado.sugestao = null; render(); });
  alvo.replaceChildren(frase, como, botoes, nao);
}
function aceitarSugestao(papel) {
  const id = estado.sugestao;
  const lugar = id && dados.lugar(id);
  if (!lugar) return;
  estado.sugestao = null;
  estado.papeis[papel] = id;
  estado.trocando = false;
  editou();
  dados.produtos(id).catch(() => {});
  if (estado.modo !== 'mundo') { estado.modo = 'montar'; estado.passo = PAPEIS.indexOf(papel); }
  avisar(TEXTOS.montar.adicionado(lugar.n, TEXTOS.papeis[papel].rotulo));
  salvar();
  sincronizarUrl();
  render();
  if (estado.modo === 'mundo') agendarImagem();
}

function renderAviso(alvo) {
  alvo.replaceChildren();
  alvo.hidden = !estado.aviso;
  if (!estado.aviso) return;
  alvo.append(Object.assign(document.createElement('span'), { textContent: estado.aviso.texto }));
}

/* ----- busca ----- */
let resultados = [];
let ativo = -1;
function atualizarBusca() {
  const q = el.campo.value;
  el.buscaStatus.replaceChildren();
  if (estadoDados === 'carregando') {
    el.buscaStatus.textContent = TEXTOS.busca.carregando;
    pintarResultados([]);
    return;
  }
  if (estadoDados === 'erro') {
    el.buscaStatus.append(Object.assign(document.createElement('span'), { textContent: TEXTOS.busca.erro + ' ' }));
    const tentar = Object.assign(document.createElement('button'), { type: 'button', className: 'link-acao', textContent: TEXTOS.busca.tentar });
    tentar.addEventListener('click', () => carregarDados().then(render));
    const demo = Object.assign(document.createElement('button'), { type: 'button', className: 'link-acao', textContent: TEXTOS.busca.usarDemo });
    demo.addEventListener('click', async () => { await usarDemonstracao(); render(); el.campo.focus(); });
    el.buscaStatus.append(tentar, demo);
    pintarResultados([]);
    return;
  }
  if (!normalizar(q)) { pintarResultados([]); return; }
  resultados = dados.buscar(q, 8);
  ativo = resultados.length ? 0 : -1;
  pintarResultados(resultados);
  if (!resultados.length) el.buscaStatus.textContent = TEXTOS.busca.vazio(q.trim().slice(0, 40));
  else el.buscaStatus.append(Object.assign(document.createElement('span'), { className: 'sr-only', textContent: TEXTOS.busca.resultados(resultados.length) }));
}
function pintarResultados(lista) {
  el.lista.replaceChildren(...lista.map(({ lugar }, k) => {
    const li = document.createElement('li');
    li.id = `opcao-${k}`;
    li.setAttribute('role', 'option');
    li.setAttribute('aria-selected', String(k === ativo));
    li.dataset.id = lugar.i;
    const no = papeisDe(lugar.i).length > 0;
    li.append(
      Object.assign(document.createElement('span'), { className: 'res-nome', textContent: nomeComUf(lugar) }),
      Object.assign(document.createElement('span'), { className: 'res-meta', textContent: no ? TEXTOS.busca.noMundo : lugar.t === 'ra' ? TEXTOS.busca.ra : lugar.m || ESTADOS[lugar.u] }),
    );
    li.addEventListener('pointerdown', (e) => e.preventDefault()); // não tira o foco do campo antes do clique
    li.addEventListener('click', () => escolher(lugar.i));
    return li;
  }));
  const aberto = lista.length > 0;
  el.campo.setAttribute('aria-expanded', String(aberto));
  if (ativo >= 0 && aberto) el.campo.setAttribute('aria-activedescendant', `opcao-${ativo}`);
  else el.campo.removeAttribute('aria-activedescendant');
  el.montar.classList.toggle('buscando', aberto || document.activeElement === el.campo);
}
function moverAtivo(passo) {
  if (!resultados.length) return;
  ativo = (ativo + passo + resultados.length) % resultados.length;
  for (const li of el.lista.children) li.setAttribute('aria-selected', String(li.id === `opcao-${ativo}`));
  el.campo.setAttribute('aria-activedescendant', `opcao-${ativo}`);
  el.lista.children[ativo]?.scrollIntoView({ block: 'nearest' });
}

/* ----- ações da construção ----- */
function editou() {
  estado.doLink = false;
  estado.aviso = null;
}
function escolher(id, { teclado = false } = {}) {
  const lugar = dados.lugar(id);
  if (!lugar) return;
  const papel = PAPEIS[estado.passo];
  const jaNoMundo = papeisDe(id).some((p) => p !== papel);
  estado.papeis[papel] = id;
  estado.trocando = false;
  editou();
  el.campo.value = '';
  resultados = [];
  avisar(jaNoMundo ? TEXTOS.montar.mesmaIlha(lugar.n, TEXTOS.papeis[papel].rotulo) : TEXTOS.montar.adicionado(lugar.n, TEXTOS.papeis[papel].rotulo));
  dados.produtos(id).catch(() => {}); // já busca as camisetas deste lugar
  salvar();
  sincronizarUrl();
  render();
  if (teclado) el.btnAvancar.focus({ preventScroll: true });
}
function remover() {
  const papel = PAPEIS[estado.passo];
  const lugar = dados.lugar(estado.papeis[papel]);
  estado.papeis[papel] = null;
  estado.trocando = false;
  editou();
  if (lugar) avisar(TEXTOS.montar.removido(lugar.n));
  salvar();
  sincronizarUrl();
  render();
  el.campo.focus();
}
function irParaPasso(k) {
  estado.passo = Math.max(0, Math.min(2, k));
  estado.trocando = false;
  estado.modo = 'montar';
  estado.cidadeAberta = null;
  el.campo.value = '';
  salvar();
  render();
  el.pergunta.focus({ preventScroll: true });
}
function comecar() {
  OPCOES.registrar('mundo_inicio', {});
  estado.modo = 'montar';
  if (!temLugar()) estado.passo = 0;
  salvar();
  render();
  if (largoMQ.matches || !temLugar()) el.campo.focus({ preventScroll: true });
}
function concluir() {
  if (!temLugar()) return;
  OPCOES.registrar('mundo_concluido', { lugares: lugaresUnicos().length, papeis: PAPEIS.filter((p) => estado.papeis[p]).join('+') });
  estado.modo = 'mundo';
  estado.trocando = false;
  estado.cidadeAberta = null;
  estado.detalhes = false;
  salvar();
  sincronizarUrl();
  render();
  mundo?.visaoInicial();
  el.mundoTitulo.focus({ preventScroll: true });
  agendarImagem();
}

/* ----- painel do mundo ----- */
let listaFeita = '';
function renderMundo() {
  const lugares = lugaresUnicos();
  el.mundoTitulo.textContent = TEXTOS.mundo.titulo(lugares.length);
  // só refaz os cartões quando muda o mundo (lugares, papéis, lembranças): as fotos não piscam a cada render
  const chave = `${dados.modo}|` + lugares.map(({ lugar, papeis }) => `${lugar.i}:${papeis.join('+')}:${estado.lembrancas[lugar.i] ?? ''}`).join('|');
  if (chave !== listaFeita) {
    listaFeita = chave;
    el.listaLugares.replaceChildren(...lugares.map(({ lugar, papeis }) => cartaoLugar(lugar, papeis)));
  }
  const link = linkDisponivel();
  el.btnLink.disabled = !link;
  if (link) el.btnLink.removeAttribute('aria-describedby');
  else el.btnLink.setAttribute('aria-describedby', 'nota-link');
  el.notaLink.hidden = link;
  el.notaSalvar.hidden = !estado.salvarFalhou || estado.doLink;
  el.incluir.hidden = !temLembranca();
  el.incluirCheck.checked = estado.incluirLembrancas;
  renderAviso(el.avisoMundo);
  renderSugestao(el.sugestaoMundo);
  renderConecta();
}

function cartaoLugar(lugar, papeis) {
  const li = Object.assign(document.createElement('li'), { className: 'lugar' });
  li.dataset.id = lugar.i;
  li.style.setProperty('--cor-regiao', REGIOES[lugar.r].cor);
  const foto = Object.assign(document.createElement('span'), { className: 'lugar-foto carregando' });
  foto.setAttribute('aria-hidden', 'true');
  const info = Object.assign(document.createElement('div'), { className: 'lugar-info' });
  info.append(
    Object.assign(document.createElement('span'), { className: 'lugar-papeis', textContent: papeis.map((p) => TEXTOS.papeis[p].rotulo).join(' · ') }),
    Object.assign(document.createElement('span'), { className: 'lugar-nome', textContent: nomeComUf(lugar) }),
  );
  if (estado.lembrancas[lugar.i]) info.append(Object.assign(document.createElement('span'), { className: 'lugar-lembranca', textContent: `“${estado.lembrancas[lugar.i]}”` }));
  const acoes = Object.assign(document.createElement('div'), { className: 'lugar-acoes' });
  const conhecer = Object.assign(document.createElement('button'), { type: 'button', className: 'lugar-conhecer', textContent: TEXTOS.lugar.conhecer });
  conhecer.setAttribute('aria-label', TEXTOS.lugar.conhecerAria(nomeComUf(lugar)));
  conhecer.addEventListener('click', () => abrirCidade(lugar.i));
  const camisetas = Object.assign(document.createElement('a'), { className: 'lugar-camisetas', textContent: `${TEXTOS.lugar.camisetas} →` });
  camisetas.setAttribute('aria-disabled', 'true'); // ganha o endereço da página da cidade quando o arquivo do lugar chega
  camisetas.setAttribute('aria-label', TEXTOS.lugar.camisetasAria(nomeComUf(lugar)));
  acoes.append(conhecer, camisetas);
  li.append(foto, info, acoes);
  preencherCartao(li, lugar);
  return li;
}
/** Uma camiseta real e o link da página da cidade. Se o arquivo do lugar não carregar, o erro fica só na foto, com nova tentativa. */
async function preencherCartao(li, lugar) {
  const foto = li.querySelector('.lugar-foto'), camisetas = li.querySelector('.lugar-camisetas');
  const vazia = (conteudo) => {
    const s = Object.assign(document.createElement('span'), { className: 'lugar-foto vazia' });
    s.append(conteudo);
    li.querySelector('.lugar-foto').replaceWith(s);
    return s;
  };
  try {
    const r = await dados.produtos(lugar.i);
    if (!li.isConnected) return;
    if (!r.conectado) {
      vazia(TEXTOS.lugar.semCatalogo);
      camisetas.title = TEXTOS.lugar.semCatalogo;
      return;
    }
    if (r.url) {
      Object.assign(camisetas, { href: r.url, target: '_blank', rel: 'noopener' });
      camisetas.removeAttribute('aria-disabled');
    }
    const p = r.produtos.find((x) => x.imagem) ?? null;
    if (!p) { vazia(''); return; }
    const a = Object.assign(document.createElement('a'), { className: 'lugar-foto', href: p.url, target: '_blank', rel: 'noopener' });
    a.setAttribute('aria-label', TEXTOS.lugar.produtoAria(p.nome, lugar.n));
    a.append(Object.assign(document.createElement('img'), { src: p.imagem, alt: '', loading: 'lazy', decoding: 'async', width: 800, height: 820 }));
    foto.replaceWith(a);
  } catch {
    if (!li.isConnected) return;
    const tentar = Object.assign(document.createElement('button'), { type: 'button', className: 'link-acao', textContent: TEXTOS.busca.tentar });
    tentar.addEventListener('click', () => {
      li.querySelector('.lugar-foto').replaceWith(Object.assign(document.createElement('span'), { className: 'lugar-foto carregando' }));
      preencherCartao(li, lugar);
    });
    const caixa = document.createElement('span');
    caixa.append(TEXTOS.lugar.erro, document.createElement('br'), tentar);
    vazia(caixa);
  }
}

/* ----- o que conecta o mundo: só fatos das escolhas (quantos lugares, estados, paisagens dos perfis, distância origem–presente) ----- */
const listaPt = (itens) => (itens.length < 2 ? itens.join('') : `${itens.slice(0, -1).join(', ')} e ${itens.at(-1)}`);
const ICONES = {
  mapa: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 21s-6-5.2-6-10a6 6 0 0 1 12 0c0 4.8-6 10-6 10z"/><circle cx="12" cy="11" r="2.2"/></svg>',
  paisagem: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m3 19 6-9 4 6 3-4 5 7z"/></svg>',
  rota: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/><path d="M7.5 16.5 16.5 7.5" stroke-dasharray="2 2.6"/></svg>',
};
async function pontoDe(id) {
  const p = contexto.perfil(id)?.sede;
  if (p) return p;
  try { return (await dados.produtos(id)).sede ?? null; } catch { return null; }
}
let conectaFeito = '';
let pedidoConecta = 0;
async function renderConecta() {
  const lugares = lugaresUnicos();
  const chave = PAPEIS.map((p) => estado.papeis[p] ?? '').join('|');
  if (chave === conectaFeito) return;
  const meu = ++pedidoConecta;
  if (!lugares.length) { el.conecta.hidden = true; conectaFeito = chave; return; }
  const itens = [];
  const ufs = [...new Set(lugares.map(({ lugar }) => lugar.u))];
  itens.push({ icone: 'mapa', texto: TEXTOS.conecta.lugares(lugares.length, ufs) });
  const ambientes = [...new Set(lugares.flatMap(({ lugar }) => contexto.perfil(lugar.i)?.visual.ambientes ?? []))].map((a) => AMBIENTES[a]);
  if (ambientes.length) itens.push({ icone: 'paisagem', texto: TEXTOS.conecta.paisagens(listaPt(ambientes)) });
  const origem = estado.papeis.origem, presente = estado.papeis.presente;
  if (origem && presente && origem === presente) itens.push({ icone: 'rota', texto: TEXTOS.conecta.mesma });
  else if (origem && presente) {
    const [a, b] = await Promise.all([pontoDe(origem), pontoDe(presente)]);
    if (meu !== pedidoConecta) return;
    if (a && b) itens.push({ icone: 'rota', texto: TEXTOS.conecta.distancia(arredondarKm(distanciaKm(a, b))), nota: TEXTOS.conecta.distanciaNota });
  }
  conectaFeito = chave;
  el.conecta.hidden = false;
  el.conectaLista.replaceChildren(...itens.map((it) => {
    const li = document.createElement('li');
    const icone = document.createElement('span');
    icone.innerHTML = ICONES[it.icone]; // ícone fixo deste arquivo, nunca dado de fora
    const texto = Object.assign(document.createElement('span'), { textContent: it.texto });
    if (it.nota) texto.append(Object.assign(document.createElement('span'), { className: 'nota', textContent: it.nota }));
    li.append(icone, texto);
    return li;
  }));
}

/* ----- lembranças: texto da pessoa, uma por cidade, salvo com o progresso ----- */
function preencherLembranca(campo, id, papel) {
  campo.dataset.id = id;
  if (document.activeElement !== campo) campo.value = estado.lembrancas[id] ?? '';
  campo.placeholder = TEXTOS.lembranca.exemplos[papel] ?? TEXTOS.lembranca.exemplos.origem;
  contarLembranca(campo);
}
function contarLembranca(campo) {
  const contador = campo.parentElement.querySelector('.contador');
  if (contador) contador.textContent = `${[...campo.value].length}/${TEXTOS.lembranca.limite}`;
}
let timerLembranca = 0;
function aoDigitarLembranca(campo) {
  const id = campo.dataset.id;
  if (!id) return;
  const limpo = limparLembranca(campo.value);
  if (limpo) estado.lembrancas[id] = limpo;
  else delete estado.lembrancas[id];
  contarLembranca(campo);
  clearTimeout(timerLembranca);
  timerLembranca = setTimeout(() => {
    editou();
    salvar();
    if (estado.incluirLembrancas) { cacheImagem = null; sincronizarUrl(); }
    if (estado.modo === 'mundo') { renderMundo(); agendarImagem(); }
  }, 350);
}

/* ----- painel da cidade ----- */
let retornoFoco = null;
let pedidoCidade = 0;
/** Fontes sem perfil: o ponto e a divisão regional vêm do IBGE (Localidades 2022), a mesorregião dos dados da loja (divisão do IBGE de 1990). */
const FONTES_BASE = {
  localidades: {
    titulo: 'Localidades do Brasil 2022 — sedes municipais e divisão regional de 2017', publicador: 'IBGE',
    url: 'https://geoftp.ibge.gov.br/organizacao_do_territorio/estrutura_territorial/localidades/Localidades_do_Brasil/2022/Localidades_Municipios_kml.zip',
    referencia: 'Localidades 2022', consultadoEm: '2026-10-14',
  },
};
const dataBr = (iso) => (/^\d{4}-\d{2}-\d{2}$/.test(iso ?? '') ? iso.split('-').reverse().join('/') : '');
const grau = (v, pos, neg) => `${Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}° ${v < 0 ? neg : pos}`;
const coordenadas = (p) => `${grau(p.lat, 'N', 'S')} · ${grau(p.lon, 'L', 'O')}`;
const referenciaDe = (id, ref) => contexto.perfil(id)?.referencias.find((r) => r.id === ref) ?? null;
const temMarco = (id, ref) => !!mundo && !!contexto.perfil(id)?.visual.marcos.some((m) => m.referencia === ref);

function renderReferencias(id, perfil) {
  const refs = perfil?.referencias ?? [];
  el.cidadeRefs.replaceChildren(...refs.map((r) => {
    const li = Object.assign(document.createElement('li'), { className: 'referencia', id: `ref-${r.id}` });
    li.dataset.ref = r.id;
    li.append(
      Object.assign(document.createElement('span'), { className: 'ref-tipo', textContent: TEXTOS.tiposReferencia[r.tipo] }),
      Object.assign(document.createElement('span'), { className: 'ref-titulo', textContent: r.titulo }),
      Object.assign(document.createElement('p'), { className: 'ref-texto', textContent: r.texto }),
    );
    if (r.descoberta?.nota) li.append(Object.assign(document.createElement('p'), { className: 'ref-nota', textContent: r.descoberta.nota }));
    if (temMarco(id, r.id)) {
      const b = Object.assign(document.createElement('button'), { type: 'button', className: 'link-acao ref-acao' });
      b.innerHTML = ICONES.mapa; // ícone fixo deste arquivo
      b.append(document.createTextNode(TEXTOS.ficha.verNaMaquete));
      b.setAttribute('aria-label', `${TEXTOS.ficha.verNaMaquete}: ${r.titulo}`);
      b.addEventListener('click', () => abrirDescoberta(id, r.id, { teclado: true, origem: 'ficha' }));
      li.append(b);
    }
    return li;
  }));
}
/** Realça a referência de um marco e abre "Conheça este lugar" para mostrá-la. */
function destacarReferencia(ref) {
  for (const li of el.cidadeRefs.children) li.classList.toggle('destacada', li.dataset.ref === ref);
  const alvo = ref && $(`ref-${ref}`);
  if (!alvo || el.cidade.hidden) return;
  el.cidadeConheca.open = true;
  requestAnimationFrame(() => alvo.scrollIntoView({ block: 'center', behavior: reduzMQ.matches ? 'auto' : 'smooth' }));
}
/** "Mais sobre a cidade": só campos confirmados, cada um com a natureza do dado; campo sem dado não aparece. */
function renderDadosCidade(lugar, perfil, ibge) {
  const C = TEXTOS.ficha.campos;
  const linhas = [];
  const add = (rotulo, valor, detalhe) => linhas.push([rotulo, valor, detalhe]);
  if (perfil?.gentilico) {
    const g = perfil.gentilico;
    add(C.gentilico, g.oficial, g.variantes.length ? `Também registrado como ${listaPt(g.variantes)} no histórico do IBGE.` : 'Conforme o IBGE.');
  }
  // história e identidade primeiro; população e área são complementares e vêm por último
  for (const cur of perfil?.curiosidades ?? []) add(C.historia, cur.texto, `Fonte: ${listaPt(cur.fontes.map((f) => contexto.fonte(f)?.publicador || contexto.fonte(f)?.titulo).filter((x, k, a) => x && a.indexOf(x) === k))}.`);
  if (lugar.t === 'ra') add(C.estado, `${TEXTOS.busca.ra}`, 'Região Administrativa: divisão do governo do DF, não um município.');
  else add(C.estado, `${ESTADOS[lugar.u]} · Região ${perfil?.regioes?.grandeRegiao ?? REGIOES[lugar.r].nome}`, `Grande região do IBGE. Na navegação da loja: ${REGIOES[lugar.r].nome}.`);
  const imediata = perfil?.regioes?.imediata ?? ibge?.rgi, intermediaria = perfil?.regioes?.intermediaria ?? ibge?.rgint;
  if (imediata && intermediaria && lugar.t !== 'ra') add(C.regiaoAtual, `Região imediata de ${imediata} · intermediária de ${intermediaria}`, 'IBGE, divisão regional de 2017 (vigente).');
  const meso = perfil?.regioes?.mesorregiao ?? lugar.m, micro = perfil?.regioes?.microrregiao;
  if (meso && lugar.t !== 'ra') add(C.regiaoHistorica, `Mesorregião ${meso}${micro ? ` · microrregião ${micro}` : ''}`, 'IBGE, divisão de 1990, substituída em 2017.');
  const sede = perfil?.sede ?? ibge?.sede;
  if (sede) {
    const ra = ibge?.sede?.tipo === 'ra' && !perfil?.sede;
    add(ra ? C.coordenadasRa : C.coordenadas, coordenadas(sede), ra ? 'Ponto da Região Administrativa (IBGE, Localidades 2022).' : 'Ponto da sede municipal (IBGE, Localidades 2022). Não é o centro do território.');
  }
  if (perfil?.populacao) add(C.populacao, `${perfil.populacao.valor.toLocaleString('pt-BR')} pessoas`, `Censo Demográfico ${perfil.populacao.ano} (IBGE). Dado do censo, não estimativa.`);
  if (perfil?.area) add(C.area, `${perfil.area.km2.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} km²`, `Área territorial oficial, ${perfil.area.ano} (IBGE).`);
  el.cidadeDados.replaceChildren(...linhas.flatMap(([rotulo, valor, detalhe]) => {
    const dd = Object.assign(document.createElement('dd'), { textContent: valor });
    if (detalhe) dd.append(Object.assign(document.createElement('span'), { className: 'detalhe', textContent: detalhe }));
    return [Object.assign(document.createElement('dt'), { textContent: rotulo }), dd];
  }));
  el.cidadeMais.hidden = !linhas.length;
}
function renderFontes(perfil, ibge) {
  const chaves = [];
  const juntar = (lista) => { for (const k of lista ?? []) if (!chaves.includes(k)) chaves.push(k); };
  if (perfil) {
    juntar(perfil.fontesResumo);
    for (const r of perfil.referencias) juntar(r.fontes);
    for (const c of perfil.curiosidades) juntar(c.fontes);
    juntar(perfil.gentilico?.fontes); juntar(perfil.sede?.fontes); juntar(perfil.populacao?.fontes); juntar(perfil.area?.fontes); juntar(perfil.regioes?.fontes);
  }
  const fontes = chaves.map((k) => contexto.fonte(k)).filter(Boolean);
  if (!perfil?.sede && ibge?.sede) fontes.push(FONTES_BASE.localidades);
  el.cidadeFontesLista.replaceChildren(...fontes.map((f) => {
    const li = document.createElement('li');
    const a = Object.assign(document.createElement('a'), { href: f.url, target: '_blank', rel: 'noopener', textContent: f.titulo });
    li.append(a, Object.assign(document.createElement('span'), { className: 'quando', textContent: [f.publicador, f.referencia, f.consultadoEm && `consultado em ${dataBr(f.consultadoEm)}`].filter(Boolean).join(' · ') }));
    return li;
  }));
  el.cidadeFontes.hidden = !fontes.length;
  el.cidadeRevisao.hidden = !perfil;
  el.cidadeRevisao.textContent = perfil ? `${TEXTOS.ficha.revisao} ${dataBr(perfil.revisao?.em) || dataBr(fontes[0]?.consultadoEm)}.` : '';
}

async function abrirCidade(id, { referencia = null } = {}) {
  const lugar = dados.lugar(id);
  if (!lugar) return;
  if (!estado.cidadeAberta) retornoFoco = document.activeElement;
  const trocou = estado.cidadeAberta !== id;
  if (trocou) OPCOES.registrar('mundo_ficha', { lugar_id: id, perfil: !!contexto.perfil(id), via: referencia ? 'marco' : 'lugar' });
  estado.cidadeAberta = id;
  if (estado.descobertaAberta && estado.descobertaAberta.id !== id) fecharDescoberta({ semFoco: true });
  render();
  const perfil = contexto.perfil(id);
  const cor = REGIOES[lugar.r].cor;
  el.cidade.style.setProperty('--cor-regiao', cor);
  el.cidadePapeis.replaceChildren(...papeisDe(id).map((p) => Object.assign(document.createElement('li'), { textContent: TEXTOS.papeis[p].rotulo })));
  el.cidadeNome.replaceChildren(document.createTextNode(lugar.n), Object.assign(document.createElement('span'), { className: 'uf', textContent: ` · ${lugar.u}` }));
  el.cidadeEstado.textContent = lugar.t === 'ra' ? `${TEXTOS.busca.ra}` : `${ESTADOS[lugar.u]} · Região ${REGIOES[lugar.r].nome}`;
  // 1. frase de apresentação; o resumo e as referências ficam em "Conheça este lugar" (recolhido, a não ser que venha de um marco)
  el.cidadeFrase.hidden = !perfil?.frase;
  el.cidadeFrase.textContent = perfil?.frase ?? '';
  el.cidadeResumo.hidden = !perfil?.resumo;
  el.cidadeResumo.textContent = perfil?.resumo ?? '';
  el.cidadeConheca.hidden = !perfil?.resumo && !perfil?.referencias.length;
  // sem perfil: nada de aviso grande — só a identificação discreta de que o cenário é ilustrativo
  el.cidadePaisagem.hidden = !!perfil?.visual.rotulo;
  if (perfil?.visual.rotulo) el.cidadePaisagemPerfil.textContent = TEXTOS.ficha.paisagemPerfil(perfil.visual.rotulo);
  else {
    const pais = paisagemDe(lugar);
    el.cidadePaisagem.textContent = TEXTOS.cidade.paisagem(PAISAGENS[pais.chave].nome, pais.ilustrativo);
  }
  renderReferencias(id, perfil);
  preencherLembranca(el.lembrancaFicha, id, papeisDe(id)[0]);
  if (trocou || !referencia) el.cidadeConheca.open = false;
  if (trocou) { el.cidadeMais.open = false; el.cidadeFontes.open = false; }
  renderDadosCidade(lugar, perfil, null);
  renderFontes(perfil, null);
  definirCta(null, lugar, 'carregando');
  // vizinhos na ordem da história
  const lugares = lugaresUnicos();
  const k = lugares.findIndex((l) => l.lugar.i === id);
  const ant = lugares[(k - 1 + lugares.length) % lugares.length], prox = lugares[(k + 1) % lugares.length];
  el.btnCidadeAnt.hidden = lugares.length < 3;
  el.btnCidadeProx.hidden = lugares.length < 2;
  el.btnCidadeAnt.textContent = TEXTOS.cidade.anterior(ant.lugar.n);
  el.btnCidadeProx.textContent = TEXTOS.cidade.proxima(prox.lugar.n);
  el.btnCidadeAnt.onclick = () => abrirCidade(ant.lugar.i);
  el.btnCidadeProx.onclick = () => abrirCidade(prox.lugar.i);
  mundo?.focar(id);
  if (trocou) el.cidade.scrollTop = 0;
  if (referencia) destacarReferencia(referencia);
  else { destacarReferencia(estado.descobertaAberta?.id === id ? estado.descobertaAberta.referencia : null); el.cidadeNome.focus({ preventScroll: true }); }

  const meu = ++pedidoCidade;
  el.cidadeProdutos.setAttribute('aria-busy', 'true');
  el.cidadeProdutos.replaceChildren(listaEsqueleto());
  try {
    const r = await dados.produtos(id);
    if (meu !== pedidoCidade) return;
    renderDadosCidade(lugar, perfil, r);
    renderFontes(perfil, r);
    if (!r.conectado) {
      definirCta(null, lugar, 'desconectado');
      el.cidadeProdutos.replaceChildren(estadoProdutos(TEXTOS.cidade.naoConectado, TEXTOS.cidade.naoConectadoApoio));
    } else {
      definirCta(r.url, lugar, r.url ? 'pronto' : 'sem-link');
      // uma prévia (até quatro); "Ver camisetas de …" leva à página com todas
      el.cidadeProdutos.replaceChildren(r.produtos.length ? listaProdutos(r.produtos.slice(0, 4), lugar) : estadoProdutos(TEXTOS.cidade.vazio));
    }
  } catch {
    if (meu !== pedidoCidade) return;
    definirCta(null, lugar, 'erro');
    const caixa = estadoProdutos(TEXTOS.cidade.erro);
    const tentar = Object.assign(document.createElement('button'), { type: 'button', className: 'link-acao', textContent: TEXTOS.busca.tentar });
    tentar.addEventListener('click', () => abrirCidade(id));
    caixa.append(tentar);
    el.cidadeProdutos.replaceChildren(caixa);
  } finally {
    if (meu === pedidoCidade) el.cidadeProdutos.setAttribute('aria-busy', 'false');
  }
}
function definirCta(url, lugar, situacao) {
  el.cidadeCta.textContent = TEXTOS.cidade.cta(lugar.n);
  if (url) {
    el.cidadeCta.href = url;
    el.cidadeCta.removeAttribute('aria-disabled');
    el.cidadeCta.tabIndex = 0;
  } else {
    el.cidadeCta.removeAttribute('href');
    el.cidadeCta.setAttribute('aria-disabled', 'true');
    el.cidadeCta.tabIndex = -1;
  }
  el.produtosTitulo.hidden = situacao === 'desconectado';
}
function listaEsqueleto() {
  const ul = Object.assign(document.createElement('ul'), { className: 'produtos' });
  for (let k = 0; k < 4; k++) {
    const li = document.createElement('li');
    li.className = 'produto esqueleto';
    li.append(Object.assign(document.createElement('span'), { className: 'foto' }));
    ul.append(li);
  }
  ul.setAttribute('aria-label', TEXTOS.cidade.carregando);
  return ul;
}
function listaProdutos(produtos, lugar) {
  const ul = Object.assign(document.createElement('ul'), { className: 'produtos' });
  ul.setAttribute('aria-label', `Camisetas de ${lugar.n}`);
  for (const p of produtos) {
    const li = document.createElement('li');
    const a = Object.assign(document.createElement('a'), { className: 'produto', href: p.url, target: '_blank', rel: 'noopener' });
    a.setAttribute('aria-label', `Camiseta ${p.nome} de ${lugar.n} (abre a página da estampa em outra aba)`);
    const foto = Object.assign(document.createElement('span'), { className: 'foto' });
    if (p.imagem) foto.append(Object.assign(document.createElement('img'), { src: p.imagem, alt: '', loading: 'lazy', decoding: 'async', width: 800, height: 820 }));
    a.append(foto, Object.assign(document.createElement('span'), { className: 'produto-nome', textContent: p.nome }), Object.assign(document.createElement('span'), { className: 'produto-acao', textContent: 'Ver estampa' }));
    li.append(a);
    ul.append(li);
  }
  return ul;
}
function estadoProdutos(titulo, apoio) {
  const p = Object.assign(document.createElement('p'), { className: 'estado-produtos' });
  p.append(Object.assign(document.createElement('strong'), { textContent: titulo }));
  if (apoio) p.append(document.createTextNode(apoio));
  return p;
}
function fecharCidade({ manterCamera = false, semFoco = false } = {}) {
  if (!estado.cidadeAberta) return;
  const id = estado.cidadeAberta;
  estado.cidadeAberta = null;
  pedidoCidade++;
  render();
  if (!manterCamera) mundo?.visaoInicial();
  if (!semFoco) {
    const alvo = retornoFoco && document.contains(retornoFoco) && !retornoFoco.closest('[hidden]') ? retornoFoco : el.listaLugares.querySelector(`[data-id="${CSS.escape(id)}"] .lugar-conhecer`);
    alvo?.focus({ preventScroll: true });
  }
  retornoFoco = null;
}

/** Toque na maquete: num marco abre a descoberta; na ilha (ou placa/etiqueta) abre a ficha; na água fecha a descoberta aberta. */
function aoTocar(alvo) {
  if (!alvo) {
    // espaço vazio: com a ficha aberta, volta ao mundo; senão fecha só a descoberta (arrasto e pinça nunca chegam aqui)
    fecharDescoberta({ semFoco: true });
    if (estado.modo === 'mundo' && estado.cidadeAberta !== null) fecharCidade();
    return;
  }
  const { id, descoberta } = alvo;
  if (id.startsWith('previa:')) { if (estado.modo === 'intro') comecar(); return; }
  if (estado.modo === 'mundo') {
    if (descoberta && referenciaDe(id, descoberta)) { abrirDescoberta(id, descoberta); return; }
    fecharDescoberta({ semFoco: true });
    abrirCidade(id);
  } else if (estado.modo === 'montar') {
    const k = PAPEIS.findIndex((p) => estado.papeis[p] === id);
    if (k >= 0) irParaPasso(k);
  }
}

/* ----- descobertas: até dois marcos por ilha contam uma história curta; uma aberta por vez ----- */
const pontos = new Map(); // `${id}|${referência}` → botão sobre o marco
let retornoFocoBalao = null;
function renderDescobertas() {
  const ativos = new Set();
  if (estado.modo === 'mundo' && mundo) {
    for (const { lugar } of lugaresUnicos()) {
      for (const m of contexto.perfil(lugar.i)?.visual.marcos ?? []) {
        const r = referenciaDe(lugar.i, m.referencia);
        if (!r) continue;
        const chave = `${lugar.i}|${r.id}`;
        ativos.add(chave);
        if (pontos.has(chave)) continue;
        const b = Object.assign(document.createElement('button'), { type: 'button', className: 'ponto-descoberta oculta', tabIndex: -1 });
        b.innerHTML = '<span class="anel"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></span>';
        b.setAttribute('aria-label', TEXTOS.descoberta.rotulo(r.titulo));
        b.dataset.id = lugar.i;
        b.dataset.ref = r.id;
        b.addEventListener('click', () => (estado.descobertaAberta?.id === lugar.i && estado.descobertaAberta.referencia === r.id ? fecharDescoberta() : abrirDescoberta(lugar.i, r.id)));
        el.descobertas.append(b);
        pontos.set(chave, b);
      }
    }
  }
  for (const [chave, b] of pontos) if (!ativos.has(chave)) { b.remove(); pontos.delete(chave); }
  const aberta = estado.descobertaAberta;
  if (aberta && !pontos.has(`${aberta.id}|${aberta.referencia}`)) fecharDescoberta({ semFoco: true });
}
function areaLivre() {
  const painel = [el.intro, el.montar, el.mundoP, el.cidade].find((p) => !p.hidden);
  const r = painel?.getBoundingClientRect();
  if (largoMQ.matches) return { esq: 12, topo: 76, dir: r ? r.left - 12 : innerWidth - 12, base: innerHeight - 84 };
  return { esq: 12, topo: 64, dir: innerWidth - 12, base: r ? r.top - 8 : innerHeight - 12 };
}
/** A cidade "em exploração": a da ficha aberta ou a da descoberta aberta. Só ela mostra pontos; na visão geral os marcos falam sozinhos. */
const cidadeExplorada = () => estado.cidadeAberta ?? estado.descobertaAberta?.id ?? null;
/** Pontos sobre os marcos: a colisão usa a área tocável inteira (44 px), não só o desenho; se esbarra, desce ou vai para o lado. */
function posicionarDescobertas(projecoes) {
  let ancora = null;
  const aberta = estado.descobertaAberta;
  const explorada = cidadeExplorada();
  const R2 = 23; // meia área tocável (44 px) + folga
  const ocupados = estado.cidadeAberta === null ? retangulosEtiquetas.map((r) => ({ ...r })) : [];
  const ordenados = [...projecoes].sort((a, b) => b.y - a.y);
  for (const p of ordenados) {
    const b = pontos.get(`${p.id}|${p.referencia}`);
    if (!b) continue;
    const esta = aberta?.id === p.id && aberta.referencia === p.referencia;
    const oculta = !p.visivel || p.id !== explorada;
    b.classList.toggle('oculta', oculta && !esta);
    b.classList.toggle('aberto', esta);
    let x = p.x, y = p.y;
    if (!oculta) {
      for (let volta = 0; volta < 6; volta++) {
        const bate = ocupados.find((r) => x + R2 > r.esq && x - R2 < r.dir && y + R2 > r.topo && y - R2 < r.base);
        if (!bate) break;
        if (volta % 2 === 0) y = bate.base + R2 + 2;
        else x = x < (bate.esq + bate.dir) / 2 ? bate.esq - R2 - 2 : bate.dir + R2 + 2;
      }
      ocupados.push({ esq: x - R2, dir: x + R2, topo: y - R2, base: y + R2 });
    }
    const pos = `${Math.round(x)},${Math.round(y)}`;
    if (b.dataset.pos !== pos) { b.dataset.pos = pos; b.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`; }
    if (esta) ancora = { ...p, x, y };
  }
  if (ancora && !el.balao.hidden) posicionarBalao(ancora);
}
function posicionarBalao(p) {
  const w = el.balao.offsetWidth, h = el.balao.offsetHeight;
  const a = areaLivre();
  if (!largoMQ.matches) {
    // celular: o cartão encosta no painel, embaixo, e deixa a parte de cima da maquete à vista
    const y = Math.round(Math.max(a.topo, a.base - h));
    const pos = `12,${y}`;
    if (el.balao.dataset.pos !== pos) { el.balao.dataset.pos = pos; el.balao.style.transform = `translate3d(12px, ${y}px, 0)`; }
    return;
  }
  let x = p.x - w / 2, y = p.y - h - 26;
  if (y < a.topo) y = p.y + 26; // não cabe em cima do marco: vai para baixo
  x = Math.round(Math.min(Math.max(x, a.esq), Math.max(a.esq, a.dir - w)));
  y = Math.round(Math.min(Math.max(y, a.topo), Math.max(a.topo, a.base - h)));
  const pos = `${x},${y}`;
  if (el.balao.dataset.pos === pos) return;
  el.balao.dataset.pos = pos;
  el.balao.style.transform = `translate3d(${x}px, ${y}px, 0)`;
}
/**
 * Abre a descoberta de um marco. Com a ficha aberta, um toque no marco só realça a referência na própria ficha (sem balão por cima).
 * "Ver na maquete" (teclado/leitor de tela, origem "ficha"): no desktop o balão abre ao lado da ficha; no celular a ficha dá lugar ao cartão.
 */
function abrirDescoberta(id, ref, { teclado = false, origem = 'maquete' } = {}) {
  const r = referenciaDe(id, ref), lugar = dados.lugar(id);
  if (!r || !lugar) return;
  if (estado.cidadeAberta !== null && origem === 'maquete') { abrirCidade(id, { referencia: ref }); return; }
  if (!estado.descobertaAberta) retornoFocoBalao = document.activeElement;
  if (!largoMQ.matches) {
    if (estado.cidadeAberta !== null) { estado.descobertaAberta = { id, referencia: ref }; fecharCidade({ manterCamera: true, semFoco: true }); }
    if (estado.detalhes) { estado.detalhes = false; render(); } // nunca um cartão grande e o painel aberto ao mesmo tempo
  }
  estado.descobertaAberta = { id, referencia: ref };
  el.balao.style.setProperty('--cor-regiao', REGIOES[lugar.r].cor);
  el.balaoTipo.textContent = `${TEXTOS.tiposReferencia[r.tipo]} · ${lugar.n}`;
  el.balaoTitulo.textContent = r.titulo;
  el.balaoTexto.textContent = r.texto;
  el.balaoCurto.textContent = r.curto || r.texto;
  el.balaoNota.textContent = r.descoberta?.nota ?? '';
  el.balaoNota.hidden = !r.descoberta?.nota;
  el.btnBalaoCidade.textContent = TEXTOS.descoberta.conhecer(lugar.n);
  el.btnBalaoCidade.hidden = estado.cidadeAberta === id;
  el.balao.dataset.pos = '';
  el.balao.style.transform = 'translate3d(-9999px, -9999px, 0)'; // o próximo quadro coloca o balão junto do marco
  el.balao.hidden = false;
  if (estado.cidadeAberta === id) destacarReferencia(ref);
  mundo?.redesenhar();
  if (teclado) el.balaoTitulo.focus({ preventScroll: true });
}
function fecharDescoberta({ semFoco = false } = {}) {
  if (!estado.descobertaAberta) return;
  const { id } = estado.descobertaAberta;
  estado.descobertaAberta = null;
  const tinhaFoco = el.balao.contains(document.activeElement);
  el.balao.hidden = true;
  for (const b of pontos.values()) b.classList.remove('aberto');
  mundo?.redesenhar();
  if (!semFoco && tinhaFoco) {
    const daCidade = el.listaLugares.querySelector(`[data-id="${CSS.escape(id)}"] .lugar-conhecer`);
    const volta = retornoFocoBalao && document.contains(retornoFocoBalao) && !retornoFocoBalao.closest('[hidden]') ? retornoFocoBalao : daCidade ?? el.palco;
    volta.focus({ preventScroll: true });
  }
  retornoFocoBalao = null;
}

/* ----- render geral ----- */
function render({ animarCena = true } = {}) {
  const m = estado.modo;
  el.app.dataset.modo = m;
  el.intro.hidden = m !== 'intro';
  el.montar.hidden = m !== 'montar';
  el.mundoP.hidden = m !== 'mundo' || estado.cidadeAberta !== null;
  el.cidade.hidden = m !== 'mundo' || estado.cidadeAberta === null;
  el.camera.hidden = !mundo || m === 'intro' || m === 'carregando' || (m === 'montar' && !temLugar());
  el.dica.hidden = !mundo || m !== 'montar' || temLugar();
  const comFicha = m === 'mundo' && estado.cidadeAberta !== null;
  el.btnVisaoInicial.querySelector('.rotulo-longo').textContent = comFicha ? TEXTOS.camera.voltar : TEXTOS.camera.visao;
  el.btnVisaoInicial.setAttribute('aria-label', comFicha ? TEXTOS.camera.voltarAria : TEXTOS.camera.visaoAria);
  el.btnVisaoInicial.title = comFicha ? TEXTOS.camera.voltar : TEXTOS.camera.visao;
  el.mundoP.classList.toggle('expandido', estado.detalhes);
  el.btnDetalhes.setAttribute('aria-expanded', String(estado.detalhes));
  el.btnDetalhesTexto.textContent = estado.detalhes ? TEXTOS.detalhes.fechar : TEXTOS.detalhes.abrir;
  el.btnComecar.textContent = temLugar() ? 'Continuar meu mundo' : TEXTOS.intro.cta;
  el.seloDemo.hidden = dados.modo !== 'demonstracao';
  if (m === 'montar') renderMontar();
  if (m === 'mundo') renderMundo();
  if (m !== 'mundo') fecharDescoberta({ semFoco: true });
  renderEtiquetas();
  renderDescobertas();
  renderEstatico();
  el.descricao.textContent = m === 'intro' ? TEXTOS.intro.apoio : TEXTOS.cena.descricao(lugaresUnicos());
  sincronizarCena({ animar: animarCena });
  sincronizarUrl();
  agendarArea();
}

/* ----- área livre para a maquete (painel embaixo no celular, à direita no desktop) ----- */
let areaPendente = 0;
function agendarArea() {
  cancelAnimationFrame(areaPendente);
  areaPendente = requestAnimationFrame(() => {
    if (!mundo) return;
    const painel = [el.intro, el.montar, el.mundoP, el.cidade].find((p) => !p.hidden);
    const altura = el.palco.clientHeight;
    let livre;
    if (largoMQ.matches) livre = { direita: painel ? painel.offsetWidth + 48 : 0, base: 0, topo: 64 };
    else {
      // a busca aberta estica a folha; a maquete não salta por isso: o enquadramento usa a altura normal do painel.
      // O resultado é diferente: compacto ou expandido, o enquadramento segue a altura real dele.
      const limite = painel === el.cidade ? 0.68 : painel === el.mundoP ? 0.66 : 0.58;
      const h = painel ? Math.min(painel.offsetHeight, altura * limite) : 0;
      // topo: o cabeçalho e o espaço das etiquetas acima das ilhas
      livre = { direita: 0, base: Math.round(h / 24) * 24, topo: 80 };
    }
    el.palco.style.setProperty('--livre-x', `${(el.palco.clientWidth - livre.direita) / 2}px`);
    el.palco.style.setProperty('--livre-y', `${livre.topo + (altura - livre.base - livre.topo) / 2}px`);
    if (mundo.definirAreaVisivel(livre)) mundo.reenquadrar({ animar: estado.modo !== 'carregando' });
  });
}

/* ==========================================================================
   7. EXPORTAÇÃO E COMPARTILHAMENTO — PNG 1080 × 1350 montado a partir do mundo real.
   ========================================================================== */
const EXPORTACAO = { largura: 1080, altura: 1350, arquivo: 'meu-pequeno-mundo-use-origens.png', site: 'useorigens.com.br' };
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
async function fontesProntas() {
  const fontes = [`900 58px ${FONTES.display}`, `800 58px ${FONTES.display}`, `500 44px ${FONTES.serif}`, `italic 500 30px ${FONTES.serif}`, `700 19px ${FONTES.body}`, `600 22px ${FONTES.body}`];
  try { await Promise.race([Promise.all(fontes.map((f) => document.fonts.load(f))), espera(3500)]); } catch { /* segue com a fonte de reserva */ }
}
const selos = {};
async function selo(regiao) {
  if (!selos[regiao]) {
    selos[regiao] = new Promise((ok) => {
      const img = new Image();
      img.onload = () => ok(img);
      img.onerror = () => ok(null);
      img.src = REGIOES[regiao].selo;
    });
  }
  return selos[regiao];
}
const grafemas = (texto) => (typeof Intl !== 'undefined' && Intl.Segmenter ? [...new Intl.Segmenter('pt-BR', { granularity: 'grapheme' }).segment(texto)].map((x) => x.segment) : [...texto]);
/** Quebra o texto em linhas que cabem na largura: por palavra e, se uma palavra sozinha não cabe, por caractere (emoji inteiro). */
function quebrarLinhas(g, texto, largura) {
  const linhas = [];
  let atual = '';
  const cabe = (t) => g.measureText(t).width <= largura;
  for (const palavra of texto.split(' ')) {
    const junto = atual ? `${atual} ${palavra}` : palavra;
    if (cabe(junto)) { atual = junto; continue; }
    if (atual) linhas.push(atual);
    atual = '';
    for (const ch of grafemas(palavra)) {
      if (cabe(atual + ch)) atual += ch;
      else { if (atual) linhas.push(atual); atual = ch; }
    }
  }
  if (atual) linhas.push(atual);
  return linhas;
}
/** O maior corpo (entre max e min) em que o texto cabe em até maxLinhas; devolve o corpo e as linhas. */
function ajustarParagrafo(g, texto, estilo, familia, max, min, largura, maxLinhas) {
  let px = max, linhas;
  for (;;) {
    g.font = `${estilo} ${px}px ${familia}`;
    linhas = quebrarLinhas(g, texto, largura);
    if (linhas.length <= maxLinhas || px <= min) break;
    px -= 2;
  }
  if (linhas.length > maxLinhas) { // não deve acontecer com 80 caracteres; se acontecer, a última linha termina em reticências
    linhas = linhas.slice(0, maxLinhas);
    let ultima = linhas[maxLinhas - 1];
    while (ultima && g.measureText(`${ultima}…`).width > largura) ultima = grafemas(ultima).slice(0, -1).join('');
    linhas[maxLinhas - 1] = `${ultima}…`;
  }
  return { px, linhas };
}
function ajustarFonte(g, texto, peso, familia, max, min, largura) {
  let px = max;
  g.font = `${peso} ${px}px ${familia}`;
  while (g.measureText(texto).width > largura && px > min) { px -= 2; g.font = `${peso} ${px}px ${familia}`; }
  return px;
}
function desenharMundo2D(g, x, y, w, h, lugares) {
  // Sem WebGL: um esquema plano das ilhas, com as mesmas cores das paisagens.
  const pos = lugares.length === 1 ? [[0.5, 0.5]] : lugares.length === 2 ? [[0.3, 0.55], [0.7, 0.45]] : [[0.22, 0.62], [0.5, 0.36], [0.78, 0.62]];
  g.save();
  g.strokeStyle = 'rgba(90,70,50,.55)'; g.lineWidth = 6; g.setLineDash([14, 12]);
  g.beginPath();
  pos.forEach(([px, py], k) => (k ? g.lineTo(x + px * w, y + py * h) : g.moveTo(x + px * w, y + py * h)));
  g.stroke();
  g.setLineDash([]);
  lugares.forEach(({ lugar }, k) => {
    const [px, py] = pos[k];
    const cx = x + px * w, cy = y + py * h, r = Math.min(w, h) * 0.17;
    const pais = PAISAGENS[receitaDe(lugar).base] ?? PAISAGENS.interior;
    g.fillStyle = pais.cores.estratos[1];
    g.beginPath(); g.ellipse(cx, cy + r * 0.28, r, r * 0.55, 0, 0, TAU); g.fill();
    g.fillStyle = pais.cores.grama[0];
    g.beginPath(); g.ellipse(cx, cy, r, r * 0.55, 0, 0, TAU); g.fill();
  });
  g.restore();
}
async function gerarImagem() {
  await fontesProntas();
  // a imagem sai de uma câmera própria: balão, pontos de descoberta e painéis nunca entram nela, e continuam como estavam
  mundo?.redesenharPlacas();
  const lugares = lugaresUnicos();
  const W = EXPORTACAO.largura, H = EXPORTACAO.altura;
  const tela = document.createElement('canvas');
  tela.width = W; tela.height = H;
  const g = tela.getContext('2d');
  const fundo = g.createLinearGradient(0, 0, 0, H);
  fundo.addColorStop(0, '#f4f0e8'); fundo.addColorStop(0.6, '#ebe5da'); fundo.addColorStop(1, '#ded6c8');
  g.fillStyle = fundo;
  g.fillRect(0, 0, W, H);
  const brilho = g.createRadialGradient(W / 2, 470, 40, W / 2, 470, 620);
  brilho.addColorStop(0, 'rgba(255,252,245,.9)'); brilho.addColorStop(1, 'rgba(255,252,245,0)');
  g.fillStyle = brilho;
  g.fillRect(0, 0, W, H);

  const comEspaco = (v) => { if ('letterSpacing' in g) g.letterSpacing = v; };
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  g.fillStyle = '#000';
  g.font = `900 60px ${FONTES.display}`;
  comEspaco('1px');
  g.fillText('USE ORIGENS', W / 2, 104);
  g.font = `700 19px ${FONTES.body}`;
  comEspaco('5px');
  g.fillStyle = '#56564f';
  g.fillText('MEU PEQUENO MUNDO', W / 2, 140);
  comEspaco('0px');

  // lembranças: só quando a pessoa escolheu incluir; cada uma fica embaixo do nome, como citação dela
  const lembrancaDe = (id) => (estado.incluirLembrancas ? estado.lembrancas[id] ?? '' : '');
  const xTextoLegenda = 188, larguraLegenda = W - xTextoLegenda - 96;
  const FONTE_LEMBRANCA = FONTES.serif;
  const medidaLembranca = (id) => (lembrancaDe(id) ? ajustarParagrafo(g, `“${lembrancaDe(id)}”`, 'italic 500', FONTE_LEMBRANCA, 30, 22, larguraLegenda, 2) : null);
  const alturaLinha = (id) => { const m = medidaLembranca(id); return m ? 116 + m.linhas.length * Math.round(m.px * 1.22) : 108; };
  const blocoInferior = 60 + 36 + lugares.reduce((t, { lugar }) => t + alturaLinha(lugar.i), 0) + 96;
  const cenaTopo = 160, cenaAltura = H - cenaTopo - blocoInferior;
  if (mundo) g.drawImage(mundo.exportar(W, cenaAltura, 2), 0, cenaTopo, W, cenaAltura);
  else desenharMundo2D(g, 0, cenaTopo, W, cenaAltura, lugares);

  let y = cenaTopo + cenaAltura + 50;
  g.fillStyle = '#111';
  ajustarFonte(g, TEXTOS.mundo.frase, 500, FONTES.serif, 46, 30, W - 140);
  g.fillText(TEXTOS.mundo.frase, W / 2, y);
  y += 30;
  g.strokeStyle = 'rgba(0,0,0,.22)'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(96, y); g.lineTo(W - 96, y); g.stroke();
  y += 10;

  g.textAlign = 'left';
  for (const { lugar, papeis } of lugares) {
    const topo = y + 18;
    const img = await selo(lugar.r);
    if (img) g.drawImage(img, 96, topo + 6, 68, 68);
    const xTexto = 188;
    g.fillStyle = REGIOES[lugar.r].cor;
    g.font = `800 18px ${FONTES.body}`;
    comEspaco('3px');
    g.fillText(papeis.map((p) => TEXTOS.papeis[p].rotulo.toUpperCase()).join(' · '), xTexto, topo + 20);
    comEspaco('0px');
    const nome = lugar.n.toUpperCase();
    g.fillStyle = '#000';
    ajustarFonte(g, nome, 800, FONTES.display, 56, 28, W - xTexto - 96 - 70);
    g.fillText(nome, xTexto, topo + 82);
    const larguraNome = g.measureText(nome).width;
    g.font = `700 22px ${FONTES.body}`;
    g.fillStyle = '#56564f';
    g.fillText(lugar.u, xTexto + larguraNome + 14, topo + 82);
    const lembranca = medidaLembranca(lugar.i);
    if (lembranca) {
      g.fillStyle = '#33332f';
      g.font = `italic 500 ${lembranca.px}px ${FONTE_LEMBRANCA}`;
      lembranca.linhas.forEach((l, k) => g.fillText(l, xTexto, topo + 118 + k * Math.round(lembranca.px * 1.22)));
    }
    y += alturaLinha(lugar.i);
  }
  g.textAlign = 'center';
  g.fillStyle = '#33332f';
  g.font = `600 22px ${FONTES.body}`;
  comEspaco('1px');
  g.fillText(EXPORTACAO.site, W / 2, H - 58);
  comEspaco('0px');
  g.fillStyle = '#7a7a72';
  g.font = `500 16px ${FONTES.body}`;
  g.fillText('Representação ilustrativa dos lugares', W / 2, H - 28);
  return new Promise((ok, falha) => tela.toBlob((b) => (b ? ok(b) : falha(new Error('toBlob'))), 'image/png'));
}

const assinaturaMundo = () => PAPEIS.map((p) => `${p}=${estado.papeis[p] ?? ''}`).join('&') + (estado.incluirLembrancas ? `#${JSON.stringify(lembrancasDoMundo())}` : '');
let cacheImagem = null;
let timerImagem = 0;
function agendarImagem() {
  clearTimeout(timerImagem);
  if (estado.modo !== 'mundo') return;
  // pronta antes do clique: o compartilhamento nativo precisa do gesto da pessoa, sem espera longa no meio
  timerImagem = setTimeout(async () => {
    if (estado.modo !== 'mundo' || document.hidden) return;
    const assinatura = assinaturaMundo();
    if (cacheImagem?.assinatura === assinatura) return;
    try { cacheImagem = { assinatura, blob: await gerarImagem() }; } catch { cacheImagem = null; }
  }, 2200);
}
async function imagemAtual() {
  const assinatura = assinaturaMundo();
  if (cacheImagem?.assinatura === assinatura) return cacheImagem.blob;
  const blob = await gerarImagem();
  cacheImagem = { assinatura, blob };
  return blob;
}
function baixarBlob(blob) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: EXPORTACAO.arquivo });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
async function baixarImagem() {
  const lembrancas = estado.incluirLembrancas && temLembranca();
  let blob;
  try {
    if (!cacheImagem || cacheImagem.assinatura !== assinaturaMundo()) avisar(TEXTOS.mundo.gerando);
    blob = await imagemAtual();
  } catch {
    OPCOES.registrar('mundo_png', { acao: 'baixar', resultado: 'falhou' });
    avisar(TEXTOS.mundo.gerarFalhou);
    return;
  }
  OPCOES.registrar('mundo_png', { acao: 'baixar', resultado: 'gerado', lembrancas });
  baixarBlob(blob);
  // o navegador recebeu o arquivo para baixar; se a pessoa salvou de fato, a página não tem como saber
  OPCOES.registrar('mundo_download_iniciado', { lembrancas });
  avisar(TEXTOS.mundo.imagemPronta);
}
async function compartilhar() {
  let blob;
  try {
    if (!cacheImagem || cacheImagem.assinatura !== assinaturaMundo()) avisar(TEXTOS.mundo.gerando);
    blob = await imagemAtual();
  } catch {
    OPCOES.registrar('mundo_png', { acao: 'compartilhar', resultado: 'falhou' });
    avisar(TEXTOS.mundo.gerarFalhou);
    return;
  }
  const lembrancas = estado.incluirLembrancas && temLembranca();
  OPCOES.registrar('mundo_png', { acao: 'compartilhar', resultado: 'gerado', lembrancas });
  const arquivo = new File([blob], EXPORTACAO.arquivo, { type: 'image/png' });
  const pacote = { files: [arquivo], title: 'Meu pequeno mundo', text: TEXTOS.mundo.frase };
  if (navigator.canShare?.(pacote)) {
    OPCOES.registrar('mundo_compartilhar', { resultado: 'nativo_tentativa', lembrancas });
    try {
      await navigator.share(pacote);
      OPCOES.registrar('mundo_compartilhar', { resultado: 'nativo_concluido', lembrancas });
    } catch (e) {
      // cancelar a janela nativa não é erro nem compartilhamento: só fica registrado como cancelado
      OPCOES.registrar('mundo_compartilhar', { resultado: e?.name === 'AbortError' ? 'nativo_cancelado' : 'nativo_falhou', lembrancas });
      if (e?.name !== 'AbortError') abrirDialogoCompartilhar();
    }
    return;
  }
  OPCOES.registrar('mundo_compartilhar', { resultado: 'alternativa', lembrancas });
  abrirDialogoCompartilhar();
}
function abrirDialogoCompartilhar() {
  $('dlg-link').disabled = !linkDisponivel();
  $('dlg-compartilhar-texto').textContent = linkDisponivel()
    ? 'Este navegador não envia a imagem direto para outros apps. Baixe a imagem ou copie o link do seu mundo.'
    : 'Este navegador não envia a imagem direto para outros apps. Baixe a imagem e compartilhe onde quiser.';
  el.dlgCompartilhar.showModal();
}
async function copiarLink() {
  if (!linkDisponivel()) return;
  const url = urlDoMundo();
  const lembrancas = estado.incluirLembrancas && temLembranca();
  try {
    await navigator.clipboard.writeText(url);
    OPCOES.registrar('mundo_compartilhar', { resultado: 'link_copiado', lembrancas });
    avisar(TEXTOS.mundo.copiado);
  } catch {
    const campo = Object.assign(document.createElement('textarea'), { value: url });
    campo.setAttribute('readonly', '');
    campo.style.position = 'fixed'; campo.style.opacity = '0';
    document.body.append(campo);
    campo.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    campo.remove();
    OPCOES.registrar('mundo_compartilhar', { resultado: ok ? 'link_copiado' : 'link_falhou', lembrancas });
    avisar(ok ? TEXTOS.mundo.copiado : TEXTOS.mundo.copiarFalhou);
  }
}

/* ==========================================================================
   8. INICIALIZAÇÃO — dados, estado inicial (link > salvo > entrada), cena e eventos.
   ========================================================================== */
async function usarDemonstracao() {
  dados = adaptadorDemonstracao();
  await dados.carregarIndice();
  estadoDados = 'pronto';
}
async function carregarDados() {
  estadoDados = 'carregando';
  if (location.protocol === 'file:') { await usarDemonstracao(); return; } // o navegador não deixa ler a pasta de dados a partir de file://
  const real = adaptadorCatalogo(CATALOGO.base);
  const perfis = contexto.carregar(); // sem o arquivo de contexto, o mundo segue com o cenário regional
  try {
    await Promise.all([real.carregarIndice(), perfis]);
    dados = real;
    estadoDados = 'pronto';
  } catch {
    estadoDados = 'erro';
  }
}

function aplicarEstadoInicial() {
  const link = lerLink();
  if (link.status === 'ok') {
    const faltando = [...link.invalidos];
    for (const p of PAPEIS) if (link.papeis[p] && !dados.lugar(link.papeis[p])) { faltando.push(p); link.papeis[p] = null; }
    const rotulos = PAPEIS.filter((p) => faltando.includes(p)).map((p) => TEXTOS.papeis[p].rotulo.toLowerCase());
    if (PAPEIS.some((p) => link.papeis[p])) {
      estado.papeis = link.papeis;
      estado.doLink = true;
      estado.lembrancas = link.lembrancas;
      estado.incluirLembrancas = Object.keys(link.lembrancas).length > 0;
      if (faltando.length) {
        estado.modo = 'montar';
        estado.passo = PAPEIS.findIndex((p) => faltando.includes(p));
        estado.aviso = { texto: TEXTOS.link.desconhecido(rotulos) };
      } else estado.modo = 'mundo';
      return;
    }
    estado.aviso = { texto: faltando.length ? TEXTOS.link.desconhecido(rotulos) : TEXTOS.link.vazio };
  } else if (link.status === 'versao' || link.status === 'vazio') {
    estado.aviso = { texto: TEXTOS.link[link.status] };
  }
  if (estado.aviso) sincronizarUrl(); // tira do endereço o link que não abriu
  const salvo = lerSalvo();
  if (salvo) {
    let perdeu = false;
    for (const p of PAPEIS) if (salvo.papeis[p] && !dados.lugar(salvo.papeis[p])) { salvo.papeis[p] = null; perdeu = true; }
    if (PAPEIS.some((p) => salvo.papeis[p])) {
      estado.papeis = salvo.papeis;
      estado.passo = salvo.passo;
      estado.lembrancas = salvo.lembrancas;
      estado.incluirLembrancas = salvo.incluirLembrancas;
      estado.modo = salvo.concluido && !perdeu ? 'mundo' : 'montar';
      if (perdeu && !estado.aviso) estado.aviso = { texto: TEXTOS.link.salvoInvalido };
      if (estado.modo === 'mundo') sincronizarUrl();
      return;
    }
  }
  estado.modo = estado.aviso ? 'montar' : 'intro';
}

function falhaCena(texto) {
  cenaFalhou = true;
  mundo = null;
  el.status.hidden = true;
  el.estaticoAviso.textContent = texto;
  el.estatico.hidden = false;
  el.canvas.hidden = true;
  render();
}
async function iniciarCena() {
  el.statusTexto.textContent = TEXTOS.cena.preparando;
  const demora = setTimeout(() => { el.statusTexto.textContent = 'A maquete está demorando para carregar…'; }, 9000);
  let T;
  try {
    if (OPCOES.carregarThree) T = await OPCOES.carregarThree();
    else {
      const [THREE, controles, utils] = await Promise.all([
        import('three'),
        import('three/addons/controls/OrbitControls.js'),
        import('three/addons/utils/BufferGeometryUtils.js'),
      ]);
      T = { THREE, OrbitControls: controles.OrbitControls, mergeGeometries: utils.mergeGeometries };
    }
  } catch {
    clearTimeout(demora);
    falhaCena(TEXTOS.cena.falhouCdn);
    return;
  }
  clearTimeout(demora);
  try {
    mundo = criarCena(T, el.canvas, {
      reduzMovimento: () => reduzMQ.matches,
      aoTocar,
      aoQuadro: (projecoes, descobertas) => { posicionarEtiquetas(projecoes); posicionarDescobertas(descobertas); },
      aoPerderContexto: () => falhaCena(TEXTOS.cena.falhou),
    });
  } catch {
    falhaCena(TEXTOS.cena.falhou);
    return;
  }
  el.status.hidden = true;
  document.fonts?.ready.then(() => mundo?.redesenharPlacas());
  render();
  agendarImagem();
}

function ligarEventos() {
  el.app.addEventListener('click', (e) => {
    const a = e.target instanceof Element ? e.target.closest('a.lugar-camisetas[href], a.lugar-foto[href], #cidade-cta[href], a.produto[href]') : null;
    if (!a) return;
    const lugarId = a.closest('[data-id]')?.dataset.id ?? estado.cidadeAberta;
    const produto = a.classList.contains('lugar-foto') || a.classList.contains('produto');
    OPCOES.registrar('mundo_camisetas', { lugar_id: lugarId ?? '', destino: produto ? 'produto' : 'cidade', bloco: a.closest('#painel-cidade') ? 'ficha' : 'resultado' });
  });
  el.btnComecar.addEventListener('click', comecar);
  el.btnVoltar.addEventListener('click', () => {
    estado.trocando = false; // sair da etapa sempre desiste da troca e mantém a cidade de antes
    if (estado.passo > 0) irParaPasso(estado.passo - 1);
    else { estado.modo = 'intro'; salvar(); render(); el.btnComecar.focus({ preventScroll: true }); }
  });
  el.btnAvancar.addEventListener('click', () => (estado.passo < 2 ? irParaPasso(estado.passo + 1) : concluir()));
  el.btnVerMundo.addEventListener('click', concluir);
  el.btnPular.addEventListener('click', () => (estado.passo < 2 ? irParaPasso(estado.passo + 1) : concluir()));
  el.btnCancelarTroca.addEventListener('click', () => { estado.trocando = false; el.campo.value = ''; render(); el.btnTrocar.focus(); });
  // a lupa e a dica do centro levam à busca
  el.campoBusca.addEventListener('click', (e) => { if (e.target !== el.campo) el.campo.focus(); });
  el.dica.addEventListener('click', () => el.campo.focus());
  el.btnDetalhes.addEventListener('click', () => {
    estado.detalhes = !estado.detalhes;
    render();
    if (estado.detalhes) $('detalhes-mundo').scrollIntoView({ block: 'nearest', behavior: reduzMQ.matches ? 'auto' : 'smooth' });
  });
  el.btnTrocar.addEventListener('click', () => { estado.trocando = true; render(); el.campo.focus(); });
  el.btnRemover.addEventListener('click', remover);
  el.campo.addEventListener('input', atualizarBusca);
  el.campo.addEventListener('focus', () => { el.montar.classList.add('buscando'); });
  el.campo.addEventListener('blur', () => { setTimeout(() => { if (document.activeElement !== el.campo && !resultados.length) el.montar.classList.remove('buscando'); }, 120); });
  el.campo.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); moverAtivo(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); moverAtivo(-1); }
    else if (e.key === 'Enter') { e.preventDefault(); if (resultados[ativo]) escolher(resultados[ativo].lugar.i, { teclado: true }); }
    else if (e.key === 'Escape') { if (el.campo.value) { e.preventDefault(); el.campo.value = ''; atualizarBusca(); } }
  });
  el.btnEditar.addEventListener('click', () => { editou(); irParaPasso(0); });
  el.btnRecomecar.addEventListener('click', () => el.dlgRecomecar.showModal());
  $('btn-recomecar-cancelar').addEventListener('click', () => el.dlgRecomecar.close());
  $('btn-recomecar-confirmar').addEventListener('click', () => {
    el.dlgRecomecar.close();
    estado.papeis = { origem: null, presente: null, coracao: null };
    estado.passo = 0;
    estado.modo = 'montar';
    estado.cidadeAberta = null;
    estado.trocando = false;
    estado.lembrancas = {};
    estado.incluirLembrancas = false;
    estado.sugestao = null;
    editou();
    apagarSalvo();
    cacheImagem = null;
    sincronizarUrl();
    render();
    avisar(TEXTOS.mundo.recomecado);
    el.campo.focus({ preventScroll: true });
  });
  el.btnCompartilhar.addEventListener('click', compartilhar);
  el.btnBaixar.addEventListener('click', baixarImagem);
  el.btnLink.addEventListener('click', copiarLink);
  $('dlg-baixar').addEventListener('click', () => { el.dlgCompartilhar.close(); baixarImagem(); });
  $('dlg-link').addEventListener('click', () => { el.dlgCompartilhar.close(); copiarLink(); });
  $('dlg-fechar').addEventListener('click', () => el.dlgCompartilhar.close());
  el.btnFecharCidade.addEventListener('click', fecharCidade);
  el.btnFecharBalao.addEventListener('click', () => fecharDescoberta());
  el.btnBalaoCidade.addEventListener('click', () => {
    const aberta = estado.descobertaAberta;
    if (!aberta) return;
    fecharDescoberta({ semFoco: true });
    abrirCidade(aberta.id, { referencia: aberta.referencia });
  });
  for (const campo of [el.lembrancaMontar, el.lembrancaFicha]) {
    campo.addEventListener('input', () => aoDigitarLembranca(campo));
    campo.addEventListener('change', () => { campo.value = estado.lembrancas[campo.dataset.id] ?? ''; contarLembranca(campo); });
    campo.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); campo.blur(); } });
  }
  el.incluirCheck.addEventListener('change', () => {
    estado.incluirLembrancas = el.incluirCheck.checked;
    editou();
    cacheImagem = null;
    salvar();
    sincronizarUrl();
    agendarImagem();
  });
  $('btn-girar-esq').addEventListener('click', () => mundo?.girar(0.5));
  $('btn-girar-dir').addEventListener('click', () => mundo?.girar(-0.5));
  $('btn-visao-inicial').addEventListener('click', () => { if (estado.cidadeAberta) fecharCidade(); else mundo?.visaoInicial(); });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || document.querySelector('dialog[open]')) return;
    if (estado.descobertaAberta) { e.preventDefault(); fecharDescoberta(); return; } // primeiro o balão, depois a ficha
    if (estado.cidadeAberta) { e.preventDefault(); fecharCidade(); }
  });
  el.palco.addEventListener('keydown', (e) => {
    if (e.target !== el.palco || !mundo) return;
    const acoes = {
      ArrowLeft: () => mundo.girar(0.35), ArrowRight: () => mundo.girar(-0.35), ArrowUp: () => mundo.inclinar(-0.12), ArrowDown: () => mundo.inclinar(0.12),
      '+': () => mundo.aproximar(0.85), '=': () => mundo.aproximar(0.85), '-': () => mundo.aproximar(1.18), Home: () => mundo.visaoInicial(), 0: () => mundo.visaoInicial(),
    };
    if (acoes[e.key]) { e.preventDefault(); acoes[e.key](); }
  });
  // A roda do mouse rola a página, não a maquete; o zoom fica com o gesto de pinça (que chega com ctrlKey) e com os botões/teclado.
  el.palco.addEventListener('wheel', (e) => { if (!e.ctrlKey && !e.metaKey) e.stopPropagation(); }, { capture: true });
  reduzMQ.addEventListener('change', (e) => mundo?.definirMovimentoReduzido(e.matches));
  largoMQ.addEventListener('change', agendarArea);
  window.addEventListener('resize', agendarArea);
  const observador = new ResizeObserver(agendarArea);
  for (const painel of [el.intro, el.montar, el.mundoP, el.cidade]) observador.observe(painel);
}

/** Contexto de chegada (?entrada=home|cidade|rodape, ?cidade=<id>): só dados fechados e validados; nunca vira papel sozinho. */
function lerEntrada() {
  let p;
  try { p = new URLSearchParams(consultaInicial()); } catch { return; }
  const entrada = p.get('entrada');
  if (OPCOES.entrada === null && ENTRADA.origens.includes(entrada)) OPCOES.entrada = entrada;
  const cidade = p.get('cidade');
  if (OPCOES.cidadeSugerida === null && cidade && cidade.length <= 70 && ID_VALIDO.test(cidade)) OPCOES.cidadeSugerida = cidade;
}
/** Um mundo de link prevalece; um lugar já no mundo não é sugerido de novo; sem nada salvo, a pessoa começa pela sugestão. */
function aplicarSugestao() {
  const id = OPCOES.cidadeSugerida;
  if (!id || estado.doLink || !dados.lugar(id) || papeisDe(id).length) return;
  estado.sugestao = id;
  if (estado.modo === 'intro') { estado.modo = 'montar'; estado.passo = 0; }
}

async function iniciar() {
  preencherTextos();
  if (OPCOES.lojaHref && el.marca) el.marca.href = OPCOES.lojaHref;
  lerEntrada();
  ligarEventos();
  const cena = iniciarCena();
  await carregarDados();
  aplicarEstadoInicial();
  aplicarSugestao();
  OPCOES.registrar('mundo_entrada', { origem: OPCOES.entrada ?? (estado.doLink ? 'link' : 'direto') });
  sincronizarUrl();
  render();
  if (estado.modo === 'mundo') agendarImagem();
  await cena;
}
/** Lê as famílias tipográficas das variáveis CSS da raiz (na loja, as de next/font). Sem elas, fica o padrão de FONTES. */
function lerFontes(raiz) {
  const estilo = getComputedStyle(raiz);
  for (const [chave, variavel] of [['display', '--display'], ['body', '--body'], ['serif', '--serif']]) {
    const valor = estilo.getPropertyValue(variavel).trim();
    if (valor) FONTES[chave] = valor;
  }
}

let iniciado = false;
/**
 * Liga a experiência ao DOM já presente (MundoMarkup). Chamado uma vez por página; chamadas seguintes não fazem nada.
 * opcoes: { dados: { base, indice, lugar(chave) }, contexto, registrar(evento, campos), entrada, cidadeSugerida, carregarThree }.
 */
export async function iniciarMundo(opcoes = {}) {
  if (iniciado) return;
  iniciado = true;
  if (opcoes.dados) Object.assign(CATALOGO, opcoes.dados);
  if (opcoes.contexto) CONTEXTO.arquivo = opcoes.contexto;
  for (const k of ['registrar', 'entrada', 'cidadeSugerida', 'carregarThree', 'urlNaBarra', 'lojaHref', 'consulta']) if (opcoes[k] !== undefined) OPCOES[k] = opcoes[k];
  lerFontes(el.app);
  await iniciar();
}

// Diagnóstico só de leitura, sem dados pessoais (o QA mede memória da cena por aqui).
window.__meuPequenoMundo = {
  memoria: () => mundo?.memoria() ?? null,
  estado: () => JSON.parse(JSON.stringify({ modo: estado.modo, papeis: estado.papeis, cidadeAberta: estado.cidadeAberta, descobertaAberta: estado.descobertaAberta, detalhes: estado.detalhes })),
  marcoNaTela: (id, referencia) => mundo?.marcoNaTela(id, referencia) ?? null,
};
