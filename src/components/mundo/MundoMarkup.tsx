/**
 * Meu Pequeno Mundo — a marcação da experiência (a mesma do protótipo independente). Sem estado nem efeitos: o servidor a envia pronta
 * (painéis com `hidden`, "Preparando a maquete…") e o módulo `experiencia/app.js` assume o DOM depois da hidratação.
 * Também é renderizada em HTML estático por `scripts/mini-world-standalone.mts` para gerar o protótipo independente.
 * Os IDs e as classes são o contrato com `experiencia/app.js`: renomear aqui exige renomear lá.
 */
export function MundoMarkup() {
  return (
    <div id="app" className="mpm" data-modo="carregando">

      {/* ===================== PALCO (maquete 3D) ===================== */}
      <div className="palco" id="palco" tabIndex={0} role="region" aria-roledescription="maquete 3D"
           aria-label="Maquete do seu pequeno mundo. Use as setas para girar e as teclas + e − para aproximar."
           aria-describedby="palco-descricao">
        <canvas id="cena" aria-hidden="true"></canvas>
        <div className="etiquetas" id="etiquetas" aria-hidden="true"></div>
        <div className="descobertas" id="descobertas" aria-hidden="true"></div>
        <button type="button" className="dica-palco" id="dica-palco" hidden>Escolha uma cidade para criar a primeira ilha.</button>
        <div className="status-cena" id="status-cena" role="status">
          <span className="carregando" aria-hidden="true"></span>
          <span id="status-cena-texto">Preparando a maquete…</span>
        </div>
        <div className="estatico" id="estatico" hidden>
          <p className="estatico-aviso" id="estatico-aviso">A maquete 3D não abriu neste navegador. Seus lugares e as camisetas continuam aqui.</p>
          <ul className="estatico-lista" id="estatico-lista"></ul>
        </div>
        <p className="sr-only" id="palco-descricao"></p>
      </div>

      <header className="topo">
        <a className="marca" href="https://www.useorigens.com.br" aria-label="Voltar à loja Use Origens">
          <svg className="marca-seta" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
          <span className="wordmark" translate="no">Use Origens</span>
          <span className="marca-voltar">Voltar à loja</span>
        </a>
        <span className="selo-demo" id="selo-demo" hidden title="Cidades de exemplo; catálogo ainda não conectado">Demonstração</span>
      </header>

      <div className="camera" id="camera" hidden>
        <button type="button" className="icone-btn" id="btn-girar-esq" aria-label="Girar a maquete para a esquerda" title="Girar para a esquerda">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.3-5.6"/><path d="M4 4v4h4"/></svg>
        </button>
        <button type="button" className="icone-btn" id="btn-visao-inicial" aria-label="Voltar à visão inicial" title="Voltar à visão inicial">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M3 12h3M18 12h3M12 3v3M12 18v3"/><circle cx="12" cy="12" r="4"/></svg>
          <span className="rotulo-longo">Visão inicial</span>
        </button>
        <button type="button" className="icone-btn" id="btn-girar-dir" aria-label="Girar a maquete para a direita" title="Girar para a direita">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.3-5.6"/><path d="M20 4v4h-4"/></svg>
        </button>
      </div>

      {/* Descoberta: um marco da maquete conta uma história curta (o mesmo texto está na ficha da cidade, para teclado e leitor de tela) */}
      <section className="balao" id="balao" role="dialog" aria-labelledby="balao-titulo" hidden>
        <div className="balao-topo">
          <div>
            <span className="ref-tipo" id="balao-tipo"></span>
            <h3 id="balao-titulo" tabIndex={-1}></h3>
          </div>
          <button type="button" className="fechar" id="btn-fechar-balao" aria-label="Fechar descoberta">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>
          </button>
        </div>
        <p id="balao-texto" className="completo"></p>
        <p id="balao-curto" className="curto"></p>
        <p className="ref-nota" id="balao-nota"></p>
        <div className="balao-acoes">
          <button type="button" className="link-acao" id="btn-balao-cidade"></button>
        </div>
      </section>

      {/* ===================== ENTRADA ===================== */}
      <section className="painel" id="painel-intro" aria-labelledby="intro-titulo" hidden>
        <p className="olho">Meu pequeno mundo</p>
        <h1 className="titulo" id="intro-titulo" data-texto="intro.titulo"></h1>
        <p className="apoio" data-texto="intro.apoio"></p>
        <button type="button" className="m-btn m-btn-bloco" id="btn-comecar" data-texto="intro.cta"></button>
        <p className="nota" data-texto="intro.nota"></p>
      </section>

      {/* ===================== CONSTRUÇÃO (até três lugares) ===================== */}
      <section className="painel" id="painel-montar" aria-labelledby="pergunta" hidden>
        <div id="aviso-montar" className="aviso" role="alert" hidden></div>
          <div id="sugestao-montar" className="sugestao" hidden></div>
        <ol className="passos" id="passos" aria-label="Etapas do seu mundo"></ol>
        <p className="olho" id="papel-atual"></p>
        <h2 className="titulo-m" id="pergunta" tabIndex={-1}></h2>

        <div className="escolha" id="escolha" hidden>
          {/* o cartão inteiro é o botão de trocar: um alvo grande, com nome acessível "Trocar …" */}
          <button type="button" className="escolha-trocar" id="btn-trocar">
            {/* eslint-disable-next-line @next/next/no-img-element -- the experience fills it at runtime with the region's inline seal */}
            <img id="escolha-selo" alt="" width="40" height="40" />
            <span className="escolha-texto">
              <span className="escolha-nome" id="escolha-nome"></span>
              <span className="escolha-meta" id="escolha-meta"></span>
            </span>
            <span className="escolha-acao" aria-hidden="true">Trocar</span>
          </button>
          <div className="escolha-acoes">
            <button type="button" className="link-acao" id="btn-remover">Remover</button>
          </div>
          <div className="lembranca" data-lembranca="montar">
            <label htmlFor="lembranca-montar"><span data-texto="lembranca.pergunta"></span> <span className="opcional" data-texto="lembranca.opcional"></span></label>
            <div className="lembranca-campo">
              <input id="lembranca-montar" type="text" maxLength={80} autoComplete="off" enterKeyHint="done" spellCheck="true" />
              <span className="contador" aria-hidden="true"></span>
            </div>
          </div>
        </div>

        <div className="busca" id="busca">
          <div className="troca" id="troca" hidden>
            <span>Trocando <strong id="troca-nome"></strong></span>
            <button type="button" className="link-acao" id="btn-cancelar-troca">Cancelar</button>
          </div>
          <label htmlFor="busca-campo">Buscar cidade</label>
          <div className="campo" id="campo-busca">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
            <input id="busca-campo" type="search" inputMode="search" enterKeyHint="search" autoComplete="off" autoCapitalize="words" spellCheck="false"
                   role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="busca-lista" aria-describedby="busca-status"
                   placeholder="Digite o nome da cidade" />
          </div>
          <div className="atalhos" id="atalhos" hidden></div>
          <ul className="resultados" id="busca-lista" role="listbox" aria-label="Cidades encontradas"></ul>
          <p className="busca-status" id="busca-status" aria-live="polite"></p>
        </div>

        <div className="acoes-passo">
          <button type="button" className="m-btn m-btn-ghost btn-voltar" id="btn-voltar">Voltar</button>
          <button type="button" className="m-btn" id="btn-avancar"></button>
        </div>
        {/* caminhos opcionais como texto: pular a etapa e ver o mundo com o que já foi escolhido */}
        <div className="acoes-texto" id="acoes-texto">
          <button type="button" className="link-acao" id="btn-pular"></button>
          <button type="button" className="link-acao" id="btn-ver-mundo">Ver meu mundo</button>
        </div>
      </section>

      {/* ===================== RESULTADO ===================== */}
      {/* No celular começa compacto (lugares, camisetas e compartilhar); "Detalhes" abre o resto. No desktop fica tudo aberto. */}
      <section className="painel painel-mundo" id="painel-mundo" aria-labelledby="mundo-titulo" hidden>
        <div id="aviso-mundo" className="aviso" role="alert" hidden></div>
          <div id="sugestao-mundo" className="sugestao" hidden></div>
        <div className="cabeca-mundo">
          <div>
            <p className="olho">Meu pequeno mundo</p>
            <h2 className="titulo-m" id="mundo-titulo" tabIndex={-1}></h2>
          </div>
          <button type="button" className="btn-detalhes" id="btn-detalhes" aria-expanded="false" aria-controls="detalhes-mundo">
            <span id="btn-detalhes-texto">Detalhes</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m6 15 6-6 6 6"/></svg>
          </button>
        </div>
        <ul className="lista-lugares" id="lista-lugares" aria-label="Lugares do seu mundo"></ul>
        <button type="button" className="m-btn m-btn-bloco" id="btn-compartilhar">Compartilhar meu mundo</button>
        <div className="detalhes-mundo" id="detalhes-mundo">
          <section className="conecta" id="conecta" aria-labelledby="conecta-titulo" hidden>
            <h3 className="ficha-titulo" id="conecta-titulo" data-texto="conecta.titulo"></h3>
            <ul className="conecta-lista" id="conecta-lista"></ul>
          </section>
          <label className="incluir" id="incluir" hidden>
            <input type="checkbox" id="incluir-lembrancas" aria-describedby="incluir-nota" />
            <span><span className="incluir-rotulo" data-texto="compartilhar.incluir"></span><span className="nota" id="incluir-nota" data-texto="compartilhar.incluirNota"></span></span>
          </label>
          <div className="linha-acoes">
            <button type="button" className="m-btn m-btn-ghost" id="btn-baixar">Baixar imagem</button>
            <button type="button" className="m-btn m-btn-ghost" id="btn-link">Copiar link</button>
          </div>
          <p className="nota" id="nota-link" hidden>O link do mundo funciona quando a página está publicada na web. Aqui, baixe a imagem.</p>
          <p className="nota" id="nota-salvar" hidden>Não deu para salvar neste navegador. Guarde a imagem ou o link do seu mundo.</p>
          <div className="acoes-rodape">
            <button type="button" className="link-acao" id="btn-editar">Editar lugares</button>
            <button type="button" className="link-acao" id="btn-recomecar">Começar de novo</button>
          </div>
          <p className="aviso-ilustrativo" data-texto="ilustrativo"></p>
        </div>
      </section>

      {/* ===================== FICHA DA CIDADE ===================== */}
      {/* Em camadas: cidade e frase; camisetas; "Conheça este lugar" (resumo e referências); lembrança; dados e fontes. */}
      <section className="painel painel-cidade ficha" id="painel-cidade" role="dialog" aria-labelledby="cidade-nome" hidden>
        <div className="cidade-topo">
          <ul className="papeis-chips" id="cidade-papeis" aria-label="Papel na sua história"></ul>
          <button type="button" className="fechar" id="btn-fechar-cidade" aria-label="Fechar e voltar ao mundo">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>
          </button>
        </div>
        <h2 className="titulo-m cidade-nome" id="cidade-nome" tabIndex={-1}></h2>
        <p className="cidade-estado" id="cidade-estado"></p>
        <p className="ficha-frase" id="cidade-frase" hidden></p>
        <p className="cidade-paisagem" id="cidade-paisagem" hidden></p>
        <div className="ficha-cta"><a className="m-btn m-btn-bloco" id="cidade-cta" target="_blank" rel="noopener"></a></div>
        <p className="produtos-titulo" id="produtos-titulo">Camisetas deste lugar</p>
        <div id="cidade-produtos" aria-live="polite" aria-busy="false"></div>
        <details className="ficha-conheca" id="cidade-conheca" hidden>
          <summary data-texto="ficha.conheca"></summary>
          <p className="ficha-resumo" id="cidade-resumo" hidden></p>
          <ul className="referencias" id="cidade-referencias" aria-label="Referências do lugar"></ul>
          <p className="cidade-paisagem" id="cidade-paisagem-perfil"></p>
        </details>
        <div className="lembranca" data-lembranca="ficha">
          <label htmlFor="lembranca-ficha"><span data-texto="lembranca.pergunta"></span> <span className="opcional" data-texto="lembranca.opcional"></span></label>
          <div className="lembranca-campo">
            <input id="lembranca-ficha" type="text" maxLength={80} autoComplete="off" enterKeyHint="done" spellCheck="true" aria-describedby="lembranca-ficha-nota" />
            <span className="contador" aria-hidden="true"></span>
          </div>
          <p className="nota" id="lembranca-ficha-nota" data-texto="lembranca.nota"></p>
        </div>
        <details className="ficha-mais" id="cidade-mais">
          <summary data-texto="ficha.mais"></summary>
          <dl className="dados-cidade" id="cidade-dados"></dl>
        </details>
        <details className="ficha-fontes" id="cidade-fontes">
          <summary data-texto="ficha.fontes"></summary>
          <ol className="fontes-lista" id="cidade-fontes-lista"></ol>
          <p className="nota" id="cidade-revisao"></p>
        </details>
        <p className="aviso-ilustrativo" data-texto="ilustrativo"></p>
        <div className="cidade-nav" id="cidade-nav">
          <button type="button" className="link-acao" id="btn-cidade-ant"></button>
          <button type="button" className="link-acao" id="btn-cidade-prox"></button>
        </div>
      </section>

      <dialog id="dlg-recomecar" aria-labelledby="dlg-recomecar-titulo">
        <h2 id="dlg-recomecar-titulo">Começar de novo?</h2>
        <p>Os lugares do seu mundo serão apagados deste navegador.</p>
        <div className="dialog-acoes">
          <button type="button" className="m-btn" id="btn-recomecar-cancelar" autoFocus>Manter meu mundo</button>
          <button type="button" className="m-btn m-btn-ghost" id="btn-recomecar-confirmar">Apagar e recomeçar</button>
        </div>
      </dialog>

      <dialog id="dlg-compartilhar" aria-labelledby="dlg-compartilhar-titulo">
        <h2 id="dlg-compartilhar-titulo">Compartilhar</h2>
        <p id="dlg-compartilhar-texto">Este navegador não envia a imagem direto para outros apps. Baixe a imagem e compartilhe onde quiser.</p>
        <div className="dialog-acoes">
          <button type="button" className="m-btn" id="dlg-baixar">Baixar imagem</button>
          <button type="button" className="m-btn m-btn-ghost" id="dlg-link">Copiar link</button>
          <button type="button" className="link-acao" id="dlg-fechar">Fechar</button>
        </div>
      </dialog>

      <p className="toast" id="toast" role="status" aria-live="polite"></p>
    </div>
  );
}
