# Análise de UX da loja Use Origens (13/11/2026)

Escopo: site (`www.useorigens.com.br`, região Sul; Norte e Centro-Oeste só por `curl`) e a loja única na INK (`loja.useorigens.com.br/useorigens`), do primeiro acesso até a entrada do checkout. Nada foi digitado no checkout e não houve pagamento; carrinhos criados só em contextos de navegador descartáveis, com analytics bloqueado.

Método: Playwright/Chromium em contexto novo (1ª visita). Celular = iPhone 13, 390×844 (toque + UA mobile). Desktop = 1440×900. Medições por `getBoundingClientRect` e atributos do DOM; CLS/LCP de laboratório; tempos de rede por request; `curl` para redirects. Sem dados de GA4/Clarity: todo impacto é hipótese.

> **Atualização (13/11/2026, depois da revisão com o dono):** o achado #19 foi **retirado** (o popup está configurado para 25 s no painel; não é defeito). O #3 (`autocomplete` no checkout) **não será corrigido pelo Worker**: o checkout fica como está e o pedido vai para a INK. As correções de código estão em [`specs/001-correcoes-ux-loja`](../../specs/001-correcoes-ux-loja/spec.md).

## Evidências (capturas)
- E1 celular, home Sul, 1ª visita: [mobile-02-sul-primeira-visita-1-dobra.png](../screenshots/analise-ux-2026-11-13/mobile-02-sul-primeira-visita-1-dobra.png)
- E2 celular, cidade (Florianópolis): [mobile-07-cidade-floripa-1-dobra.png](../screenshots/analise-ux-2026-11-13/mobile-07-cidade-floripa-1-dobra.png)
- E3 celular, PDP INK, 1ª visita: [mobile-20-pdp-1a-visita-1-dobra.png](../screenshots/analise-ux-2026-11-13/mobile-20-pdp-1a-visita-1-dobra.png)
- E4 celular, PDP, clique sem escolher: [mobile-23-pdp-sem-tamanho.png](../screenshots/analise-ux-2026-11-13/mobile-23-pdp-sem-tamanho.png)
- E5 celular, pós-adição: [mobile-25-pos-adicao.png](../screenshots/analise-ux-2026-11-13/mobile-25-pos-adicao.png)
- E6 celular, carrinho: [mobile-26-carrinho.png](../screenshots/analise-ux-2026-11-13/mobile-26-carrinho.png)
- E7 celular, entrada do checkout: [mobile-27-checkout-entrada-full.png](../screenshots/analise-ux-2026-11-13/mobile-27-checkout-entrada-full.png)
- E8 celular, busca com erro de digitação: [mobile-04-busca-typo.png](../screenshots/analise-ux-2026-11-13/mobile-04-busca-typo.png)
- E9 celular, página da estampa: [mobile-08-estampa-1-dobra.png](../screenshots/analise-ux-2026-11-13/mobile-08-estampa-1-dobra.png)
- E10 celular, Natal em Família: [mobile-13-personalizar-natal-1-dobra.png](../screenshots/analise-ux-2026-11-13/mobile-13-personalizar-natal-1-dobra.png)
- E11 desktop, home Sul: [desktop-02-sul-apos-10s.png](../screenshots/analise-ux-2026-11-13/desktop-02-sul-apos-10s.png)
- E12 desktop, cidade: [desktop-07-cidade-floripa-1-dobra.png](../screenshots/analise-ux-2026-11-13/desktop-07-cidade-floripa-1-dobra.png)
- E13 desktop, PDP com opções escolhidas: [desktop-25-pos-adicao.png](../screenshots/analise-ux-2026-11-13/desktop-25-pos-adicao.png)
- E14 desktop, checkout: [desktop-27-checkout-entrada.png](../screenshots/analise-ux-2026-11-13/desktop-27-checkout-entrada.png)
- Métricas brutas: [metricas-celular.json](../screenshots/analise-ux-2026-11-13/metricas-celular.json)

## Atacar primeiro (esforço × impacto)
1. #7 "loja Use Sul" na página da estampa: 1 linha em `src/app/[region]/[uf]/[city]/[family]/page.tsx:112` (usar `checkoutStoreFor(region).finishIn`). Site.
2. #4 Endereço da loja no rodapé do checkout (", , , Tijucas"): completar no painel da INK. Minutos.
3. #8 Redirect 301 de `useorigens.com.br` para `www` + `storefront` do Worker (`stores.js`) para o `www`. Site + Worker.
4. #1 Subir a barra "Adicionar ao carrinho" acima do banner de cookies da INK no celular, reaproveitando o sinal que o Worker já usa para recolher o cupom. Worker.
5. #6 Busca tolerante a erro de digitação (maior ganho de descoberta). Site.
Decisão para o dono, não de código: #2 (caixa de marketing pré-marcada no checkout) é pergunta de LGPD, a levar à INK.

## Achados

| # | Sev. | Onde | Achado → impacto (hipótese) | Correção sugerida | Dono | Situação |
|---|---|---|---|---|---|---|
| 1 | Alta | Celular, PDP INK, 1ª visita | Banner de cookies da INK (só "Aceitar", sem "Rejeitar") cobre a barra fixa "Adicionar ao carrinho" (sobreposição medida 390×69) e corta o preço na dobra (E3). Quem vem do anúncio não vê preço e CTA juntos até aceitar | Reusar o sinal `data-promo-hidden="cookie-notice"` para subir a barra acima do banner; pedir "Rejeitar" à INK | Worker (compensa) / INK (banner) | Em PR: [worker-lojas #58](https://github.com/gatomazi/worker-lojas/pull/58). Com a barra subida ela passa a cobrir o preço no primeiro quadro (trade-off descrito no PR) |
| 2 | Alta | Checkout INK | Caixa "Gostaria de receber promoções…" já vem marcada (`checked=true` confirmado) (E7, E14). Consentimento por omissão: risco de LGPD | Levar ao jurídico e pedir à INK para desmarcar por padrão (ou ajustar no tema do checkout) | INK nativo | Novo |
| 3 | Média | Checkout INK | Nenhum campo tem atributo `autocomplete` (confirmado por `getAttribute`); e-mail é `type=email`, telefone e CPF `type=tel` (teclado certo), mas o CEP é `type=text inputmode=text` (teclado de letras). Autofill de nome/endereço prejudicado em ~12 campos no celular | `autocomplete` (email, given-name, family-name, tel, postal-code, street-address…) e `inputmode="numeric"` no CEP, **pedido à INK** (decisão do dono: o Worker não mexe no checkout) | INK nativo | Novo, vai como pedido à INK |
| 4 | Média | Checkout INK | Rodapé mostra ", , , Tijucas, Santa Catarina" (endereço da loja com campos vazios); placeholder em inglês "example@email.com"; título "Checkout". A tela diz "Preencha o endereço para ver as formas de entrega" (não testei se só o CEP basta). Dúvida de confiança no último passo | Completar rua, número e bairro no painel da INK; o resto como pedido à INK | Painel INK | Novo |
| 5 | Média | PDP INK | O POST do carrinho responde em 2,1–2,6 s (4 amostras) e a folha aparece ~0,3 s depois: o atraso é do servidor da INK, não da folha do Worker. Durante a espera o botão **já fica desabilitado** (Turbo, ~15 ms depois do toque, sem toque duplo) e o rótulo vira só um spinner sem texto. *(O primeiro relatório dizia "risco de toque duplo": não procede, conferido numa sonda na PDP real em 13/11.)* | Texto "Adicionando…" no botão (`data-turbo-submits-with`, atributo nativo do Turbo): [worker-lojas #58](https://github.com/gatomazi/worker-lojas/pull/58). A latência do servidor, pedir à INK | Worker (texto) / INK (latência) | Texto em PR; latência é da INK |
| 6 | Média | Busca (overlay) | "florianopolsi" → "Não encontramos nada" (apelido "floripa" funciona); o link "Ver todos os produtos para…" vem antes da mensagem (E8); campo com borda dupla (foco + sublinhado) | Tolerância a erro (distância de edição/trigramas sobre o índice de cidades, "Você quis dizer Florianópolis?"); mensagem antes do link; uma só borda | Site | Borda dupla aberta desde 21/09; resto novo |
| 7 | Média | Estampa e rodapé | `[family]/page.tsx:112` passa `storeName={`Use ${region.name}`}` fixo ao `VariantPicker.tsx:138` ("…você define na loja Use Sul"), ignorando `checkoutStoreFor()` (`commerce-mode.ts`), que no modo de loja única devolve "na nossa loja online" (o rodapé já usa). `SiteChrome.tsx:297` ainda diz "A experiência regional da Use Sul, agora dentro da Use Origens". A loja chega como "Use Origens" (E9, E3) | Usar `checkoutStoreFor(region).finishIn` na nota da estampa; decidir o texto do rodapé | Site | Novo |
| 8 | Média | Hosts | `useorigens.com.br` ainda responde 200 + noindex e a busca da INK envia para esse host sem www: consentimento, favoritos e Minhas Estampas ficam separados | 301 do host sem www para o www; `storefront` do Worker para o www | Site + Worker | Aberto desde 13/10 |
| 9 | Média (sazonal + estrutural) | Celular, home Sul (Black) | Dobra sem produto: faixa 34 px + topo 55 px + título de 3 linhas + 2º campo de busca + arte da oferta; dois campos de busca com placeholders diferentes ("Busque por tema" × "Busque sua cidade, estampa ou coleção…"); 1º card só na 4ª tela; a tabela "R$25/R$50" (imagem) fica sob os botões flutuantes (E1) | Um só campo de busca na dobra; produto antes da arte da oferta ou arte compacta; tabela de descontos como texto | Painel (ordem/arte) + Site (busca) | Novo |
| 10 | Média (sazonal) | Celular, Natal em Família | O campo do sobrenome está em y≈1318 (1,5 tela abaixo da dobra), depois do mockup (~360 px) e da grade de cores; na dobra só aparece o texto "É só um exemplo. Escreva o seu sobrenome" (E10) | Campo logo abaixo do título, mockup menor | Site | Novo |
| 11 | Baixa | Celular, todas as páginas | O cupom se esconde ao rolar (x=-56, volta ao subir), então a sobreposição é só em repouso na carga: cobre o COMPRAR do 1º card da cidade (E2) e a cor selecionada no Natal. O assistente (326,780) fica fixo e cobre a ponta do COMPRAR da coluna 2 enquanto os cards passam | Não mostrar cupom e assistente juntos na 1ª tela (assistente só após a 1ª rolagem) | Site | Aberto desde 13/10, mitigado em parte |
| 12 | Baixa | Cards | COMPRAR em cada card, mas a estampa diz "ESCOLHER TAMANHO NA LOJA"; coração e compartilhar em círculos cobrem a arte (E2, E12) | Um só rótulo ("Ver estampa"/"Escolher tamanho"); compartilhar fora da foto | Site | Aberto (catalog-ux-v1) |
| 13 | Baixa | Faixa do topo | Rola sem parar; texto cortado nos dois lados em 390 px. Com o cabeçalho, 91 px (11% da tela) antes do conteúdo; ~110 px na PDP | Mensagem fixa/rotativa sem rolagem no celular | Painel | Novo |
| 14 | Baixa (sazonal) | Desktop 1440×900, home Black | Arte "Quanto mais, melhor." cortada na borda direita; "Pergunte aqui" cobre "Desconto direto no carrinho" (E11) | Reenquadrar a arte; folga para o botão | Painel / Site | Novo |
| 15 | Baixa | Acessibilidade | Alvos < 44 px no celular (busca do topo 254×40, chips 40 px, breadcrumb 17 px, checkboxes de 16 px em Seja parceiro); texto de 10 px nas etiquetas "% OFF" (38 na home); animações sem botão de pausa (respeitam "reduzir movimento") | Mínimo 44 px nos alvos; 12 px nas etiquetas | Site | Novo |
| 16 | Baixa | Busca em página (desktop) | CLS intermitente: 0,534 em 1 de 3 execuções (elemento `on-brand`), 0,002 nas outras | Investigar | Site | Investigar |
| 17 | Baixa | PDP INK celular | Primeiro controle de compra a ~1.100 px (19 miniaturas antes); nada pré-selecionado, então ≥4 toques | — | INK nativo | Observação |
| 18 | Baixa | Minhas Estampas vazia | "Explorar estampas" é só um link de texto | Estilo de botão | Site | Novo |
| 19 | ~~A conferir~~ Retirado | Home Sul, 1ª visita | O popup da oferta não apareceu em 10 s com cookies pendentes. **Conferido:** `GET /api/offer-popup/sul` responde `delaySeconds: 25` (o painel está em 25 s, não em 8), e o código (`OfferPopupLoader.tsx`) não espera o aceite de cookies: só adia com menu, busca ou diálogo aberto, ou com a pessoa digitando. O aviso de cookies do site é `role="region"`, não bloqueia | Nenhuma | — | Sem defeito |

Nativos da INK sem ação nossa: PDP sem `<main>` e com 2 h1 (já registrado).

## Para o dono (não são correção de código)

Pedidos à INK ou decisões de painel e de texto. Nada aqui é feito por código neste trabalho.

| Item | O que fazer | Quem |
|---|---|---|
| #2 caixa de marketing pré-marcada | Decidir com o jurídico (LGPD) e pedir à INK para vir desmarcada | Dono + INK |
| #3 `autocomplete` e teclado numérico do CEP no checkout | Pedir à INK (campos: nome, e-mail, telefone, CEP, endereço, cidade, estado) | INK |
| #4 rodapé do checkout ", , , Tijucas" | Completar rua, número e bairro da loja no painel da INK | Painel INK |
| #5 POST do carrinho de 2,1–2,6 s | Pedir à INK para olhar a latência do servidor (o texto "Adicionando…" já vai no worker-lojas #58) | INK |
| #17 primeiro controle de compra a ~1.100 px na PDP | Observação para a INK (ordem do bloco de miniaturas) | INK |
| #8 busca nativa da INK que posta para o host sem www | Ajustar no painel da INK depois que o 301 estiver no ar | Painel INK |
| #9, #13, #14 home Black, faixa do topo, arte da oferta | Ordem das seções, faixa fixa no celular e reenquadrar a arte | Painel |
| #12 rótulo do botão do card | Decidir o texto ("COMPRAR" × "Escolher tamanho") | Dono |
| #15 "% OFF" com 10 px e alvos de toque | Decisão de design (etiqueta da #172) | Dono + design |
| Texto do rodapé `SiteChrome.tsx:297` e do SEO `seo/copy.ts:102` | Decidir se "Use Sul" fica nesses dois textos na loja única | Dono |
| #16 CLS intermitente na busca | Só investigar se reproduzir | Site |

## O que funciona bem
- Site: 1 h1 por página, `<main>`, link de pular, `lang="pt-BR"`, imagens com `alt`, sem rolagem horizontal; LCP 0,5–1,1 s e CLS ≈ 0 em laboratório; 404 útil (busca + "Voltar ao Sul").
- Cidade: trilho de peças em uma linha e legenda "9 estilos em Camiseta clássica"; coleção com Filtrar + ordenar (corrigidos desde 11/10). Busca na página do estado legível e botão "Fechar" do menu visível (corrigidos desde 21/09).
- Busca: apelido funciona; no desktop mostra cidades e canecas com aviso de compra separada.
- Estampa → PDP: CTA claro e nota sobre onde se define tamanho/cor/frete.
- PDP INK: barra fixa de compra (cinza até escolher), clique sem escolher rola até a opção e avisa "Selecione o modelo", nome da cor depois de escolher, medidas do tamanho, CEP e cupons na própria página, 149 avaliações, guia "Procurando sua cidade ou outra estampa?". O cupom já não cobre o preço na PDP (item 1 de 13/10).
- Pós-adição: folha com progresso do desconto Black ("Faltam 2 peças para R$ 25 OFF"); carrinho com oferta "só neste pedido".

## Limites
- Só Sul testado em tela; um produto no fluxo da INK; sem aparelho real, login, pedido, conversa com o assistente; checkout só na 1ª tela.
- "Sua cidade" (`?abrir=cidade`, a página de destino dos anúncios): vi os passos 1 e 2 (celular e desktop). O campo do passo 1 tem 768 px no desktop (o problema de 1.344 px da crítica de 28/10 foi corrigido). Não percorri o passo 3 nem reconferi os outros dois P1 da crítica (botão de compra abaixo da dobra em notebook; trilho sob a barra no celular).
- Durante o teste, 2 cargas da INK estouraram 30–45 s no Playwright (o `curl` respondeu em ~1 s) e um `curl` em `/norte` devolveu 502 uma vez. Podem ter sido causados pelo volume dos meus testes; não reproduzidos.
