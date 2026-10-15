# Relatório — Meu Pequeno Mundo | Use Origens

Rodada de 13–14/10/2026. Estado de publicação: **local / PR aberto** (nada publicado, nada na home, storefront intocado).

## 1. Resumo

Protótipo navegável em **um arquivo HTML** (`meu-pequeno-mundo-use-origens.html`, ~210 KB com os selos embutidos): uma maquete 3D
em Three.js em que a pessoa escolhe até três lugares — **Minha origem**, **Meu presente** e **Meu lugar do coração** — e cada escolha
ergue uma ilha de terra com espessura, água, vegetação, casas e uma placa com o nome da cidade. As ilhas se ligam por pontes de tábuas,
na ordem da história. No resultado, cada ilha e cada placa abre um painel com as **camisetas reais** daquela cidade (mockups do catálogo
e links para as páginas reais do storefront), e o mundo pode ser **baixado** ou **compartilhado** como PNG 1080 × 1350 e reaberto por
**link**.

O catálogo foi conectado de verdade: um script do repositório (`npm run mundo:dados`) exporta do snapshot local, com as mesmas funções
e rotas do storefront, um índice das 2.144 localidades com camiseta e um arquivo por localidade. O protótipo busca só no índice e
carrega produtos apenas das cidades escolhidas. Sem acesso aos dados (arquivo aberto do disco), cai numa demonstração identificada.

Validação: roteiro Playwright (`scripts/qa/mini-mundo.mjs`) com **82 de 82 checagens ok e nenhum erro de console nos fluxos principais**, rodado no Chromium
com WebGL por software. Capturas e PNGs exportados estão em `evidencias/`.

## 2. Como abrir

```bash
npm run mundo:dados                                   # gera prototipos/meu-pequeno-mundo/dados/ a partir de data/generated
cd prototipos/meu-pequeno-mundo
python3 -m http.server 4321 --bind 127.0.0.1          # qualquer servidor estático serve
# http://127.0.0.1:4321/meu-pequeno-mundo-use-origens.html
```

- Sem backend próprio. Dependências externas: Three.js **0.186.1** (jsDelivr, versão fixa, via import map) e as fontes do storefront no
  Google Fonts. As imagens das camisetas vêm do host de imagens da INK (o mesmo que o storefront usa), com CORS liberado.
- Aberto por `file://`: modo **demonstração** (selo "Demonstração", 6 cidades de exemplo, "Catálogo ainda não conectado", CTAs de
  catálogo desabilitados, link do mundo desabilitado com explicação; download da imagem funciona).
- Prévia web (o link do mundo) funciona em qualquer `http(s)`. Nenhuma prévia foi publicada fora da máquina.

## 3. O que a pessoa faz

1. **Entrada** — marca, título "Os lugares que fazem parte de você.", apoio, CTA "Montar meu mundo" e uma prévia viva da maquete
   (três ilhas de exemplo — litoral, cerrado e ambiente amazônico — girando devagar, com as placas "Origem", "Presente", "Coração").
2. **Origem** — "Onde sua história começou?" + busca ("Cidade · UF", com a mesorregião embaixo). Ao escolher, a primeira ilha sobe da
   base com a vegetação e as casas brotando em sequência (~1,5 s). O painel oferece **"Adicionar onde vivo hoje"** e **"Ver meu mundo"**.
3. **Presente** — atalho **"Ainda vivo em Florianópolis"** (mesma cidade em dois papéis = uma ilha só, com a etiqueta "Origem ·
   Presente"), busca, ou **"Pular esta etapa"**.
4. **Coração** — atalhos com as cidades já no mundo, busca, **"Ver meu mundo"** (também conclui sem escolher).
5. **Resultado** — a maquete inteira, a lista acessível dos lugares (equivalente às ilhas), "Compartilhar meu mundo", "Baixar imagem",
   "Copiar link", "Editar lugares" e "Começar de novo" (com confirmação, foco inicial em "Manter meu mundo").
6. **Cidade** — toque na ilha, na placa, na etiqueta ou na lista: a câmera aproxima, a ilha ganha um contorno na cor da região, e o
   painel mostra papel(éis), cidade, estado/região, a paisagem (sempre marcada como ilustrativa), **"Ver camisetas de [cidade]"** (página
   real da cidade) e as camisetas (uma por família de estampa, foto real, link para a página real da estampa). Atalhos para a cidade
   anterior/seguinte.

Estado: até três papéis, uma ilha por cidade; adicionar, trocar, remover, voltar entre passos sem perder nada, concluir com 1, 2 ou 3.
Progresso salvo em `localStorage` (`useorigens:meu-pequeno-mundo`, `v: 1`); armazenamento bloqueado não impede o uso (aviso discreto no
resultado). O link `?mundo=1&origem=<id>&presente=<id>&coracao=<id>` tem prioridade sobre o salvo; durante a construção o endereço fica
limpo, então recarregar volta ao passo em que a pessoa estava.

## 4. Organização do arquivo

O `<script type="module">` é dividido em seções numeradas, cada uma com o que se espera alterar:

| Seção | Conteúdo |
|---|---|
| 1. TEXTOS | todo o texto da interface |
| 2. CONFIGURAÇÃO | `CATALOGO` (pasta de dados, hosts permitidos), regiões e selos, `PAISAGENS` (receitas dos cenários), `CURADORIA` |
| 3. DADOS | normalização e ranking da busca (portados do storefront), adaptador do catálogo, adaptador de demonstração |
| 4. ESTADO | papéis, persistência versionada, leitura/validação/escrita do link |
| 5. CENA 3D | gerador procedural das ilhas, pontes, câmera, animações, toque/arrasto, exportação da cena |
| 6. INTERFACE | painéis, busca (combobox), etiquetas, lista, painel da cidade, área livre para a maquete |
| 7. EXPORTAÇÃO | composição do PNG, compartilhamento nativo, download, cópia do link |
| 8. INICIALIZAÇÃO | ordem link > salvo > entrada, carga da cena, eventos |

## 5. Dados e catálogo

**Origem.** `scripts/mini-world-export.mts` lê só os snapshots locais (`data/generated`, os mesmos do `catalog:sync`) usando as funções do
storefront: `localitiesOfRegion`, `getCatalog().coveredLocalityIds` e `cityFamilies`. Nunca chama a INK. Saída (fora do git):

- `dados/indice.json` — 216 KB: 2.144 localidades com camiseta (Sul 1.191, Norte 450, Centro-Oeste 503, incluindo Regiões
  Administrativas do DF): ID estável (IBGE ou `df-ra:<slug>`), nome, UF, região, slug, apelidos curados, mesorregião, capital.
- `dados/lugares/<id>.json` — uma por localidade (~1,5 KB): URL real da página da cidade e o produto principal de cada família de
  estampa (nome da família, mockup, URL real da página da estampa). 16.842 produtos no total, **carregados só para as cidades
  escolhidas** (pré-carga ao escolher, para o painel abrir pronto).

**Regras preservadas.** IDs de localidade do storefront; rotas `/<região>/<uf>/<slug>` e `/<região>/<uf>/<slug>/<família>` (as mesmas do
App Router); o "produto principal" de cada família é o que a página da cidade já escolhe (`cityFamilies`). Amostra de 30 URLs exportadas
(10 cidades das três regiões, incluindo Taguatinga/DF) respondeu **200** em produção em 14/10/2026.

**Decisões.**
- O cartão da camiseta leva à **página da estampa no site** (não direto à INK): é o link canônico do nosso domínio, já cuida das
  variantes e da ida à INK. A página da cidade é o CTA principal.
- **Sem preços** no protótipo: o snapshot de Norte/Centro-Oeste é de 21/09 e o da Sul de 12/10 (com o teste de preço em andamento);
  mostrar preço velho seria pior que não mostrar.
- O HTML nunca transforma dado em HTML: tudo entra por `textContent`/atributos, e só viram `<a>`/`<img>` URLs `https` dos hosts
  permitidos (`www.useorigens.com.br`, host de imagens da INK). Nenhuma credencial no arquivo.
- **Busca**: mesma normalização (`src/lib/geo/text.ts`) e mesmo ranking (`src/lib/search/rank.ts`) do storefront — sem busca aproximada.

**Trocar pelo catálogo real ao integrar.** O protótipo só depende do contrato do adaptador (`carregarIndice`, `buscar`, `lugar`,
`produtos`). Dentro do storefront, `carregarIndice` pode ler `/api/cidades/<região>` (já existe, cacheável) e `produtos(id)` uma rota nova
e pequena por localidade (ou a página da cidade em RSC). Basta trocar `adaptadorCatalogo` na seção 3.

## 6. Cena 3D

- **Ilhas** procedurais: contorno orgânico, relevo suave, topo com cores por vértice (grama, areia, fundo d'água, lavoura, terra), bordas
  arredondadas, **estratos de solo visíveis** nas laterais e base de pedra afunilada. Água com ondas discretas (shader), recorte de
  água visível na lateral quando a costa ou o rio chegam à borda.
- **Paisagens** (interpretações ilustrativas, configuráveis em `PAISAGENS`): litoral, serra (araucárias), campos, vale (rio), interior
  (lavouras, silos, cercas), ambiente amazônico (mata densa, rio largo, palafitas, barcos), cerrado (árvores tortas, buritis, vereda,
  chapada, terra avermelhada) e áreas alagáveis (lagoas, juncos).
- **Curadoria explícita** (`CURADORIA`): por cidade (26 do litoral fora das mesorregiões costeiras, serra gaúcha, Pelotas, Foz, Bonito,
  Cáceres, Palmas, Lago Sul/Norte), depois pela **mesorregião do IBGE** que já está nos dados do storefront (57 mesorregiões das três
  regiões), e por fim uma base regional marcada **"Cenário ilustrativo"** (hoje: as Regiões Administrativas do DF e um município de MT
  sem mesorregião). Nenhuma regra liga uma região inteira a um símbolo cultural.
- **Determinismo**: tudo (contorno, relevo, posição de árvores e casas, cores) sai de um gerador com semente no ID da cidade. O mesmo link
  monta o mesmo mundo.
- **Microanimações**: ilha subindo e "brotando", vegetação balançando, água, barcos, tábuas da ponte sendo assentadas, contorno pulsante
  da ilha em foco, giro lento na prévia. Tudo desligado com movimento reduzido.
- **Câmera**: órbita com amortecimento, sem pan, ângulo vertical e distância limitados, "Visão inicial", botões de girar, teclado
  (setas, + e −, Home). A roda do mouse **não** dá zoom (rola a página quando o protótipo estiver dentro de uma página); pinça no
  trackpad e no celular, sim. O enquadramento desconta o painel (embaixo no celular, à direita no desktop). Em tela "em pé", as ilhas se
  arrumam de cima para baixo; em tela larga, da esquerda para a direita.
- **Toque × arrasto**: só abre cidade toque curto (< 8 px, < 600 ms, um dedo); arrastar gira.

**Desempenho.** Geometrias e materiais compartilhados (11 tipos de vegetação/construção em `InstancedMesh`, um material por tipo),
resolução limitada (1,75× no celular, 2× no desktop), sombra só do sol (1024² no celular), **mapa de sombra recalculado só quando algo
muda**, laço parado com a aba oculta, e com movimento reduzido só redesenha quando há mudança. Trocar/remover cidade descarta buffers,
texturas e instâncias da ilha: repetir trocas e remoções não acumula nada na GPU nem na cena (ver validação). Falha ao carregar o
Three.js ou ausência de WebGL viram uma apresentação estática com os mesmos lugares e o mesmo acesso às camisetas.

## 7. Exportação e compartilhamento

PNG **1080 × 1350** composto numa tela dedicada (sem capturar a interface): marca "USE ORIGENS" e "MEU PEQUENO MUNDO", a maquete
renderizada por uma câmera própria em 2× e reduzida (sem contorno de foco, placas viradas para a câmera da foto, animações concluídas),
a frase **"Esses lugares fazem parte de mim."** em Bodoni Moda, cada lugar único com o selo da região, os papéis e o nome (fonte
ajustada para nomes longos) e `useorigens.com.br`. Espera as fontes carregarem antes de desenhar. A imagem é pré-gerada ~2 s depois do
mundo pronto, para o compartilhamento nativo ser chamado dentro do gesto da pessoa (exigência do Safari).

- **Compartilhar meu mundo**: `navigator.share` com o arquivo quando `canShare({ files })`; cancelar a janela não muda nada; sem suporte,
  um diálogo oferece baixar a imagem e copiar o link.
- **Copiar link**: só com página `http(s)`; em `file://` o botão fica desabilitado com a explicação.
- Link: `?mundo=1&origem=…&presente=…&coracao=…`. Versão diferente, formato inválido, ID desconhecido ou link vazio → aviso claro, os
  lugares válidos ficam, e a pessoa cai no passo do papel que precisa ser escolhido de novo.

## 8. Validação feita

Executado de verdade, no navegador, com `scripts/qa/mini-mundo.mjs` sobre a prévia servida localmente (Chromium do Playwright
1.63, WebGL por software). Resultado da rodada final: **82 de 82 checagens ok, 0 falhas, 0 erros de console nos fluxos principais**
(`evidencias/resultado-qa.json`). Os únicos erros de console registrados vêm dos testes de falha proposital (WebGL desligado e
Three.js bloqueado) e são o próprio navegador avisando do recurso que não carregou.

| # | Critério | Como foi verificado | Evidência |
|---|---|---|---|
| 1 | Entrada, busca e primeira ilha | Entrada com prévia; "floria" → "Florianópolis · SC"; termo sem resultado explica; a ilha sobe e ganha etiqueta. Em 375×812 e 1440×900 | `mobile-01-entrada`, `mobile-02-busca`, `mobile-03-primeira-ilha`, `desktop-01…03` |
| 2 | Concluir com 1, 2 e 3 cidades | 1 (Belém, na demonstração), 2 (Florianópolis + Manaus) e 3 (troca do presente por Goiânia) | `desktop-17-demonstracao-arquivo-local`, `*-05-mundo-2-lugares`, `*-06-mundo-3-lugares` |
| 3 | Mesma cidade em dois papéis | "Ainda vivo em Florianópolis" → uma ilha, etiqueta "Origem · Presente" | `mobile-04-mesma-cidade` |
| 4 | Troca, remoção, reinício | Trocar cidade; remover o coração (2 ilhas); "Começar de novo" pede confirmação, cancelar mantém, confirmar apaga e volta à 1ª pergunta; recarregar depois abre a entrada | `resultado-qa.json` |
| 5 | Restaurar ao recarregar | Recarregar no resultado devolve os 3 lugares; recarregar no 3º passo volta ao 3º passo | `resultado-qa.json` |
| 6 | Painel da cidade e links reais | CTA `https://www.useorigens.com.br/sul/sc/florianopolis`; 8 camisetas com links `/sul/sc/florianopolis/<família>`; amostra de 30 URLs exportadas = 200 em produção | `*-07-cidade`, `*-11-cidade-belem` |
| 7 | Exportação e legibilidade | PNG baixado pela página tem 1080 × 1350 (desktop, celular, nomes longos, sem WebGL, demonstração) | `desktop-mundo-exportado.png` e `mobile-nomes-longos-exportado.png` (originais); as outras exportações em JPEG, só para caber no repositório |
| 8 | Compartilhar e baixar | Sem suporte: diálogo com baixar e copiar link. Com suporte (substituto de `navigator.share`): recebe `meu-pequeno-mundo-use-origens.png` (`image/png`) e a frase; cancelar mantém o resultado. Copiar link grava a URL na área de transferência | `desktop-08-compartilhar-sem-suporte` |
| 9 | Reabrir por URL | Navegador novo, sem nada salvo, abre `?mundo=1&origem=4205407&presente=5208707&coracao=1302603` com os 3 lugares | `*-09-aberto-por-link` |
| 10 | Parâmetros inválidos | Cidade desconhecida, versão 7, `<img onerror>` no ID e link vazio: aviso claro, nada injetado na página, lugares válidos mantidos, foco no papel a corrigir | `mobile-12-link-cidade-desconhecida` |
| 11 | 375 × 812 e 1440 × 900 | Sem rolagem horizontal (entrada, resultado, nomes longos); todos os botões, links e opções visíveis com ≥ 44 × 44 px no resultado e no painel da cidade; etiquetas sempre inteiras na tela e sem se cobrir | `mobile-*`, `desktop-*`, `mobile-18-nomes-longos` |
| 12 | Teclado e movimento reduzido | Enter num lugar da lista abre a cidade com foco no nome; Esc fecha e devolve o foco; setas e Enter na busca; setas, + e Home na maquete. Com `prefers-reduced-motion: reduce` tudo funciona, sem animação | `desktop-13-movimento-reduzido`, `desktop-14-teclado-busca` |
| 13 | Console | 0 erros nos fluxos principais | `resultado-qa.json` |

Também verificado:
- **Toque × arrasto**: arrastar a partir de uma ilha gira a maquete e não abre a cidade; um clique curto no mesmo lugar abre.
- **Sem WebGL** (contexto negado): apresentação estática com os lugares, camisetas acessíveis e imagem gerada (`mobile-15-sem-webgl`).
- **Three.js bloqueado**: aviso e a construção continua (`mobile-16-falha-cdn`).
- **Arquivo local** (`file://`): selo de demonstração, "Catálogo ainda não conectado", CTA desabilitado, copiar link desabilitado com
  explicação, download funcionando (`desktop-17-demonstracao-arquivo-local`).
- **Memória**: depois de um ciclo de aquecimento (as geometrias compartilhadas de cada tipo de árvore sobem para a GPU uma vez só),
  repetir 6 trocas + 1 remoção termina com exatamente as mesmas geometrias (36), texturas (6) e objetos de cena (71).
- **Cenário ilustrativo**: uma Região Administrativa do DF (sem mesorregião) mostra "Cenário ilustrativo · Cerrado".
- **Typecheck e lint** do script novo e do roteiro de QA: sem erros (`npm run typecheck`, `eslint`).

Não verificado: ver a seção 10.

## 9. Avaliação

Notas de 1 a 5, com o que as telas mostram.

**Clareza das escolhas — 4/5.** Cada passo mostra o papel, faz uma pergunta e mantém as três etapas visíveis com a cidade de cada
uma (`evidencias/mobile-03-primeira-ilha.jpg`). O atalho "Ainda vivo em…" resolve o caso mais comum sem nova busca
(`mobile-04-mesma-cidade.jpg`), e "Pular esta etapa" aparece como opção secundária, para não empurrar a pessoa a pular. A melhorar: no
celular a folha da construção ocupa ~55–60% da tela (`mobile-02-busca.jpg`) — pergunta em duas linhas, etapas e busca; com o teclado
aberto num aparelho real, a ilha só reaparece quando o teclado fecha.

**Qualidade visual da maquete — 4/5, o ponto mais forte.** Ilhas com espessura e estratos, base de pedra, sombras na "mesa", água com
recorte lateral e paisagens que se distinguem de longe (`desktop-10-tres-cidades-bage-curitiba-belem.jpg`: campos de Bagé com
lagoas e cercas, serra de Curitiba com araucárias, ambiente amazônico de Belém com rio, palafitas e barcos). A melhorar: com três
ilhas, a ponte entre a do fundo e a da direita às vezes fica atrás da mata (`desktop-06-mundo-3-lugares.jpg`); interior e vale ainda
se parecem; a vegetação low-poly é correta, mas genérica — é aqui que um ilustrador 3D faria mais diferença.

**Usabilidade no celular — 3,5/5.** Sem rolagem horizontal, alvos de toque ≥ 44 px medidos em todas as telas do resultado e da
cidade, toque × arrasto diferenciados, painel recolhível. O custo é o espaço: no resultado a maquete fica com ~40% da altura e, com três
cidades lado a lado, cada ilha tem uns 110 px de largura (`mobile-06-mundo-3-lugares.jpg`). As etiquetas ficam sempre inteiras na tela e
não se cobrem (deslizam ou sobem quando esbarram), mas nomes longos são cortados nelas — a lista mostra o nome inteiro
(`mobile-18-nomes-longos.jpg`).

**Visibilidade das camisetas — 3/5, o principal ponto a melhorar.** Cada lugar da lista tem "Camisetas →", e o painel da cidade abre
com o CTA para a página real e o carrossel de fotos reais logo acima da dobra (`mobile-07-cidade.jpg`, `desktop-07-cidade.jpg`). Mas a
tela de resultado não mostra nenhuma camiseta sem um toque. Para conversão, vale testar uma faixa com a estampa principal de cada lugar
logo abaixo da lista (os produtos já são pré-carregados ao escolher a cidade).

**Facilidade de compartilhar — 4/5.** "Compartilhar meu mundo" é o botão principal do resultado, a imagem fica pronta antes do clique,
há download e link como alternativas, e o cartão é limpo e legível, inclusive com nomes longos (`desktop-mundo-exportado.png`,
`mobile-nomes-longos-exportado.png`). Falta verificar o compartilhamento nativo em iOS/Android reais e a pré-visualização do link em
apps de mensagem (hoje genérica).

## 10. Limitações e o que não foi verificado

- **Ambiente de teste**: só Chromium (Playwright 1.63) no macOS, com WebGL por software (SwiftShader), em 1440×900 e em emulação de
  iPhone 13 a 375×812. **Não testado**: Safari/iOS, Firefox, Android real e aparelhos reais. Ficam sem verificação: fps num celular
  (no Chromium por software a prévia rodou a ~53 fps), o teclado do iOS sobre a folha inferior, `navigator.share` de verdade (o teste
  usa um substituto que confere o arquivo PNG, o texto e o cancelamento) e iOS anterior ao 16.4 (sem import maps: cai na apresentação
  estática, com aviso).
- **Zoom**: a roda do mouse não aproxima, de propósito (não sequestra a rolagem quando o protótipo estiver dentro de uma página). Pinça
  (trackpad e celular), teclado (+ e −) e o foco numa cidade aproximam.
- **Dados**: snapshot local (Sul de 12/10; Norte e Centro-Oeste de 21/09). Cidades que ganharem ou perderem camisetas depois exigem
  `npm run mundo:dados` de novo. Preços ficaram de fora.
- **Logo**: o repositório não tem um arquivo de logo "Use Origens" único. Usei o que o cabeçalho do storefront usa — o wordmark "USE
  ORIGENS" em Big Shoulders 900 (`src/components/layout/SiteChrome.tsx`) — e as etiquetas regionais (`public/brand/logo-*.png`,
  reduzidas a 96 px e embutidas). **Substituição pendente** se houver uma logo oficial em arquivo: troca pontual no cabeçalho e na
  exportação.
- As etiquetas sobre as ilhas são só para ponteiro (`aria-hidden`); o equivalente acessível é a lista de lugares do painel.
- O PNG exportado pesa ~1,1 MB (maquete renderizada em 2×). Dá para reduzir com WebP/JPEG se algum app reclamar.
- Prévia só local (`python3 -m http.server`). Nada foi publicado.

## 11. Pontos para integrar depois

1. **Página no storefront** (por exemplo `/meu-mundo`): o mesmo código como componente cliente, com o Three.js carregado só nessa
   página (import dinâmico), para não pesar o resto da loja.
2. **Adaptador vivo**: índice pelas rotas que já existem (`/api/cidades/<região>`, uma por região) e produtos por uma rota pequena por
   localidade (`/api/mundo/lugar/<id>`, cacheável) ou por RSC. A pasta `dados/` e o script de exportação deixam de ser necessários.
3. **Medição**: eventos `origens_mundo_*` (início, escolha por papel, conclusão, abrir cidade, clique em camiseta, compartilhar, baixar,
   copiar link) no padrão de `docs/analytics-origens-events.md`, e um marcador de origem nos links das camisetas (hoje sem parâmetro,
   porque `origens_src` tem lista fechada).
4. **Pré-visualização do link**: imagem Open Graph gerada no servidor com os nomes do mundo, para o link render bem no WhatsApp e no
   Instagram.
5. **Camisetas no resultado**: faixa com a estampa principal de cada lugar; preço vindo do catálogo vivo.
6. **Aparelhos reais**: iPhone (Safari) e Android (Chrome), medir fps e ajustar sombra e densidade de vegetação por aparelho.
7. **Curadoria**: revisar a tabela por mesorregião com quem conhece as cidades e criar cenários novos (pantanal próprio, serra do mar,
   praia de rio) só pela configuração `PAISAGENS`, sem mexer no gerador.
8. Painel de curadoria e backend continuam fora (como pedido nesta rodada).

## 12. Arquivos

| Arquivo | O que é |
|---|---|
| `prototipos/meu-pequeno-mundo/meu-pequeno-mundo-use-origens.html` | o protótipo |
| `prototipos/meu-pequeno-mundo/relatorio-meu-pequeno-mundo-use-origens.md` | este relatório |
| `prototipos/meu-pequeno-mundo/README.md` | como gerar os dados, servir e testar |
| `prototipos/meu-pequeno-mundo/evidencias/` | capturas reais (desktop e celular), PNGs exportados pela página e `resultado-qa.json` do QA |
| `scripts/mini-world-export.mts` | exportação dos dados do catálogo local (`npm run mundo:dados`) |
| `scripts/qa/mini-mundo.mjs` | roteiro de QA no navegador |
| `.gitignore` | ignora `prototipos/meu-pequeno-mundo/dados/` (gerado) |

Nada em `src/` foi alterado.
