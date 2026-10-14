# Meu Pequeno Mundo — v2.1: acabamento de UX

Rodada de 14/10/2026, a partir do briefing `comando-claude-v21-acabamento-ux-meu-pequeno-mundo.md`. Mantém a arquitetura, os perfis e o
estilo da v2. Feita na mesma branch da v2 (`feature/meu-pequeno-mundo-v2`, PR #72). Não houve merge nem publicação.

## 1. O que mudou para quem usa

### Resultado no celular: espaço de volta para o mundo

- O painel começa **compacto** e mostra só o essencial:
  - o título;
  - um cartão por cidade, com uma camiseta real, o nome, **Conhecer** e **Camisetas →**;
  - **Compartilhar meu mundo**.
- No compacto, os cartões ficam lado a lado e o próximo aparece pela borda.
- **Detalhes** abre o resto, e o mesmo botão vira **Menos** para recolher:
  - O que conecta seu mundo;
  - incluir lembranças;
  - Baixar imagem;
  - Copiar link;
  - Editar lugares;
  - Começar de novo;
  - o aviso ilustrativo.
- O enquadramento usa a altura real do painel nos dois estados. Em 375 × 812, o painel compacto ocupa cerca de 37% da tela, e o mundo
  fica com quase o dobro da altura que tinha na v2.
- Abrir uma ficha foca a ilha. Fechar restaura o conjunto.
- No desktop o painel continua com tudo aberto, agora com os cartões das cidades.

### Produtos e ações com destinos claros

- Cada cidade mostra **uma camiseta real** (foto do catálogo, levando à página da estampa).
- **Conhecer** é um botão que abre a ficha. **Camisetas →** é um link para a página da cidade na loja, em outra aba. Não há link dentro
  de botão.
- Se o arquivo de uma cidade falhar, só aquele cartão mostra "Não carregou / Tentar de novo". As outras cidades e o compartilhamento
  seguem normais.

### Descobertas: área grande, desenho discreto

- O ponto visível tem **18 px no celular e 20 px no desktop**, preenchido, sem sombra. Ele pulsa duas vezes ao aparecer e depois
  para. A área de toque continua com **44 × 44 px**.
- Na visão geral **não há pontos**: os marcos (santuário, casarão, dunas, baleia) são clicáveis por si. Os pontos aparecem só na
  **cidade em exploração**, que é a da ficha ou a da descoberta aberta.
- A colisão considera a área de toque inteira, e não só o círculo desenhado. Quando dois pontos ou um ponto e uma etiqueta esbarram,
  o ponto desce ou vai para o lado.

### Descoberta curta no celular

- No celular, a descoberta é um **cartão compacto encostado no painel**, com o nome do marco, uma ou duas frases do novo campo `curto`
  do perfil e "Conhecer [cidade]". O texto completo, as datas e as fontes ficam na ficha.
- Abrir o cartão recolhe os detalhes do painel, para nunca haver um cartão grande e um painel aberto ao mesmo tempo.
- O fechar tem 44 × 44 px (antes, 40 × 40).
- Tocar no espaço vazio fecha o cartão. Arrastar a câmera não fecha.
- No desktop continua o balão completo ao lado do marco.
- Fica uma descoberta por vez. O foco volta ao cartão da cidade ao fechar com o teclado.

### Ficha em camadas

Nova ordem:

1. Papel e fechar, numa faixa que fica presa no topo.
2. Cidade · UF e estado.
3. Frase curta (uma linha no desktop, duas no celular).
4. **Ver camisetas de [cidade]** e uma prévia de até quatro camisetas reais.
5. **Conheça este lugar**, recolhido, com o resumo e as referências.
6. Lembrança.
7. Mais sobre a cidade e Fontes, recolhidos.

Durante a rolagem, o botão de camisetas e o fechar ficam sempre na tela: o botão fica preso embaixo até chegar ao seu lugar e, depois,
logo abaixo do topo.

Quando a ficha é aberta por um marco (ou pelo toque no marco com a ficha aberta), "Conheça este lugar" abre e a referência do marco
fica realçada. Aberta pela ilha, pela etiqueta ou por "Conhecer", ela abre no estado compacto.

### Cidades sem perfil

- Saiu o aviso "Ainda não temos um texto sobre este lugar…".
- A ficha mostra cidade, estado, camisetas, os dados confirmados do IBGE (em "Mais sobre a cidade") e uma linha discreta de
  cenário ilustrativo. As seções editoriais ausentes não aparecem.
- A cobertura continua explícita no relatório da v2 e no campo `cobertura` do JSON.

### Achados de interação corrigidos

| Achado | Agora |
| --- | --- |
| Tocar fora não fecha a ficha | No espaço vazio, com a ficha aberta, ela fecha e o mundo volta ao conjunto. Só com uma descoberta aberta, fecha a descoberta. Outra ilha troca a cidade. Arrasto e pinça não fecham, e interação dentro do painel não chega à maquete. |
| Lupa, dica e cartão da cidade sem resposta | A lupa e a dica do centro levam o foco à busca (a dica virou botão). O cartão escolhido é um botão "Trocar [cidade]", acionável pelo teclado. |
| Troca sem contexto | Uma faixa "**Trocando Tijucas** · Cancelar" aparece na busca. Cancelar mantém a cidade e devolve o foco ao cartão. Ir para outra etapa ou Voltar também desiste da troca. |
| Três botões iguais na etapa 2 e "pular" em destaque na etapa 3 | Só há botão cheio quando há escolha (próxima etapa ou "Ver meu mundo"). "Pular esta etapa" e "Ver meu mundo" (com algo já escolhido) são links de texto, iguais em todas as etapas. Na etapa 3 vazia aparece "Pular e ver meu mundo", também como texto. As abas livres continuam: um mundo só com o lugar do coração funciona. |
| Câmera antes da primeira ilha | Os controles de câmera aparecem depois da primeira ilha. |
| Visão inicial com duplo sentido | Com a ficha aberta, o controle se chama **Voltar ao mundo** (fecha e restaura a câmera). Fora disso, **Visão inicial**. |
| Botão de recolher do desktop (v2) | Continua corrigido: o botão de recolher saiu, e "Detalhes" só existe no celular. |

### PNG

As lembranças agora **quebram em até duas linhas**:

- quebra por palavra;
- uma palavra que não cabe sozinha quebra por caractere;
- emoji é tratado como uma unidade (`Intl.Segmenter`);
- a fonte reduz até 22 px antes de quebrar mais.

Testei com três lembranças de 79–80 caracteres (com espaços, sem espaços e com emoji) e três nomes longos ("Vila Bela da Santíssima
Trindade", "Santa Terezinha do Progresso", "Santa Cruz de Monte Castelo"): sem corte nem sobreposição. A conferência foi visual, pela
captura `*-12-exportado-nomes-longos-e-lembrancas.png`.

## 2. Ajuste editorial

- **Frases de apresentação**, a primeira camada da ficha. A cronologia foi para "Conheça este lugar":
  - Nova Trento: "Raízes trentinas, vale entre montes e caminhos de fé."
  - Tijucas: "Um rio, casarões tombados e a memória guardada no museu."
  - Garopaba: "Litoral de dunas e tradições ligadas à pesca."
- **Santuário.** A referência agora separa as áreas, conforme a página do próprio Santuário: o templo tem **6.740 m²** e o conjunto
  soma **cerca de 9.000 m²** de área construída. Antes era "cerca de 7 mil m² de área construída", número da notícia da prefeitura. A
  fonte nova `santuario-historia` (consultada em 14/10/2026) é a principal da referência.
- **Textos curtos (`curto`)** para o cartão do celular, nas seis referências com marco, todos derivados do texto completo já com fonte.
- O texto da referência "Rio Tijucas" segue dizendo "em busca de pinheiros", como o IBGE.
- `contexto/perfis-cidades.json` completo segue no pacote, para conferir a proveniência por fato.

## 3. Validação executada

Chromium do Playwright, WebGL por software, 375 × 812 e 1440 × 900. Resultados nos arquivos de `evidencias-v21/`:

| Roteiro | Resultado |
| --- | --- |
| `scripts/qa/mini-mundo-v21.mjs` (novo, esta rodada) | **60/60 checagens, 0 erros de console** (`resultado-v21.json`) |
| `scripts/qa/mini-mundo-v2.mjs` (v2, adaptado ao painel compacto e aos pontos por cidade) | **113/113, 0 erros de console** (`resultado-regressao-v2.json`) |
| `scripts/qa/mini-mundo.mjs` (regressão da v1, adaptado) | **82/82, 0 erros de console** (`resultado-regressao-v1.json`) |

O roteiro novo cobre o que o briefing pediu:

- resultado compacto e expandido, com o enquadramento mudando e voltando;
- etiquetas sem corte;
- pontos legíveis (18 px), só na cidade em exploração, com 44 px de área e sem sobreposição com etiquetas ou entre si;
- cartão curto encostado no painel, que deixa a maquete à vista;
- fechar do cartão e da ficha pelo vazio, sem fechar durante o arrasto;
- "Ver camisetas" e o fechar visíveis no fim da rolagem;
- produtos na primeira tela da ficha;
- marco com a ficha aberta realçando a referência;
- "Voltar ao mundo";
- erro de produto restrito a um cartão, com nova tentativa;
- lupa, dica, cartão "Trocar", "Trocando … · Cancelar" e etapas;
- mundo só com o lugar do coração;
- cidade sem perfil sem o aviso;
- todos os alvos ≥ 44 px nos estados alterados (inclui o fechar do balão);
- PNG com lembranças longas.

**A contagem de asserts não substitui a revisão visual.** Revi as capturas de cada estado nos dois tamanhos. Também ajustei o que só
apareceu nelas: o estado expandido escondia as ilhas atrás do painel, e o botão de camisetas não ficava preso por causa do respiro do
painel.

**Não testado:** Safari/iOS, Firefox, Android e aparelhos reais. Isso inclui teclado virtual sobre o campo de lembrança, toque real,
compartilhamento nativo e fps. Nenhuma aprovação nesses ambientes está sendo declarada.

## 4. Pacote para avaliar

`npm run mundo:pacote` monta `prototipos/meu-pequeno-mundo/pacote/meu-pequeno-mundo-v2.1.zip` (fora do git), com os caminhos relativos
que a página usa:

- o HTML;
- `contexto/` (perfis e sedes);
- `dados/` (índice e um arquivo por lugar, já exportados do catálogo);
- os relatórios;
- `evidencias/`;
- um `LEIA-ME.md`.

Para rodar, basta um servidor estático na pasta descompactada (`python3 -m http.server 4321`), sem regenerar o catálogo nem acessar
outro repositório.

**Dependências externas** que continuam necessárias:

- Three.js 0.186.1 pelo jsDelivr. Sem ele, a página mostra a apresentação estática com as camisetas.
- Fontes pelo Google Fonts. Sem elas, o navegador usa as fontes do sistema.
- Fotos das camisetas, servidas por `gcp-images.majestic.ink.rsvcloud.com`.
- Links para `www.useorigens.com.br` e para as fontes citadas.

**O pacote não funciona offline.** Aberto por `file://`, entra em modo de demonstração.

Não há assets locais além desses arquivos: os selos regionais estão embutidos no HTML.

## 5. Limitações

- **Navegadores e aparelhos.** Valem as mesmas da v2: sem teste em Safari/iOS, Firefox, Android e aparelhos reais.
- **Revisão humana.** Os textos dos perfis (incluindo os novos `curto`) e as formas dos marcos continuam pendentes de revisão
  editorial humana.
- **Cartões no celular.** No compacto, só o primeiro cartão aparece inteiro; o segundo aparece pela borda.
- **Foto quando o arquivo falha.** "Camisetas →" depende do mesmo arquivo do lugar. Se ele falhar, o link fica desabilitado até
  "Tentar de novo".
- **Escopo.** Como pedido, nenhum perfil novo, nenhuma curadoria em lote e nenhuma integração ao storefront.
