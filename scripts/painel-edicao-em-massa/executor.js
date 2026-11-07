// Executor da EDIÇÃO EM MASSA do painel INK (Claude in Chrome). Injetado numa aba do painel já autenticada, na loja Use Origens.
// Doc: docs/ink/painel-manual.md (§3)
//
// Repete o que a pessoa faz na tela: seleciona um grupo de produtos (checkboxes da lista) → "Modificar em massa" → preenche os campos
// → "Salvar". Cada item da fila é um grupo: { key, ids: ['3827655', …], campos: { 'product[tags]': 'a,b,c', 'product[tags_mode]': 'replace' } }.
// O formulário enviado é o do próprio painel (FormData do form bulk_update), com SÓ os campos do item trocados. Campo vazio no
// formulário = o painel não mexe naquele dado do produto (medido em 06/11: nome, preço, promoção e descrição ficaram intactos).
//
// Fatos do painel (medidos em 06/11/2026):
//   - POST /user/dashboard/products_v2/mass_edit/select_products  {product_ids:[…]}  SUBSTITUI a seleção inteira (não soma);
//   - a seleção fica no servidor, na sessão: GET /mass_edit?per_page=50 lista os selecionados (forms …/select_products/<id>);
//   - remover um a um (DELETE …/select_products/<id>) é lento (~2 s cada, em série no servidor) e não é necessário;
//   - o "Salvar" é POST …/mass_edit/bulk_update (_method=put) e responde redirect para /products_v2 quando dá certo.
//
// Travas (qualquer uma falha → a fila PARA naquele grupo, nada é salvo nele):
//   - a seleção que o painel mostra depois de selecionar é exatamente o conjunto de ids do grupo (no máximo 50 por grupo);
//   - só campos da lista CAMPOS podem ser trocados; nome, descrição, preço e etiqueta só com permitir: [...] explícito no iniciar;
//   - o bulk_update tem de responder redirect (opaqueredirect). Qualquer outra resposta = erro.
//
// Uso (javascript_tool), sempre numa aba DEDICADA (navegar ou fechar a aba mata a fila; a seleção do painel é uma só, então nunca
// rode duas filas ao mesmo tempo, nem edite em massa à mão enquanto a fila roda):
//   1. abra https://reserva.ink/user/dashboard/products_v2/mass_edit e cole este arquivo;
//   2. carregue a fila: __massa.carregar([...])  — ou, para filas grandes, __massa.campoArquivo() e envie o JSON pelo file_upload;
//   3. __massa.iniciar()  (ou __massa.iniciar({ permitir: ['product[price]'] }) quando a mudança for de preço);
//   4. consulte __massa.estado(); __massa.interromper() para entre um grupo e outro.
// O progresso (chaves feitas) fica em localStorage['__massa'] (sem nenhum dado de sessão). Depois confira pela API
// (npm run painel:massa -- conferir …): o executor só sabe que o painel aceitou, não que gravou.
(() => {
  if (window.__massa?.rodando) return 'já rodando';
  const BASE = '/user/dashboard/products_v2/mass_edit';
  const CAMPOS = ['product[tags]', 'product[tags_mode]'];
  const SENSIVEIS = ['product[name]', 'product[description]', 'product[enable_description]', 'product[price]', 'product[promotion_label]', 'product[enable_promotion_label]'];
  const PAUSA_MS = 700;
  const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
  const token = () => document.querySelector('meta[name=csrf-token]').content;
  const salvos = (() => { try { return JSON.parse(localStorage.getItem('__massa') || '[]'); } catch { return []; } })();
  const st = (window.__massa = window.__massa || { fila: [], feitas: salvos, erros: [], rodando: false, parar: false });
  const gravar = () => { try { localStorage.setItem('__massa', JSON.stringify(st.feitas)); } catch {} };

  async function paginaSelecao() {
    const h = await (await fetch(`${BASE}?per_page=50`, { credentials: 'same-origin' })).text();
    const d = new DOMParser().parseFromString(h, 'text/html');
    const ids = [...d.forms].map((f) => (f.getAttribute('action') || '').match(/select_products\/(\d+)/)).filter(Boolean).map((m) => m[1]);
    return { ids, form: [...d.forms].find((f) => (f.getAttribute('action') || '').includes('bulk_update')) };
  }

  async function um(g, permitidos) {
    if (!g.ids.length || g.ids.length > 50) throw new Error(`${g.key}: grupo com ${g.ids.length} ids (1 a 50)`);
    for (const k of Object.keys(g.campos)) if (!permitidos.includes(k)) throw new Error(`${g.key}: campo ${k} não permitido`);
    const r = await fetch(`${BASE}/select_products`, {
      method: 'POST', credentials: 'same-origin', body: JSON.stringify({ product_ids: g.ids }),
      headers: { 'X-CSRF-Token': token(), 'Content-Type': 'application/json', Accept: 'text/vnd.turbo-stream.html, text/html, application/json' },
    });
    if (!r.ok) throw new Error(`${g.key}: seleção respondeu ${r.status}`);
    const p = await paginaSelecao();
    if (p.ids.sort().join(',') !== [...g.ids].sort().join(',')) throw new Error(`${g.key}: seleção do painel diferente (${p.ids.length} vs ${g.ids.length})`);
    if (!p.form) throw new Error(`${g.key}: formulário de edição em massa não encontrado (sessão expirada?)`);
    const fd = new FormData(p.form);
    fd.set('authenticity_token', token());
    for (const [k, v] of Object.entries(g.campos)) fd.set(k, v);
    // Campo sensível não pedido tem de ir vazio, senão o painel sobrescreveria todos os produtos do grupo.
    for (const k of SENSIVEIS) if (!(k in g.campos) && fd.get(k) && !/enable_|_destroy/.test(k)) throw new Error(`${g.key}: ${k} veio preenchido no formulário`);
    const u = await fetch(`${BASE}/bulk_update`, { method: 'POST', credentials: 'same-origin', body: fd, redirect: 'manual', headers: { Accept: 'text/html' } });
    if (u.type !== 'opaqueredirect') throw new Error(`${g.key}: Salvar não redirecionou (${u.status})`);
  }

  st.carregar = (itens) => { const novos = itens.filter((g) => !st.feitas.includes(g.key)); st.fila.push(...novos); return `${novos.length} na fila (${itens.length - novos.length} já feitos)`; };
  st.campoArquivo = () => {
    let inp = document.getElementById('__massa_fila');
    if (!inp) {
      inp = document.createElement('input');
      inp.type = 'file'; inp.id = '__massa_fila'; inp.setAttribute('aria-label', 'fila da edição em massa');
      inp.style.cssText = 'position:fixed;top:4px;left:4px;z-index:99999';
      inp.addEventListener('change', async () => { st.ultimoArquivo = st.carregar(JSON.parse(await inp.files[0].text())); inp.style.display = 'none'; });
      document.body.appendChild(inp);
    }
    inp.style.display = '';
    return 'campo pronto: use find "fila da edição em massa" + file_upload';
  };
  st.iniciar = (opcoes = {}) => {
    if (st.rodando) return 'já rodando';
    const permitidos = [...CAMPOS, ...(opcoes.permitir || [])];
    st.rodando = true; st.parar = false;
    document.title = 'NÃO MEXER — edição em massa';
    (async () => {
      while (st.fila.length && !st.parar) {
        const g = st.fila[0];
        try { await um(g, permitidos); st.feitas.push(g.key); st.fila.shift(); gravar(); }
        catch (e) { st.erros.push(String(e.message)); break; }
        await esperar(PAUSA_MS);
      }
      st.rodando = false;
    })();
    return 'iniciado';
  };
  st.interromper = () => { st.parar = true; return 'para depois do grupo atual'; };
  st.estado = () => JSON.stringify({ rodando: st.rodando, fila: st.fila.length, feitas: st.feitas.length, ultimas: st.feitas.slice(-3), erros: st.erros.slice(-3) });
  st.zerar = () => { if (st.rodando) return 'rodando'; st.feitas = []; st.erros = []; st.fila = []; gravar(); return 'zerado'; };
  return 'executor pronto';
})();
