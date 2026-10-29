# Editor de personalização do cliente

Um modelo de personalização pode usar uma base do [Estúdio de estampas](estampas.md). Nesse modo, o cliente edita a arte em `/{region}/personalizar/{slug}`, confere a prévia e envia uma solicitação para a equipe. O envio não é uma compra, não reserva um produto, não cria produtos automaticamente e não envia mensagens ao cliente.

## Preparar e publicar

1. Em `/admin/estampas`, prepare a composição e use **Salvar como modelo**. O salvamento cria uma base imutável com suas camadas, imagens e fontes incorporadas.
2. Abra `/admin/personalizacao/[id]` e, na seção **Editor de arte para o cliente**, adicione a arte com essa base (veja [Várias artes numa página](#várias-artes-numa-página)).
3. Salve o rascunho do modelo de personalização. Use a prévia interativa para trocar textos, fontes e cores e testar o formulário. **Testar o envio (prévia)** não registra uma solicitação.
4. Publique o modelo de personalização para disponibilizar o vínculo na loja, respeitando os requisitos de ativação já existentes.

Quando há uma arte vinculada, os controles da arte substituem os campos de texto e o grupo de linhas do formulário público. Sem vínculo, o formulário anterior continua em uso. Os campos de contato, a confirmação de uso do contato e o acompanhamento da solicitação continuam iguais.

## O que o cliente pode editar

- Cada camada de texto visível oferece texto, fonte e cor. São permitidos até **200 caracteres por texto**, sem ultrapassar a quantidade de linhas daquele texto na base.
- **Fonte** oferece as fontes padrão do estúdio e as fontes incorporadas à base. **Mont** aparece uma única vez; ao escolhê-la, **Variação** mostra seus cortes incorporados àquela base, como **Extraleve**, **Regular**, **Regular itálico**, **Negrito** e **Pesado**. Cada escolha usa o arquivo real do corte. O cliente não envia novos arquivos de fonte nem acessa cortes ausentes da base.
- Posições, logos, imagens e dimensões seguem a composição original. Textos longos diminuem proporcionalmente para caber na largura disponível.
- A prévia acompanha as escolhas. Ela abre **Na camiseta**: a arte sobre a foto de uma camiseta lisa (nove cores, em `public/personalizacao/camisetas/`; lista em `src/lib/customization/shirts.ts`, com o enquadramento 800 × 820 dos mockups da INK), na área de estampa medida num mockup da INK (`.printArea` em `ArtworkEditor.module.css`), então ela aparece no tamanho e no lugar em que a INK mostra (um logo de peito fica no peito). **Só a arte** mostra a arte ampliada. Quando a arte não tem versão clara e escura, a cor da camiseta (ou do fundo) na prévia serve só para conferir o contraste; não muda o produto nem compõe o PNG.

## Várias artes numa página

Um modelo pode oferecer várias artes (até 8), e o cliente escolhe qual personalizar. Cada arte tem uma ou mais **versões** (até 3, por exemplo Adulto e Infantil, com nome obrigatório quando há mais de uma) e cada versão tem a base para **camisetas escuras e coloridas** e, opcional, a base para **camisetas branca e cinza** (a arte em tinta escura). A página mostra **Escolha a arte** com mais de uma arte e **Versão** quando a arte tem mais de uma. **Veja em outra cor de camiseta** troca a foto entre as nove cores só para visualizar (a cor o cliente escolhe na compra): nas camisetas branca e cinza aparece a base "branca e cinza", nas demais a outra. No celular, os seletores ficam logo abaixo da prévia.

- Todas as bases do modelo precisam pedir os mesmos campos (por exemplo, só o sobrenome): o cliente escreve uma vez e troca de arte sem perder o que escreveu. O painel recusa o salvamento quando não pedem.
- A página leva só a base da primeira arte (cada base carrega a arte em tamanho real, de 0,5 a 4 MB). As outras são buscadas quando o cliente as escolhe, e só as bases do próprio modelo publicado são servidas.
- A solicitação registra a **Arte escolhida** (por exemplo, "Eu vim pela ceia · Infantil · Eu vim pelo presente"), sem a cor da camiseta, e o nome da base que estava na prévia. O produto leva as duas versões: arte escura nas camisetas branca e cinza, arte clara nas demais.

O cliente informa nome, ao menos um canal de contato e a confirmação solicitada. **Salvar e enviar solicitação** guarda as escolhas na fila existente e mostra uma referência. O link **Ver minha solicitação** também apresenta a prévia da arte, além do resumo e do andamento. Não há galeria pública, upload de PNG pelo cliente nem geração de produto nessa etapa.


### No celular (95% do acesso)

A página segue uma ordem só: título com uma frase, prévia na camiseta (com **Tela cheia**), os quadradinhos de cor, **1. Escolha a arte** (miniaturas com "Silva", servidas recortadas por `/api/personalizar/{região}/{modelo}/miniatura/{base}`, só para bases do modelo publicado; na prévia do painel, `/admin/estampas/miniatura/{base}`), **Versão** (miniaturas com "Adulto" / "Infantil"), **2. Escreva o sobrenome** e **3. Como falamos com você?**. O aviso de que não é compra aparece uma vez, curto, junto do botão.

- **Textos de apoio num "i"** (`InfoTip`): como escrever o sobrenome, a cor só para visualizar (e que a equipe confere a arte), o limite de artes por solicitação, quais contatos informar, como o contato é usado e o que acontece ao enviar. O "i" abre a dica com um toque, ela é anunciada a leitores de tela e fecha com Esc ou com um toque fora. A dica do sobrenome também é a descrição do campo para leitores de tela. Com um campo só, o rótulo do campo fica só para leitores de tela (o título da etapa já diz), e o contador de letras aparece a partir de 5 letras do limite.
- O sobrenome começa **vazio** ("Ex.: Silva"); enquanto vazio, a prévia mostra o exemplo e avisa "É só um exemplo. Escreva o seu sobrenome", que leva ao campo.
- **Ver como ficou na camiseta** (logo abaixo do campo, só no celular, na cor da região: o oliva da barra do topo no Sul) e **Tela cheia** abrem a prévia em tela inteira com o campo em cima (cabe acima do teclado) e as cores embaixo, em no máximo duas linhas e sem rolar para o lado: dá para escrever e ver ao mesmo tempo. As artes e versões não aparecem ali, para um toque não trocar a arte escolhida; elas ficam só na página. Só o miolo da tela cheia rola; o cabeçalho com **Pronto** fica sempre visível (a janela é `overflow-clip`, e o miolo é `relative` para conter os botões de opção invisíveis das cores e das artes, que antes esticavam a janela em celulares mais baixos e levavam o cabeçalho embora).
- A fileira **Na camiseta · Só a arte · Tela cheia** quebra linha quando falta espaço (celular de 320 px).
- **Várias artes na mesma solicitação**: "Incluir outra arte com o mesmo sobrenome" (até 4, por exemplo Adulto e Infantil). A solicitação guarda a primeira em `values.artwork` e as outras em `values.moreArtwork`; o resumo numera as artes, e o painel mostra e abre cada uma no estúdio (`/admin/estampas?solicitacao=…&arte=2`).
- O texto das bases geradas traz o exemplo do campo ("Silva"), então a miniatura salva pelo estúdio já mostra o exemplo.
## Bases com campo (só o sobrenome)

Uma camada de texto pode ter um **campo** (`slot` em `model.ts`): um modelo de texto com `{campo}`, como `NATAL DOS {sobrenome}`, um rótulo, um limite de caracteres e a caixa das letras (`upper`, `title` ou `none`). Se a base tem pelo menos uma camada com campo, a loja mostra **um input por campo** (camadas com o mesmo campo compartilham a resposta) e **trava todo o resto**: textos, fontes, cores e posições. O navegador envia só `{ sobrenome: "..." }`; o servidor monta os textos a partir da base.

- Aceita letras latinas (com todos os acentos do português), espaço, hífen, apóstrofo e ponto. Maiúsculas ou inicial maiúscula são aplicadas automaticamente; em `title`, "da", "dos", "de" etc. ficam minúsculos no meio do nome.
- **Caixa fixa** (`boxWidth`): o texto alinha dentro da caixa, então um nome centralizado continua no eixo da arte, e diminui para caber quando é longo. A linha de base é ancorada na altura do "H", para acentos não deslocarem a composição; ao diminuir, o centro vertical se mantém.
- **Arco** (`arc`, raio em px): o texto é desenhado letra a letra num arco para cima, centrado na caixa; a largura da caixa vira o maior arco antes de diminuir. Não aplica pares de kerning entre letras.
- **Contorno** (`stroke`, px): contorno na cor do próprio texto, para encorpar uma fonte leve.
- **"dos" automático** (`dropParticle`): onde a arte já diz "dos" ("NATAL DOS {sobrenome}", ou "ceia dos" desenhado acima), um "da/das/do/dos" no começo da resposta sai, então "dos Santos" vira "NATAL DOS SANTOS". "De", "Di" e "Du" ficam, porque fazem parte de sobrenomes como De Lucca e Di Napoli. "Dos" serve para qualquer sobrenome: é o plural da família ("os Silva", "os Oliveira").
- **Quebra de linha** (`maxLines`): sobrenome composto vira linhas equilibradas, com as partículas presas à palavra seguinte ("Silva Pereira / dos Santos", "Costa / e Silva"). As linhas extras entram embaixo; no arco, em arcos concêntricos menores.
- **Arte que desce** (`pushedBy` na camada de imagem): a imagem desce a altura das linhas extras do texto indicado, então a arte embaixo do nome acompanha a quebra.
- **Tipo do campo** (`input`): sem ele, o cliente escreve letras (o sobrenome). Com `input: "city"`, escolhe o estado e depois a cidade, com autocomplete, entre os 5.571 municípios do IBGE (`data/geo/municipios-brasil.json`, gerado por `scripts/build-municipios-brasil.mts`). A resposta é guardada como `Nome/UF`, sai na arte como `UF - NOME`, e o servidor confere se a cidade existe na lista. Com `input: "plate"`, o cliente digita 3 letras e 4 números, que saem como `ABC-1234` (o hífen entra sozinho). A cidade não passa pela lista de palavras para a equipe (nomes reais como "Pau dos Ferros" e "Pau Brasil"), mas a placa passa, inclusive por siglas ofensivas de 3 letras.
- Com campos de cidade ou placa, a página fala da estampa em geral ("Personalize a estampa", "Conferi o que vai na estampa"); só as bases de sobrenome mantêm o texto do sobrenome.
- O resumo da solicitação mostra o que o cliente digitou e o **texto como sai na arte**.

O estúdio preserva esses campos ao abrir e salvar, e renderiza arco, contorno e a arte que desce, mas ainda não tem controles para editá-los: ajuste pelo `.json`.

### Placa · UF e cidade

A arte da placa cinza antiga (`~/Downloads/Estampas Personalizaveis - Lote 1.png`) vira base com `scripts/placa-base.py`, na fonte Origens Placa embutida:

```zsh
../arte-lojas/.venv/bin/python scripts/placa-base.py "$HOME/Downloads/Estampas Personalizaveis - Lote 1.png" output/placa-base   # pillow, numpy
npx tsx --conditions=react-server scripts/placa-previa.mts                                                                    # prévia exata
```

O script apaga os dois textos (o miolo da placa é preto liso) e põe uma camada de cidade (`input: "city"`, caixa dentro da moldura de cima) e uma de placa (`input: "plate"`, espaçamento fixo de 6% do tamanho, porque a fonte é mais larga que as letras do PNG). Cidade longa ("MT - VILA BELA DA SANTÍSSIMA TRINDADE") e placa larga ("WMW-8888") encolhem e continuam centradas. É uma arte só para todas as cores: na camiseta preta sobram a moldura e as letras prata. A prévia sai do mesmo desenho do servidor que cria a arte na INK, sobre camiseta branca e preta.

Para pôr no ar: o código precisa estar em produção antes da base (o estúdio antigo descartaria o tipo dos campos ao importar). Depois, importar o `.origens.json` em Estampas, **Salvar como modelo**, criar o modelo de personalização com essa arte, ligar a compra direta, escolher a categoria na INK e publicar.

### Natal em família

As artes de `~/Downloads/Estampas Familia Natal 2` vêm em pares com o mesmo desenho: o PNG ímpar é para **camiseta clara** (tinta escura) e o par para **camiseta escura** (tinta clara). Viram bases com `scripts/natal-bases.py`:

```zsh
python3 scripts/natal-bases.py "$HOME/Downloads/Estampas Familia Natal 2" output/natal-bases --preview   # pillow, numpy, scipy
```

Sai um `<slug>-clara.origens.json` e um `<slug>-escura.origens.json` por arte, com "· camiseta clara/escura" no nome. A cor do texto novo é lida do sobrenome original de cada PNG, e a posição também é medida em cada um (as duas versões diferem alguns pixels). Os critérios de apagar usam posição e tamanho, não cor, e o script para com erro se não encontrar o sobrenome no lugar esperado.

O script apaga o sobrenome do PNG (uma zona em volta do nome, incluindo o halo quase transparente que as artes trazem, preservando árvores, estrela, mesa etc.) e põe no lugar a camada com o campo. Medidas, fontes e zonas ficam no topo do script, medidas no PNG da camiseta clara.

| PNGs | Base | Texto | Fonte |
| --- | --- | --- | --- |
| 1, 2 | universitário | `{SOBRENOME}` em arco, com contorno; composto quebra em 2 arcos e a arte desce | Graduate |
| 3, 4 | eu vim pela ceia | `NATAL DOS {SOBRENOME}` | Montserrat SemiBold |
| 5, 6 | eu vim pelo presente | `NATAL DOS {SOBRENOME}` | Montserrat SemiBold |
| 7, 8 | ceia dos | `{Sobrenome}` | Caveat |
| 9, 10 | árvore (peito) | `{SOBRENOME}` espaçado | Montserrat SemiBold |
| 11, 12 | pavê ou pacumê | `NATAL DOS {SOBRENOME}` | Caveat Brush |

As quatro fontes (OFL) ficam em `assets/print-studio/fonts/` e também entram na biblioteca do estúdio. A Graduate é mais leve e larga que a letra universitária original; o contorno compensa parte disso. Para trocar por outra fonte, coloque o arquivo em `assets/print-studio/fonts/`, registre em `font-server.ts` e no `FONTS` do script, e gere de novo.

Para publicar em produção: em cada um dos 12 `.origens.json`, `/admin/estampas` → **Importar modelo** → conferir → **Salvar como modelo**. Depois, em `/admin/personalizacao`, um único modelo "Natal em família" (coleção, mockup) com cinco artes: Universitário, Eu vim pela ceia (versões "Adulto", com a base "eu vim pela ceia", e "Infantil", com "eu vim pelo presente"), Ceia dos, Árvore e Pavê ou pacumê, cada versão com a base escura e a clara. Salvar e publicar o modelo.

## Compra direta na INK

Num modelo com artes de **campo** (só o sobrenome), **Compra direta na INK** (na página do modelo) troca a solicitação para a equipe pela compra na hora: o cliente escreve o sobrenome, toca em **Criar minha camiseta**, espera cerca de 1 minuto numa tela própria e vai para o produto na loja. Desligada por padrão; a solicitação continua sendo o plano B.

- **O que o servidor faz** (`src/lib/customization/product-worker.ts`): desenha as duas artes em 4270 × 4900 a partir das bases imutáveis, com o mesmo `paintProject` da prévia, num canvas nativo (`@napi-rs/canvas`, `src/lib/print-studio/render-server.ts`); cria um produto **oculto** na INK (`visible_in_store: false`, tags `personalizado` e `personalizado-<modelo>`, preço do painel) com a arte escura nas camisetas branca, cinza e amarela e a clara nas outras (a mesma tabela da prévia, `SHIRT_COLORS` em `shirts.ts`); espera a foto da INK por até 60 s e manda o cliente para o link (com a campanha da visita, `carryCampaign`). Um trabalho por vez no processo (cada render ocupa ~84 MB).
- **Reaproveitamento**: o mesmo texto na mesma versão da arte é o mesmo produto (`productJobKey`): o segundo "Silva" vai direto, sem espera.
- **Segurança**: a chave de idempotência da INK é o id do trabalho, para sempre a mesma; um 409 "indeterminado" ou um erro depois de a INK ter o produto vira **Conferir na INK** (uma pessoa procura o produto pelo nome antes de qualquer coisa). Nomes com palavrões, ofensas ou links (`review-words.ts`, palavra inteira: "Cunha" e "Pinto" passam), o teto do dia (`CUSTOMIZATION_PRODUCTS_DAILY_CAP`, padrão 300 produtos novos em 24 h), 10 tentativas por pessoa em 10 min e qualquer erro levam ao formulário curto de contato, que registra a solicitação de sempre.
- **Antes de criar**: a caixa obrigatória **Conferi a escrita de “Silva”** (com o texto digitado; mudar o texto desmarca), porque o produto é permanente. "Ver como ficou" abre a tela cheia.
- **Espera** (`ProductWaiting.tsx`): a arte do cliente gira pelas cores da peça a cada 2 s; as etapas são as reais (arte, criação na loja, fotos, abrindo), consultadas em `GET /api/personalizar/produto/<id>` (sem cache; retoma um trabalho largado). Embaixo: **Continuar navegando** (fecha a tela; a criação segue), **Cancelar e editar** (volta ao sobrenome e tira o pedido do aviso; o trabalho no servidor não é interrompido, porque outro cliente com o mesmo nome pode estar esperando por ele, e um produto que ninguém abre fica oculto) e **Prefere receber o link?** (o contato da equipe, com **Continuar aguardando** para voltar às etapas). Depois de 3 minutos ou de um erro, a página oferece o contato sozinha.
- **Aviso flutuante** (`ProductTracker.tsx`, no layout da região): os pedidos em andamento ficam guardados neste navegador (`product-tracker.ts`, até 24 h) e um botão no centro de baixo de todas as páginas (entre os cupons e o chat, acima da barra de cookies) mostra "Criando camiseta…"; ao ficar pronta ele pisca ("Camiseta pronta!") e o toque abre o painel com a foto da INK e **Ver minha camiseta**. Consulta o estado a cada 5 s, só com a aba visível e nenhum diálogo aberto. Os ids também vão para o cookie `uo_produtos` do domínio `.useorigens.com.br`, e o Worker na frente da INK (repositório worker-lojas, funcionalidade em `WIDGET_FEATURES`, `docs/produto-em-criacao.md` de lá) mostra o mesmo aviso nas páginas da loja, consultando `/__origens/produto/<id>`, que repassa para `GET /api/personalizar/produto/<id>` daqui com a chave do visitante (`x-origens-visitor`). O cookie é a lista comum: tirar um pedido de um lado tira do outro.
- **Minhas Estampas** (antes "Meus Lugares"; `/meus-lugares` redireciona para `/<região>/minhas-estampas`): uma camiseta pronta entra lá sozinha como "Personalizada" e fica depois que o aviso some. Como ela é oculta na INK (fora do catálogo sincronizado), o site a reconhece pela tabela da compra direta (`resolveAnyProductDisplay`) na atualização da lista, no "Comprar minha lista" e no próximo item da lista que o Worker pede: várias camisetas usam a mesma lista de próximos produtos das estampas salvas. A foto só vem do CDN da INK; sem ela, a camiseta lisa do site.
- **Camiseta Infantil**: cada versão diz a peça na INK (**Peça na INK**: Camiseta = tipo 1, Camiseta Infantil = tipo 2). A Infantil tem 6 cores (sem vermelho, verde e rosa) e a prévia mostra só elas. O preço da Infantil é obrigatório quando uma versão é infantil.
- **Produtos criados** (`/admin/personalizacao/produtos`): todos os produtos que a compra direta fez, com nome, arte, estado, número e link na INK. A INK não apaga produtos: para tirar um do ar, oculte ou edite no painel da INK.
- **Banco**: tabela `customization_product` (migração `0011_customization_products`). Sem ela aplicada, a página continua com a solicitação.
- **Ambientes**: só a produção fala com a INK de verdade, com `INK_WRITE_TOKEN_SUL`. Fora dela (ou sem o token) entra um simulador com os tempos do piloto (30 s para criar, 20 s para a foto; `FAKE_INK_CREATE_MS`/`FAKE_INK_PHOTO_MS`), para que um sobrenome digitado no computador nunca vire produto permanente. `INK_PRODUCTS_LIVE=on` liga a INK real fora da produção; use só de propósito.
- **Piloto (27/10/2026)**: o produto 5143876, "Silva | Natal em Família Universitário", oculto, foi criado pela API para medir: ~31 s para criar (envio de 19,6 MB de casa), foto ~20 s depois, abre e vende pelo link, fora da busca da INK. O desenho no servidor bate com o do navegador nas 12 bases (mesma área de tinta, ±2 px; nas letras manuscritas da "Ceia dos" o ajuste entre letras varia até ~1,5 mm na camiseta).

## Atender no estúdio

Em `/admin/personalizacao/solicitacoes/[id]`, a equipe vê a composição em canvas, o resumo e **Abrir arte no estúdio**. O link abre `/admin/estampas?solicitacao=ID`; o servidor verifica a permissão para editar a região da solicitação antes de carregar a arte.

O estúdio inicia com a base e as escolhas recebidas. Se houver um rascunho local dessa solicitação no navegador, ele é restaurado. Esse rascunho fica isolado do rascunho geral e dos rascunhos de outras solicitações; ele não substitui o salvamento no servidor.

**Salvar estampa** cria uma nova arte independente e preserva a composição original enviada pelo cliente. A equipe gera e salva o PNG pelo estúdio, prepara o produto na loja de origem e realiza o contato manualmente, usando o fluxo de atendimento existente.

## Dados e conservação das bases

A solicitação guarda `templateId`, `templateName` e as edições canônicas de cada texto, incluindo identificadores e nomes das fontes e cores. Esses dados ficam no JSON de valores já existente: `values.artwork` no store em arquivo e na coluna `request_values` do Postgres. A extensão não exige migração. Novas escolhas explícitas de variação podem guardar o peso confiável da fonte na solicitação; solicitações e composições antigas preservam seu fallback de peso.

A composição é reconstruída a partir da base imutável. Referências de imagem e camadas ocultas são excluídas da base entregue ao cliente; a biblioteca privada do estúdio não se torna uma galeria pública. Preserve as bases vinculadas e inclua o diretório de estampas no backup descrito em [Armazenamento e Railway](estampas.md#armazenamento-e-railway).

Se a base estiver ausente ou inválida, a página de personalização não permite enviar uma nova solicitação. Nas solicitações já salvas, o resumo permanece disponível, mas a prévia e a abertura no estúdio dependem da base original.

## Verificação desta extensão

Na implementação inicial, passaram o typecheck, o ESLint direcionado e **189 testes em 17 arquivos**, incluindo a ação pública, validação da arte, os dois backends de solicitações, fontes, estúdio, schema e CMS. A revisão estática confirmou as correções de normalização dos textos e recuperação do rascunho da solicitação.

No ajuste da família Mont em 20/10/2026, passaram o typecheck, o ESLint direcionado e **19 testes em 5 arquivos afetados**; o detector mecânico não apontou problemas. A prévia SSR local respondeu HTTP 200, com uma opção Mont em **Fonte** por texto. Essa verificação foi limitada ao ajuste de fontes e não representa uma nova execução da bateria de 189 testes nem uma validação visual.

A comparação estática conferiu o uso da tipografia existente (`t-h3`, `t-small`, `t-label`), dos botões da loja e do painel e de controles retangulares com borda e foco visível. A extensão herda os tokens regionais e a linguagem de `globals.css`; não estabelece uma nova identidade visual ou um novo sistema de design.

**A validação visual permanece pendente.** Não há screenshots válidos nem E2E de navegador desta extensão: a navegação local pelo navegador não foi autorizada nesta sessão. A revisão estática e os testes automatizados não comprovam o resultado renderizado em desktop ou celular.
