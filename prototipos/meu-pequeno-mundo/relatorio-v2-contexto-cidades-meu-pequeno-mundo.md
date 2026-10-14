# Meu Pequeno Mundo — v2: identidade e contexto das cidades

Rodada de 14/10/2026, a partir do briefing `comando-claude-v2-contexto-cidades-meu-pequeno-mundo.md`. Continua um protótipo
independente: nada em `src/` mudou e nada foi publicado.

## 1. Resumo

- **Cenário por cidade.** Cada cidade com perfil tem ambiente, relevo, água, vegetação, construções e marcos próprios, montados a partir
  de uma biblioteca pequena de módulos. As cidades sem perfil continuam com o cenário regional ilustrativo da v1, gerado exatamente igual.
- **Piloto completo** com três perfis rastreáveis: **Nova Trento** (vale entre montes, Santuário Santa Paulina, cruz no alto do monte),
  **Tijucas** (rio atravessando a cidade em quadras, ponte, Casarão Gallotti com palmeiras e figueira) e **Garopaba** (mar aberto com
  espuma na praia, dunas com cristas, restinga, baleia-franca).
- **Descobertas.** Dois pontos por ilha do piloto: tocar no marco (ou no ponto sobre ele) abre um balão com título, duas ou três
  frases, nota de que a forma é simplificada e "Conhecer [cidade]". Uma descoberta aberta por vez; toque × arrasto separados; o mesmo
  conteúdo está na ficha, com "Ver na maquete" para teclado e leitor de tela.
- **Ficha da cidade** na ordem do briefing: cidade · UF e papel, frase editorial, resumo (51–63 palavras), até três referências,
  "Ver camisetas de [cidade]" sempre à vista (fixo no rodapé da ficha até chegar ao seu lugar), camisetas reais, "Mais sobre a cidade"
  recolhido e "Fontes" discreto.
- **O que conecta seu mundo**: quantos lugares e em quais estados, paisagens declaradas nos perfis e a distância origem–presente
  "aproximadamente X km em linha reta" entre as sedes do IBGE.
- **Lembrança pessoal** opcional (80 caracteres por cidade) na escolha e na ficha; só vai para a imagem e o link quando a pessoa marca
  "Incluir minhas lembranças".
- **Dados de contexto** num JSON versionado (`contexto/perfis-cidades.json`) com proveniência por fato, e ponto de referência +
  regiões do IBGE para 2.142 dos 2.144 lugares da loja (`contexto/sedes-municipais-ibge-2022.json`).

## 2. Como abrir

```bash
npm run mundo:dados
cd prototipos/meu-pequeno-mundo && python3 -m http.server 4321 --bind 127.0.0.1
# http://127.0.0.1:4321/meu-pequeno-mundo-use-origens.html
# piloto direto: …/meu-pequeno-mundo-use-origens.html?mundo=1&origem=4211504&presente=4218004&coracao=4205704
```

A entrada também mostra os três perfis do piloto (com os rótulos genéricos Origem, Presente e Coração).

## 3. Perfis do piloto

| | Nova Trento · SC (4211504) | Tijucas · SC (4218004) | Garopaba · SC (4205704) |
| --- | --- | --- | --- |
| Ambientes declarados | vale | rio, área urbana | litoral |
| Relevo | `vale-montes`: três montes no fundo, vale aberto na frente | `planicie` | `costa-dunas`: duas fileiras de dunas junto à praia, lagoa entre elas, morro verde ao fundo |
| Água | rio estreito no vale (corta antes dos montes) | rio largo atravessando a ilha diante da câmera | mar aberto (cor mais funda, ondas maiores, espuma na linha da praia) |
| Vegetação | mata, árvores redondas, arbustos | árvores, palmeiras, arbustos | restinga, arbustos, capim |
| Construções | casas de estilo colonial | quadras com ruas paralelas e transversais ao rio, casas voltadas para a rua e prédios baixos | casas açorianas perto da enseada, barcos |
| Marco principal (descoberta) | Santuário Santa Paulina: planta central, laterais côncavas brancas sobre vidro azul, torre com cruz, sobre plataforma com escadaria | Casarão Gallotti: sobrado de três pavimentos com porão alto rosado, fachada simétrica, frontão, escadaria de acessos laterais | Dunas do Siriú (o próprio relevo, com a face de sotavento sombreada) |
| Segundo ponto | Montes em volta do vale (cruz no alto do monte mais alto) | Rio Tijucas (ponte urbana) | Baleia-franca (dorso com calosidades e cauda, animada) |
| Referências da ficha | Santuário · Montes · Imigração trentina | Casarão · Rio Tijucas · Museu Tijucas | Dunas · Baleia-franca · Pesca da tainha e engenhos |
| Mais sobre | gentílico (com a variante "neo-trentino" registrada pelo IBGE), estado e região, divisão de 2017 e de 1990, sede, população (Censo 2022), área (2022), um fato histórico | idem | idem |

Os marcos são **formas simplificadas inspiradas** nos lugares, e a ficha e o balão dizem isso ("Na maquete, uma forma simplificada
inspirada no templo."). Nenhum é apresentado como reprodução. Posição, tamanho das ilhas e pontes seguem sem relação com a geografia,
com o aviso "Representação ilustrativa dos lugares…" no resultado, na ficha e no rodapé do PNG.

## 4. Fontes efetivamente usadas (consultadas em 14/10/2026)

| Chave no JSON | Fonte | O que veio dela |
| --- | --- | --- |
| `ibge-localidades-api` | IBGE, API de Localidades (municípios) | Código IBGE, região imediata e intermediária (2017), meso e microrregião (1990) |
| `ibge-censo-2022-4714` | IBGE/SIDRA, Censo 2022, tabela 4714 | População residente (13.727; 51.592; 29.959) e área territorial (402,852; 279,159; 114,773 km²) |
| `ibge-localidades-2022` | IBGE, Localidades do Brasil 2022 (KML por município, arquivo de 19/11/2025) | Coordenadas da sede municipal (e da Capital Federal e das RAs do DF) |
| `ibge-biblioteca-*` | IBGE, Biblioteca (histórico, gentílico, formação administrativa) | Gentílicos, datas de criação de distrito/vila/município, primeiros moradores, fundação de Garopaba (1846) |
| `nt-prefeitura-historico` | Prefeitura de Nova Trento, Histórico | Imigração a partir de 1875 (Valsugana e Monza), Lei nº 36/1892, montes e altitudes, canonização (2002), Santuário N. Sra. do Bom Socorro (1912) |
| `nt-prefeitura-santuario-20-anos` | Prefeitura de Nova Trento, notícia de 09/01/2026 | Dedicação do templo (22/01/2006), "duas mãos em oração", ~7 mil m² |
| `nt-turismo-santuario` | Portal Municipal de Turismo de Nova Trento | Chegada de Amábile Visintainer em 1875, visitantes |
| `alesc-vale-sagrado` | ALESC, reportagem de 09/10/2020 | Santuário N. Sra. do Bom Socorro no Morro da Cruz |
| `udesc-specula-gallotti` | UDESC/LabPac, ficha SPECULA do Casarão Gallotti (2011, revisão 2012) | Construção para Benjamin Gallotti, conclusão em 1898, estilo eclético, três pavimentos, escadaria lateral, tombamento estadual (Decreto 5.920/2002), doação (2006) e restauro (2009), jardim com palmeiras e figueiras |
| `tj-prefeitura-museu` | Prefeitura de Tijucas, Museu Tijucas | Inauguração (04/05/2012) no espaço do Casarão, exposição "TY Yuca" |
| `tj-prefeitura-livro-do-tombo` | Prefeitura de Tijucas, notícia de 16/09/2026 | Referência dos casarões tombados; **não usada para o Gallotti** (ver abaixo) |
| `gp-turismo-dunas`, `gp-turismo-destino` | Visite Garopaba (portal de turismo) | Dunas (~5 km, lagoas no verão, "Lençóis Catarinenses"), baleias-francas entre julho e novembro, cultura açoriana, tainha e engenhos |

Cuidados tomados:

- **Casarão e rio.** A notícia da prefeitura de Tijucas diz "às margens do Rio Tijucas" sobre o **Casarão Bayer**, não sobre o
  Gallotti. Por isso a ficha não põe o Gallotti na beira do rio. Na maquete o rio e a ponte são um segundo ponto, com nota de que são
  ilustrativos.
- **Datas.** Os textos separam início da imigração (1875), criação de distrito ou freguesia, elevação a vila e a município, e
  instalação. Em Garopaba, "fundada em 1846" aparece como "segundo o IBGE", porque é a palavra da fonte.
- **Origem dos nomes.** Para Tijucas (Ty-Yuca), o texto diz "o nome teria origem", como o histórico do IBGE. A etimologia de Garopaba,
  que diverge entre IBGE e portal de turismo, ficou fora.
- **Números.** População é **censitária** (Censo 2022), com ano e tipo; não há estimativa, e o campo `estimativa` fica `null`. A área
  é a oficial de 2022 do IBGE; o portal de turismo de Nova Trento traz outro número (402,118 km²) e não foi usado.
- **Gentílico.** O oficial do IBGE é "nova-trentino". O histórico do mesmo IBGE registra "nova trentino ou neo-trentino", que aparece
  como variante, sem escolher uma das formas em silêncio.
- **Leitura das fontes.** Os sites da prefeitura e do turismo de Nova Trento bloqueiam leitura automática (HTTP 403). Eles foram lidos
  no navegador e o texto foi conferido literalmente. A ficha da UDESC é um PDF lido com PDFKit.
- **Revisão editorial.** Os textos foram escritos a partir dessas fontes e **falta a revisão editorial da Use Origens**. O JSON marca
  `revisao.status: "curadoria inicial"`.

## 5. Camada de dados

`contexto/perfis-cidades.json` (versão 1), um registro por município, pelo **mesmo ID do catálogo** (o código IBGE). Os IDs da loja não
mudaram e os links da v1 continuam abrindo.

| Grupo | Campos |
| --- | --- |
| Identidade | `id`, `ibge`, `nome`, `uf`, `regiaoLoja` |
| Conteúdo | `frase`, `resumo` + `fontesResumo`, `referencias[]` (`tipo`, `titulo`, `texto`, `fontes`, `descoberta` com `modulo` e `nota`), `curiosidades[]`, `gentilico` (`oficial`, `variantes`, `fontes`) |
| Geografia e números | `sede` (lat, lon, definição, fontes), `populacao.censo` (valor, ano, fontes) e `populacao.estimativa` separada, `area` (km², ano, fontes), `regioes` (grande região, imediata, intermediária, meso, micro, fontes) |
| Visual | `ambientes`, `rotulo`, `base` (paleta), `cores`, `relevo`, `agua`, `vegetacao`, `construcoes`, `extras`, `marcos[]` (módulo + referência) |
| Catálogo | vem do arquivo de cada lugar (`dados/lugares/<id>.json`): página da cidade e camisetas |
| Proveniência | `fontes{}` (título, publicador, URL, referência temporal, data de consulta) e `revisao` |
| Cobertura | `cobertura`: `completo` / `basico` / `regional` (regras no topo do arquivo) |

Na página, `adaptadorContexto` carrega o arquivo uma vez (junto com o índice, antes de montar a cena) e confere tudo:

- texto vira texto puro;
- módulo visual só entra se estiver na lista `MODULOS`;
- referência, curiosidade e número sem fonte válida não entram;
- URL de fonte precisa ser https.

A cena recebe só o perfil visual (`receitaDe`), nunca o texto. Mudar um texto ou um perfil não toca nas funções de geometria.

As classificações aparecem separadas e nomeadas na ficha:

- grande região do IBGE;
- divisão regional atual de 2017 (região imediata e intermediária);
- divisão de 1990, substituída em 2017 (meso e microrregião);
- agrupamento na navegação da loja.

Nos estados da loja, a grande região do IBGE e o grupo da loja têm o mesmo nome, e a ficha diz qual é qual.

Não há busca nem geração de texto durante a visita. Sem o arquivo de contexto (por exemplo em `file://`), o mundo segue com o cenário
regional.

## 6. Cobertura real

| Nível | Lugares | O que tem |
| --- | --- | --- |
| Perfil completo | **3** (Nova Trento, Tijucas, Garopaba) | Texto, referências, descobertas, números do IBGE, cenário próprio, fontes |
| Básico | **2.139** | Sede municipal (ou ponto da RA do DF), região imediata e intermediária quando é município, mesorregião, camisetas; cenário regional ilustrativo; distância calculável |
| Só regional | **2** (RAs Arapoanga e Água Quente, criadas depois da base de 2022) | Camisetas e cenário regional; sem ponto, então sem distância |

Ninguém mais tem texto editorial. A busca segue com todas as 2.144 cidades, e uma cidade sem perfil não trava nada: a ficha diz
"Ainda não temos um texto sobre este lugar. As camisetas e os dados do IBGE estão aqui." e mostra só os campos confirmados.

## 7. Cena

- **Perfil → receita → ilha.** `receitaDe(lugar)` monta a receita (perfil ou curadoria). `criarIlha` aplica os módulos:
  - relevo: `vale-montes`, `planicie`, `costa-dunas`;
  - água: `rio` com direção e largura, `mar`;
  - construções: `colonial`, `urbano`, `acoriano`;
  - marcos: `santuario`, `pico-cruz`, `casarao`, `ponte-urbana`, `dunas`, `baleia`.

  Sob o santuário e o casarão o chão é aplainado em plataformas. Árvores, casas e a placa desviam dos marcos.
- **Mesmo mundo para os mesmos IDs.** Os módulos usam uma semente própria (`id:modulos`). Uma cidade sem perfil consome o gerador
  aleatório exatamente como na v1, então o link antigo mostra a mesma ilha.
- **Marcos** são geometrias compartilhadas, criadas na primeira vez que um perfil as pede. A ponte, que depende da largura do rio, é
  da ilha e é descartada com ela. A área de toque da cruz, das dunas e da baleia é maior que o desenho, com malhas invisíveis.
- **Toque.** O raio pega o alvo mais próximo da câmera: um marco abre a descoberta, o resto da ilha abre a ficha, a água fecha a
  descoberta. O arrasto continua girando, com o mesmo limiar da v1.
- **Pontos de descoberta** são botões HTML projetados sobre os marcos, como as etiquetas. Quando esbarram numa etiqueta ou noutro ponto,
  descem ou vão para o lado. Com uma ficha aberta, só os pontos daquela cidade ficam visíveis.

## 8. Lembranças, link, armazenamento e imagem

- **Lembrança.** Um campo por cidade, na escolha da etapa e na ficha. Como a lembrança fica no registro da cidade, a mesma cidade em
  dois papéis tem uma só. O texto passa por normalização NFC, remoção de controles e marcas de direção, junção de espaços e corte em 80
  caracteres, e entra sempre como texto. Acentos e emoji são preservados.
- **Incluir.** "Incluir minhas lembranças" (com a nota "Será incluída na imagem e no link compartilhados.") começa **desligado**. A
  escolha aparece só quando existe alguma lembrança. Desligado, a lembrança não vai para a imagem nem para a URL.
- **Link.** Continua `mundo=1`. As lembranças entram como parâmetros opcionais `lo`, `lp` e `lc` (no primeiro papel da cidade), que um
  leitor da v1 ignora. Na leitura são aceitas só para um papel com lugar válido e até 400 caracteres brutos. Não houve troca de
  versão, porque o formato só ganhou campos opcionais.
- **Armazenamento local.** O formato vai para a v2 (`lembrancas`, `incluirLembrancas`) e o v1 continua sendo lido e é migrado no
  próximo salvamento. "Começar de novo" apaga lugares e lembranças.
- **Imagem 1080 × 1350.** As ilhas com os marcos continuam como protagonistas. A lembrança aparece em itálico sob o nome, só quando
  incluída. Indicadores numéricos e texto da ficha ficam fora. No rodapé vai "Representação ilustrativa dos lugares". A imagem é
  desenhada por uma câmera própria, então balão, pontos e painéis nunca entram nela e continuam abertos depois de exportar.

## 9. Validação executada

Rodei `node scripts/qa/mini-mundo-v2.mjs` no Chromium do Playwright, com WebGL por software, em 1440 × 900 e 375 × 812, e repeti os
fluxos da v1 com `node scripts/qa/mini-mundo.mjs`. Resultado da v2: **111/111 checagens, 0 erros de console** (`evidencias-v2/resultado-v2.json`). Regressão da v1: **82/82 checagens, 0 erros de console** (`evidencias-v2/resultado-regressao-v1.json`).

| Critério do briefing | Como foi verificado | Evidência |
| --- | --- | --- |
| Três cidades diferentes na mesma composição | captura do mundo do piloto nos dois tamanhos; dois pontos por ilha | `evidencias-v2/desktop-03-mundo-piloto.jpg`, `mobile-03-mundo-piloto.jpg` |
| Ficha e descoberta de cada uma | balão do santuário e do casarão (um por vez, Esc fecha); fichas das três com frase, resumo de 40–70 palavras, até três referências, conteúdo da cidade certa, "Ver camisetas" visível sem rolar e com link real, camisetas, "Mais sobre" com dados datados e fontes https | `*-04-descoberta-santuario`, `*-05-ficha-*`, `*-06-ficha-nova-trento-mais-e-fontes` |
| Teclado e leitor de tela | "Ver na maquete" na ficha abre a mesma descoberta e leva o foco ao título | `resultado-v2.json` |
| 375 × 812 e 1440 × 900 | sem rolagem horizontal; alvos ≥ 44 px no resultado e na ficha | `resultado-v2.json` |
| Troca, remoção, cidades repetidas, uma cidade | mesma cidade em origem e presente: frase curta, sem "0 km", uma ilha; mundo com uma cidade: sem distância; regressão da v1 cobre troca, remoção e recomeço | `mobile-10-mesma-cidade`, `mobile-11-uma-cidade` |
| Cidade sem perfil | Bagé: aviso de que não há texto, dados do IBGE e camisetas, sem campos vazios, cenário ilustrativo, nenhum ponto de descoberta; distância Bagé–Curitiba pelas sedes | `mobile-12-ficha-sem-perfil` |
| Coordenada ausente | Bagé + RA Arapoanga: distância omitida | `resultado-v2.json` |
| Lembrança dentro e fora do PNG e do link | sem "incluir": URL sem `lo` e PNG sem lembrança; com "incluir": `lo` na URL e no link copiado (só um parâmetro, mesmo com a cidade em dois papéis) e PNG com lembrança; desligar tira de novo; texto do link com acento e emoji preservado, longo demais ou sem lugar ignorado, `<img …>` mostrado como texto | `desktop-07-exportado-sem-lembranca.png`, `desktop-08-exportado-com-lembranca.png` (e os do celular) |
| Restauração e links da versão anterior | recarregar mantém lembrança e escolha; link v1 abre o mundo; progresso salvo em v1 é restaurado e regravado em v2 | `resultado-v2.json` |
| Acesso às camisetas e CTA | "Ver camisetas de [cidade]" fixo à vista na ficha, com link da página real da cidade | capturas das fichas |
| Sem erros e sem degradação evidente | erros de console nos fluxos; trocas repetidas entre perfis (Bagé ↔ piloto) sem acumular geometrias, texturas ou objetos; movimento reduzido abre e posiciona a descoberta | `resultado-v2.json`, `desktop-10-movimento-reduzido-baleia` |

Também verificado: lint do script do módulo sem nomes indefinidos ou sem uso, `npm run typecheck` e eslint dos scripts novos.

## 10. Limitações e o que não foi testado

- **Navegadores e aparelhos.** Não testei Safari/iOS, Firefox, Android nem aparelhos reais. O fps num celular de verdade, o teclado
  virtual sobre o campo de lembrança e o `navigator.share` real seguem sem verificação. O WebGL por software do teste é mais lento
  que um aparelho e não serve para medir desempenho.
- **Revisão editorial.** Os três perfis estão rastreáveis, mas sem revisão editorial humana.
- **Formas dos marcos.** São interpretações simplificadas. A curadoria deve aprovar as formas do santuário e do casarão antes de
  qualquer uso público.
- **Cenários parecidos.** Fora do piloto, as cidades da mesma mesorregião seguem parecidas: variam só a semente e a curadoria regional.
  A biblioteca de módulos já permite dar cenário próprio a outras cidades, mas cada uma precisa de um perfil com fontes.
- **Distância.** É geodésica entre pontos do IBGE, arredondada (até 20 km de 1 em 1, até 200 km de 5 em 5, acima disso de 10 em 10). A
  ficha e o resultado dizem que não é distância por estrada.
- **Celular.** Com três ilhas, os pontos de descoberta ficam grandes em relação às ilhas. O balão aberto cobre boa parte da maquete,
  como um cartão.
- **Fora desta rodada.** Os achados do mapa de cliques para o UX (rodada anterior) continuam valendo. O único corrigido aqui foi o
  botão de recolher que aparecia no desktop sem efeito.

## 11. Próximos passos sugeridos

1. Revisão editorial dos três perfis e aprovação das formas dos marcos.
2. Um script de curadoria que monte o rascunho de um perfil a partir das APIs do IBGE (identidade, censo, área, gentílico, histórico),
   deixando para a pessoa só o texto e as referências culturais.
3. Novas cidades por prioridade de venda, com 2–3 módulos cada.
4. No storefront: servir os perfis pela mesma rota das cidades e reaproveitar a ficha na página da cidade.

## 12. Arquivos

- `meu-pequeno-mundo-use-origens.html` — protótipo atualizado.
- `contexto/perfis-cidades.json` — perfis do piloto.
- `contexto/sedes-municipais-ibge-2022.json` — pontos e regiões do IBGE.
- `scripts/mini-world-sedes.mts` — extrator das sedes.
- `scripts/mini-world-export.mts` — acrescenta ponto e regiões ao arquivo de cada lugar.
- `scripts/qa/mini-mundo-v2.mjs` — validação desta rodada.
- `scripts/qa/mini-mundo-cliques.mjs` — mapa de cliques do UX.
- `evidencias-v2/` — capturas e PNGs exportados.
