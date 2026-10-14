/**
 * Meu Pequeno Mundo — dados (seção 3): busca, adaptadores do catálogo e da demonstração, contexto curado das cidades e distância.
 * Tudo o que vem de arquivo ou do servidor é conferido aqui antes de chegar à interface ou à cena.
 */
import { AMBIENTES, CATALOGO, CONTEXTO, ESTADOS, MODULOS, PAISAGENS, REGIOES, TEXTOS } from './config.js';
/* ==========================================================================
   3. DADOS — adaptador do catálogo. A cena não sabe de onde os dados vêm.
   Contrato: carregarIndice() · buscar(q) · lugar(id) · produtos(id) → { url, produtos[{ familia, nome, imagem, url }] }
   ========================================================================== */

/** Mesma normalização do storefront (src/lib/geo/text.ts): minúsculas, sem acento, espaços simples. */
export function normalizar(texto) {
  return String(texto)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’'`´]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Ranking do storefront (src/lib/search/rank.ts), só para cidades: nome exato > apelido > prefixo > prefixo de palavra > trecho. Sem busca aproximada. */
export function pontuar(p, q) {
  if (p.chave === q) return 100;
  if (p.apelidos.includes(q)) return 95;
  if (p.chave.startsWith(q)) return p.apelidos.length > 0 ? 88 : 80;
  if (p.apelidos.some((a) => a.startsWith(q))) return 75;
  if (q.length >= 2 && p.palavras.some((w) => w.startsWith(q))) return 55;
  if (q.length >= 3 && p.chave.includes(q)) return 30;
  return 0;
}

export const ID_VALIDO = /^(\d{7}|df-ra:[a-z0-9-]{1,60})$/;
export const chaveArquivo = (id) => id.replace(/[^a-z0-9-]/gi, '-'); // igual a `fileKey` em scripts/mini-world-export.mts

/** Só vira link ou imagem um endereço https de um host conhecido, ou um caminho da própria loja onde a página roda (mesma origem). */
export function urlSegura(valor, hosts) {
  try {
    if (typeof valor !== 'string' || !valor) return null;
    const u = new URL(valor, location.href);
    if (u.origin === location.origin && (location.protocol === 'https:' || location.protocol === 'http:')) return u.toString();
    return u.protocol === 'https:' && hosts.includes(u.host) ? u.toString() : null;
  } catch {
    return null;
  }
}

export function lugarValido(l) {
  return l && typeof l === 'object' && typeof l.i === 'string' && ID_VALIDO.test(l.i) && typeof l.n === 'string' && l.n.length > 0 &&
    l.n.length <= 80 && typeof l.u === 'string' && l.u in ESTADOS && l.r in REGIOES;
}

export function prepararIndice(lugares) {
  const porId = new Map();
  const preparados = [];
  for (const l of lugares) {
    if (!lugarValido(l) || porId.has(l.i)) continue;
    const lugar = { i: l.i, n: l.n, u: l.u, r: l.r, s: typeof l.s === 'string' ? l.s : '', m: typeof l.m === 'string' ? l.m : '', t: l.t === 'ra' ? 'ra' : undefined, c: l.c === 1 };
    porId.set(lugar.i, lugar);
    const chave = normalizar(lugar.n);
    preparados.push({ lugar, chave, palavras: chave.split(' '), apelidos: Array.isArray(l.a) ? l.a.filter((a) => typeof a === 'string').map(normalizar) : [] });
  }
  return { porId, preparados };
}

export function buscarNoIndice(indice, consulta, limite = 8) {
  const q = normalizar(consulta);
  if (!q) return [];
  const achados = [];
  for (const p of indice.preparados) {
    const nota = pontuar(p, q);
    if (nota > 0) achados.push({ lugar: p.lugar, nota });
  }
  return achados
    .sort((a, b) => b.nota - a.nota || a.lugar.n.length - b.lugar.n.length || a.lugar.n.localeCompare(b.lugar.n, 'pt-BR') || a.lugar.u.localeCompare(b.lugar.u))
    .slice(0, limite);
}

/** Catálogo real: índice compacto + um arquivo por lugar, buscado só quando a pessoa escolhe aquele lugar. */
export function adaptadorCatalogo(base) {
  let indice = null;
  const produtosCache = new Map();
  return {
    modo: 'catalogo',
    async carregarIndice() {
      const resposta = await fetch(new URL(CATALOGO.indice, new URL(base, location.href)), { cache: 'no-cache' });
      if (!resposta.ok) throw new Error(`indice ${resposta.status}`);
      const dados = await resposta.json();
      if (!dados || dados.v !== 1 || !Array.isArray(dados.lugares)) throw new Error('indice: formato desconhecido');
      indice = prepararIndice(dados.lugares);
      if (indice.porId.size === 0) throw new Error('indice vazio');
    },
    buscar: (q, limite) => buscarNoIndice(indice, q, limite),
    lugar: (id) => indice?.porId.get(id) ?? null,
    async produtos(id) {
      if (produtosCache.has(id)) return produtosCache.get(id);
      const pedido = (async () => {
        const resposta = await fetch(new URL(CATALOGO.lugar(chaveArquivo(id)), new URL(base, location.href)));
        if (resposta.status === 404) return { url: null, produtos: [] };
        if (!resposta.ok) throw new Error(`lugar ${resposta.status}`);
        const d = await resposta.json();
        if (!d || d.v !== 1 || d.i !== id) throw new Error('lugar: formato desconhecido');
        const produtos = (Array.isArray(d.produtos) ? d.produtos : [])
          .map((p) => ({
            familia: typeof p.f === 'string' ? p.f : '',
            nome: typeof p.nome === 'string' ? p.nome : '',
            imagem: urlSegura(p.img, CATALOGO.hostsImagem),
            url: urlSegura(p.url, CATALOGO.hostsLink),
          }))
          .filter((p) => p.nome && p.url);
        return { url: urlSegura(d.url, CATALOGO.hostsLink), produtos, conectado: true, ...referenciaIbge(d) };
      })();
      produtosCache.set(id, pedido);
      pedido.catch(() => produtosCache.delete(id));
      return pedido;
    },
  };
}

/**
 * DEMONSTRAÇÃO — usada só quando o catálogo não está acessível (por exemplo, abrindo o arquivo direto do disco).
 * Exemplos de interação: não confirmam disponibilidade de produtos. Os campos de catálogo ficam vazios de propósito.
 */
export const DEMONSTRACAO = [
  { i: '4205407', n: 'Florianópolis', u: 'SC', r: 'sul', s: 'florianopolis', m: 'Grande Florianópolis', a: ['floripa'], c: 1 },
  { i: '4301602', n: 'Bagé', u: 'RS', r: 'sul', s: 'bage', m: 'Sudoeste Rio-grandense' },
  { i: '1302603', n: 'Manaus', u: 'AM', r: 'norte', s: 'manaus', m: 'Centro Amazonense', c: 1 },
  { i: '1501402', n: 'Belém', u: 'PA', r: 'norte', s: 'belem', m: 'Metropolitana de Belém', c: 1 },
  { i: '5208707', n: 'Goiânia', u: 'GO', r: 'centro-oeste', s: 'goiania', m: 'Centro Goiano', c: 1 },
  { i: '5002704', n: 'Campo Grande', u: 'MS', r: 'centro-oeste', s: 'campo-grande', m: 'Centro Norte de Mato Grosso do Sul', c: 1 },
];

export function adaptadorDemonstracao() {
  let indice = null;
  return {
    modo: 'demonstracao',
    async carregarIndice() { indice = prepararIndice(DEMONSTRACAO); },
    buscar: (q, limite) => buscarNoIndice(indice, q, limite),
    lugar: (id) => indice?.porId.get(id) ?? null,
    async produtos() { return { url: null, produtos: [], conectado: false }; },
  };
}

/* ----- números e textos vindos de arquivo: só entram depois de conferidos ----- */
export const limparTexto = (v, max = 600) => (typeof v === 'string' ? v.normalize('NFC').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '');
export const numeroEntre = (v, min, max) => (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : null);
export const COR_VALIDA = /^#[0-9a-f]{6}$/i;
/** Ponto de referência (sede municipal ou da Região Administrativa) e divisão regional de 2017, do arquivo de cada lugar (IBGE). */
export function referenciaIbge(d) {
  const lat = numeroEntre(d?.sede?.lat, -34, 6), lon = numeroEntre(d?.sede?.lon, -75, -28);
  return {
    sede: lat !== null && lon !== null ? { lat, lon, tipo: d.sede.tipo === 'ra' ? 'ra' : 'sede' } : null,
    rgi: limparTexto(d?.rgi, 80) || null,
    rgint: limparTexto(d?.rgint, 80) || null,
  };
}

/** Distância geodésica aproximada (fórmula de haversine, raio médio da Terra) entre dois pontos { lat, lon }, em km. */
export function distanciaKm(a, b) {
  const rad = Math.PI / 180, R = 6371.0088;
  const h = Math.sin(((b.lat - a.lat) * rad) / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(((b.lon - a.lon) * rad) / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
/** Arredonda para não sugerir uma precisão que a medida em linha reta entre sedes não tem. */
export const arredondarKm = (km) => (km < 20 ? Math.max(1, Math.round(km)) : km < 200 ? Math.round(km / 5) * 5 : Math.round(km / 10) * 10);

/**
 * CONTEXTO DAS CIDADES — perfis curados (contexto/perfis-cidades.json). Carregado uma vez; uma cidade sem perfil segue com o
 * cenário regional e os dados do IBGE. Tudo é conferido aqui: textos viram texto puro, módulos da cena só de uma lista fechada,
 * referência sem fonte não entra, e a cena recebe apenas o perfil visual (nunca o texto).
 */
export function normalizarPerfil(id, c, fontes) {
  if (!c || typeof c !== 'object' || c.identidade?.id !== id) return null;
  const comFonte = (lista) => (Array.isArray(lista) ? lista.filter((f) => typeof f === 'string' && fontes[f]) : []);
  const ct = c.conteudo ?? {};
  const referencias = (Array.isArray(ct.referencias) ? ct.referencias : []).slice(0, 3).map((r) => ({
    id: limparTexto(r?.id, 60),
    tipo: TEXTOS.tiposReferencia[r?.tipo] ? r.tipo : 'cultura',
    titulo: limparTexto(r?.titulo, 80),
    texto: limparTexto(r?.texto, 420),
    curto: limparTexto(r?.curto, 200), // uma ou duas frases para o cartão do celular; o texto completo fica na ficha
    fontes: comFonte(r?.fontes),
    descoberta: MODULOS.marcos.includes(r?.descoberta?.modulo) ? { modulo: r.descoberta.modulo, nota: limparTexto(r.descoberta.nota, 140) } : null,
  })).filter((r) => r.id && r.titulo && r.texto && r.fontes.length);
  const g = c.geografia ?? {};
  const lat = numeroEntre(g.sede?.lat, -34, 6), lon = numeroEntre(g.sede?.lon, -75, -28);
  const censo = g.populacao?.censo;
  const v = c.visual ?? {};
  const cores = {};
  for (const [k, valor] of Object.entries(v.cores ?? {})) {
    if (!['grama', 'areia', 'fundo', 'caminho', 'terra'].includes(k)) continue;
    if (typeof valor === 'string' && COR_VALIDA.test(valor)) cores[k] = valor;
    else if (Array.isArray(valor) && valor.length === 2 && valor.every((x) => COR_VALIDA.test(x))) cores[k] = [...valor];
  }
  const inteiro = (x, max) => (Number.isInteger(x) && x >= 0 && x <= max ? x : null);
  const visual = {
    ambientes: (Array.isArray(v.ambientes) ? v.ambientes : []).filter((a) => AMBIENTES[a]),
    rotulo: limparTexto(v.rotulo, 90),
    base: PAISAGENS[v.base] ? v.base : 'interior',
    cores,
    relevo: MODULOS.relevo.includes(v.relevo?.modulo) ? { modulo: v.relevo.modulo, altura: numeroEntre(v.relevo.altura, 0.3, 1.6) ?? 1 } : null,
    agua: MODULOS.agua.includes(v.agua?.modulo) ? { modulo: v.agua.modulo, largura: numeroEntre(v.agua.largura, 0.1, 0.6), direcao: numeroEntre(v.agua.direcao, -3.2, 3.2) } : null,
    vegetacao: (Array.isArray(v.vegetacao) ? v.vegetacao : []).filter((x) => Array.isArray(x) && MODULOS.vegetacao.includes(x[0]) && inteiro(x[1], 40) !== null).map(([t, q]) => [t, q]),
    construcoes: {
      estilo: MODULOS.construcoes.includes(v.construcoes?.estilo) ? v.construcoes.estilo : 'colonial',
      casas: inteiro(v.construcoes?.casas, 14) ?? 4,
      predios: inteiro(v.construcoes?.predios, 6) ?? 0,
    },
    extras: (Array.isArray(v.extras) ? v.extras : []).filter((x) => MODULOS.extras.includes(x)),
    marcos: (Array.isArray(v.marcos) ? v.marcos : [])
      .filter((m) => MODULOS.marcos.includes(m?.modulo) && referencias.some((r) => r.id === m.referencia && r.descoberta?.modulo === m.modulo))
      .slice(0, 2)
      .map((m) => ({ modulo: m.modulo, referencia: m.referencia })),
  };
  if (!visual.vegetacao.length) visual.vegetacao = null;
  return {
    id,
    cobertura: c.cobertura === 'completo' ? 'completo' : 'parcial',
    frase: limparTexto(ct.frase, 160),
    resumo: limparTexto(ct.resumo, 600),
    fontesResumo: comFonte(ct.fontesResumo),
    referencias,
    curiosidades: (Array.isArray(ct.curiosidades) ? ct.curiosidades : []).map((x) => ({ texto: limparTexto(x?.texto, 400), fontes: comFonte(x?.fontes) })).filter((x) => x.texto && x.fontes.length).slice(0, 2),
    gentilico: ct.gentilico && limparTexto(ct.gentilico.oficial, 60) && comFonte(ct.gentilico.fontes).length
      ? { oficial: limparTexto(ct.gentilico.oficial, 60), variantes: (ct.gentilico.variantes ?? []).map((x) => limparTexto(x, 60)).filter(Boolean), fontes: comFonte(ct.gentilico.fontes) }
      : null,
    sede: lat !== null && lon !== null && comFonte(g.sede.fontes).length ? { lat, lon, fontes: comFonte(g.sede.fontes) } : null,
    populacao: censo && Number.isInteger(censo.valor) && Number.isInteger(censo.ano) && comFonte(censo.fontes).length ? { valor: censo.valor, ano: censo.ano, tipo: 'censo', fontes: comFonte(censo.fontes) } : null,
    area: numeroEntre(g.area?.km2, 0.01, 2e6) !== null && Number.isInteger(g.area.ano) && comFonte(g.area.fontes).length ? { km2: g.area.km2, ano: g.area.ano, fontes: comFonte(g.area.fontes) } : null,
    regioes: g.regioes && comFonte(g.regioes.fontes).length
      ? Object.fromEntries(['grandeRegiao', 'imediata', 'intermediaria', 'mesorregiao', 'microrregiao'].map((k) => [k, limparTexto(g.regioes[k], 80) || null]).concat([['fontes', comFonte(g.regioes.fontes)]]))
      : null,
    visual,
    revisao: c.revisao ? { em: limparTexto(c.revisao.em, 20) } : null,
  };
}
export function adaptadorContexto() {
  let perfis = new Map();
  let fontes = {};
  let carga = null;
  return {
    carregar() {
      carga ??= (async () => {
        const resposta = await fetch(new URL(CONTEXTO.arquivo, location.href), { cache: 'no-cache' });
        if (!resposta.ok) throw new Error(`contexto ${resposta.status}`);
        const d = await resposta.json();
        if (!d || d.v !== 1 || typeof d.cidades !== 'object' || typeof d.fontes !== 'object') throw new Error('contexto: formato desconhecido');
        const f = {};
        for (const [chave, x] of Object.entries(d.fontes)) {
          const url = urlFonte(x?.url);
          const titulo = limparTexto(x?.titulo, 200);
          if (url && titulo) f[chave] = { titulo, publicador: limparTexto(x.publicador, 120), url, referencia: limparTexto(x.referencia, 120), consultadoEm: limparTexto(x.consultadoEm, 20) };
        }
        const p = new Map();
        for (const [id, c] of Object.entries(d.cidades)) {
          if (!ID_VALIDO.test(id)) continue;
          const perfil = normalizarPerfil(id, c, f);
          if (perfil) p.set(id, perfil);
        }
        fontes = f;
        perfis = p;
      })().catch(() => { perfis = new Map(); }); // sem contexto, o mundo funciona com o cenário regional
      return carga;
    },
    perfil: (id) => perfis.get(id) ?? null,
    fonte: (chave) => fontes[chave] ?? null,
    get total() { return perfis.size; },
  };
}
export const urlFonte = (valor) => { try { const u = new URL(String(valor)); return u.protocol === 'https:' ? u.href : null; } catch { return null; } };
export const contexto = adaptadorContexto();

