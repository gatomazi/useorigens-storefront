// Executor da vitrine de mockup no PAINEL INK (Claude in Chrome). Injetado na aba do painel já autenticada, na loja Use Sul.
// Doc: docs/migracao-ink/origens-mockups-painel-execucao.md
//
// Para cada id: abre /user/dashboard/products_v2/<id>/edit num iframe da MESMA origem e repete o que a pessoa faz na tela — escolhe o
// mockup "camiseta dobrada" (rádio showcase 114, cor Preta, padrão da tela) e clica em "Salvar Produto". Nada além disso: não mexe em
// estampa, variantes, nome, preço, categorias nem em "Disponibilizar na loja".
//
// Travas, antes de clicar (qualquer uma falha → o id é registrado como bloqueado/erro e NADA é salvo):
//   - o formulário aberto é do id pedido (action termina em /<id>), tipo 1 (Camiseta), "Disponibilizar na loja" DESMARCADO;
//   - o mockup 114 existe e já mostra a estampa. O painel compõe a estampa sobre os mockups NO NAVEGADOR, aos poucos (as miniaturas
//     viram `blob:` uma a uma; medido em 05/10: ~1,5 min até a do 114). Antes disso o clique abre o alerta "você precisa aplicar uma
//     estampa na etapa anterior". Espera até 4 min pelo `blob:`;
//   - depois do clique, showcase_image_id = 114.
// alert/confirm do painel são interceptados no iframe (registrados, confirm = Cancelar) para nunca travar a aba.
//
// Uso (javascript_tool): cole este arquivo; depois  __mockups.iniciar(['4951228', …])  e consulte  __mockups.estado()  periodicamente.
// O resultado de cada id fica em __mockups.resultados e em localStorage['__mockups'] (sem nenhum dado de sessão).
(() => {
  if (window.__mockups?.rodando) return 'já rodando';
  const RADIO = 'radio-showcase-input-114';
  const ESPERA_MOCKUP_MS = 240000;
  const TETO_PRODUTO_MS = 600000; // watchdog por produto
  const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
  const salvos = (() => { try { return JSON.parse(localStorage.getItem('__mockups') || '{}'); } catch { return {}; } })();
  const st = (window.__mockups = window.__mockups || { resultados: salvos, fila: [], rodando: false, parar: false, atual: null });

  function carregar(iframe, url, ms = 90000) {
    return new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error(`timeout carregando ${url}`)), ms);
      iframe.onload = () => { clearTimeout(t); res(); };
      iframe.src = url;
    });
  }
  function proximoLoad(iframe, ms = 120000) {
    return new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error('timeout esperando o salvamento')), ms);
      iframe.onload = () => { clearTimeout(t); res(); };
    });
  }
  function gravar() { try { localStorage.setItem('__mockups', JSON.stringify(st.resultados)); } catch {} }

  async function um(iframe, id) {
    const r = { id, em: new Date().toISOString(), alertas: [] };
    await carregar(iframe, `/user/dashboard/products_v2/${id}/edit`);
    const w = iframe.contentWindow, d = iframe.contentDocument;
    w.alert = (m) => r.alertas.push(String(m));
    w.confirm = (m) => { r.alertas.push(`confirm: ${m}`); return false; };
    w.onbeforeunload = null;
    // O conteúdo da edição é renderizado DEPOIS do evento load (medido em 05/10 com 6 iframes e a aba em segundo plano: o load chegava
    // sem o formulário). Espera o formulário aparecer em vez de tratar como erro.
    let form;
    for (let i = 0; i < 45 && !form; i++) {
      form = [...d.forms].find((f) => /products_v2\/\d+$/.test(f.getAttribute('action') || ''));
      if (!form) await esperar(2000);
    }
    if (!form || !form.getAttribute('action').endsWith(`/${id}`)) return { ...r, resultado: 'erro', motivo: `formulário não é do id ${id} (${form?.getAttribute('action')})`, url: w.location.pathname };
    const val = (n) => form.querySelector(`[name="${n}"]`)?.value;
    const vis = form.querySelector('input[type=checkbox][name="product_v2[visible_in_store]"]');
    r.antes = { nome: val('product_v2[name]'), valor: d.getElementById('product_price')?.value, promo: d.getElementById('product_promotion_label')?.value, visivel: vis?.checked, tipo: val('product_v2[product_type_id]'), showcase: val('product_v2[showcase_image_id]') };
    if (r.antes.tipo !== '1') return { ...r, resultado: 'bloqueado', motivo: `tipo ${r.antes.tipo}` };
    if (!vis || vis.checked) return { ...r, resultado: 'bloqueado', motivo: '"Disponibilizar na loja" marcado (produto visível)' };
    // A estampa é composta no navegador: a miniatura do 114 vira `blob:` quando fica pronta.
    let radio, src = '';
    const t0 = Date.now();
    while (Date.now() - t0 < ESPERA_MOCKUP_MS) {
      radio = d.getElementById(RADIO);
      const img = radio && (radio.closest('label') || radio.parentElement).querySelector('img');
      src = img?.getAttribute('src') || '';
      if (radio && src.startsWith('blob:')) break;
      await esperar(2000);
    }
    r.esperaMockupS = Math.round((Date.now() - t0) / 1000);
    if (!radio) return { ...r, resultado: 'bloqueado', motivo: 'mockup 114 (camiseta dobrada) não existe na tela' };
    if (!src.startsWith('blob:')) return { ...r, resultado: 'bloqueado', motivo: `mockup 114 sem estampa após ${ESPERA_MOCKUP_MS / 60000} min (painel não compôs a estampa na Clássica Preta)` };
    radio.click();
    await esperar(600);
    if (r.alertas.length) return { ...r, resultado: 'bloqueado', motivo: `alerta do painel: ${r.alertas.join(' | ')}` };
    if (val('product_v2[showcase_image_id]') !== '114') return { ...r, resultado: 'erro', motivo: `showcase_image_id = ${val('product_v2[showcase_image_id]')} depois do clique` };
    const salvar = [...d.querySelectorAll('button')].find((b) => /Salvar Produto/i.test(b.innerText) && b.form === form);
    if (!salvar) return { ...r, resultado: 'erro', motivo: 'botão Salvar Produto não encontrado' };
    const recarregou = proximoLoad(iframe);
    salvar.click();
    await recarregou;
    const d2 = iframe.contentDocument;
    r.depoisUrl = iframe.contentWindow.location.pathname;
    r.mensagem = (d2.querySelector('[role=alert], .alert, .flash, .toast')?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 160);
    const erroForm = d2.querySelector('.field_with_errors, .invalid-feedback, .error-message');
    if (erroForm) return { ...r, resultado: 'erro', motivo: `painel devolveu erro de formulário: ${erroForm.innerText.trim().slice(0, 120)}` };
    return { ...r, resultado: 'acionado' };
  }

  st._um = um; // exposto para reinjetar só o agendador sem recarregar o executor
  // `paralelo` iframes na MESMA aba e loja, cada um processando um id por vez (a composição da estampa é lenta e roda no navegador).
  st.iniciar = (ids, pausaMs = 2500, paralelo = 1) => {
    if (st.rodando) return 'já rodando';
    st.fila = ids.filter((id) => !st.resultados[id] || !['acionado'].includes(st.resultados[id].resultado));
    st.parar = false;
    st.rodando = true;
    st.atuais = {};
    const total = st.fila.length;
    const novoIframe = (n) => {
      document.getElementById(`__mockups_iframe_${n}`)?.remove();
      const f = Object.assign(document.createElement('iframe'), { id: `__mockups_iframe_${n}` });
      f.style.cssText = `position:fixed;right:${(n % 4) * 330}px;bottom:${Math.floor(n / 4) * 310}px;width:320px;height:300px;z-index:99999;border:2px solid #b02a5b;background:#fff`;
      document.body.appendChild(f);
      return f;
    };
    const trabalhador = async (n) => {
      let iframe = novoIframe(n);
      while (st.fila.length && !st.parar) {
        const id = st.fila.shift();
        st.atuais[n] = id;
        st.inicioAtual = { ...(st.inicioAtual || {}), [n]: Date.now() };
        let res;
        // Watchdog: o iframe às vezes "morre" (renderer travado, onload que nunca chega). Passou do teto, descarta o iframe, registra
        // erro (o id volta a ser tentado num próximo bloco) e segue com um iframe novo. Um salvamento em curso, se houver, é o da INK:
        // a conferência pela API diz o que de fato foi gravado.
        let timer;
        const teto = new Promise((_, rej) => { timer = setTimeout(() => rej(new Error(`watchdog: ${TETO_PRODUTO_MS / 60000} min sem terminar — iframe recriado`)), TETO_PRODUTO_MS); });
        try { res = await Promise.race([um(iframe, id), teto]); } catch (e) {
          res = { id, em: new Date().toISOString(), resultado: 'erro', motivo: String(e.message || e) };
          if (/watchdog/.test(res.motivo)) { iframe = novoIframe(n); st.recriados = (st.recriados || 0) + 1; }
        } finally { clearTimeout(timer); }
        st.resultados[id] = res;
        gravar();
        // A fila também fica no localStorage: recarregar a aba (ver doc §6) não perde a posição.
        try { localStorage.setItem('__mockups_fila', JSON.stringify(st.fila)); } catch {}
        // Sessão expirada interrompe o lote inteiro (regra do comando).
        if (/sign_in|login/.test(iframe.contentWindow?.location?.pathname || '')) { st.parar = true; st.motivoParada = 'sessão expirou'; }
        await esperar(pausaMs);
      }
      delete st.atuais[n];
    };
    Promise.all(Array.from({ length: paralelo }, (_, n) => trabalhador(n))).then(() => { st.rodando = false; });
    return `iniciado: ${total} id(s), ${paralelo} em paralelo`;
  };
  st.estado = () => {
    const t = {};
    for (const r of Object.values(st.resultados)) t[r.resultado] = (t[r.resultado] || 0) + 1;
    return { rodando: st.rodando, atuais: st.atuais, emCursoHaS: Object.fromEntries(Object.entries(st.inicioAtual || {}).map(([n, t]) => [n, Math.round((Date.now() - t) / 1000)])), recriados: st.recriados || 0, restantes: st.fila.length, parada: st.motivoParada || null, totais: t };
  };
  st.pendentesDeRegistro = () => Object.values(st.resultados).map((r) => ({ id: r.id, resultado: r.resultado, motivo: r.motivo || null, alertas: r.alertas?.length ? r.alertas : undefined }));
  // Acrescenta um bloco de ids à fila em andamento. Recusa o bloco inteiro se a contagem, a soma ou a unicidade não baterem com o que
  // `npm run mockups:fila` gerou: evita que um id digitado errado (ex.: uma Camiseta oculta do próprio Sul) entre na fila.
  st.adicionar = (txt, n, soma) => {
    const ids = txt.trim().split(/\s+/);
    const s = ids.reduce((a, x) => a + Number(x), 0);
    if (ids.length !== n || s !== soma || new Set(ids).size !== n) return { RECUSADO: true, n: ids.length, soma: s };
    const naFila = new Set(st.fila);
    const emCurso = new Set(Object.values(st.atuais || {}));
    let add = 0;
    for (const id of ids) {
      if (naFila.has(id) || emCurso.has(id) || st.resultados[id]?.resultado === 'acionado') continue;
      st.fila.push(id);
      naFila.add(id);
      add++;
    }
    try { localStorage.setItem('__mockups_fila', JSON.stringify(st.fila)); } catch {}
    return { ok: true, add, fila: st.fila.length };
  };
  return 'executor carregado';
})();
