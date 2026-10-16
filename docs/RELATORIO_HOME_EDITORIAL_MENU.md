# Home editorial e menu: refinamento sobre a base

A home `/sul` e o menu do topo foram refinados na base existente, seguindo a direção do protótipo e o pedido `CLAUDE_REFINAMENTO_HOME_MENU_USE_ORIGENS`. Tudo o que muda a composição da home é **opção do painel**: as seções ganharam composições novas, os cards de coleção ganharam os formatos A e B, e o card de produto ganhou o estilo "chamada ao lado do preço". Sem publicar no painel, a loja continua com a composição de hoje.

**O que muda com o deploy, sem passar pelo painel:**

- o botão "Sua cidade" na barra;
- a sigla e o número de cidades no menu Estados;
- o menu do celular começando pela busca, com sigla e número de cidades nos estados;
- os menus abertos: um por vez, e fecham ao escolher um link da mesma página;
- os três cards da abertura atual passam a seguir o botão global dos cards (hoje, em produção, a barra "Ver produto");
- o bloco Meu Pequeno Mundo com fundo de ponta a ponta;
- o "Ou explore por estado" só aparece quando a home tem a seção de estados;
- as vitrines abaixo da dobra deixam de carregar fotos com prioridade.

Não houve merge, deploy nem publicação em produção. A prévia roda no sandbox local do CMS (`data/admin-dev`).

## Como abrir a prévia

```bash
npx tsx scripts/home-editorial-draft.mts   # monta o rascunho da Sul no sandbox local (data/admin-dev)
npm run cms:dev                            # depois: /admin/publicar → "Publicar no sandbox local"
```

O script parte da release que está viva no sandbox. Só mudam a home, o menu e o botão dos cards; cupons e tracking ficam como estão. As seções antigas (Da Nossa Terra, Redesenhos, Feito Para Você, Fala daqui, DDD) ficam no rascunho, **desligadas**, e voltam com um clique.

## Composição da home

1. **Abertura** (composição "Um produto em destaque"): título, apoio, a busca real por cidade e um único produto grande (nome, lugar, preço e "Ver produto →"), sobre a foto da região com o véu claro. No celular, o produto vira um card horizontal logo abaixo da busca, e os dois cabem na primeira tela.
2. **Estados** ("Faixa compacta"): uma faixa de ponta a ponta. Cada estado é um link inteiro, com a sigla, o nome e "Ver 497 cidades →". No celular, uma linha por estado.
3. **Estilos da cidade** ("Título ao lado", 3 estilos): o título numa coluna e os três estilos ao lado. No celular, os cards rolam para o lado.
4. **Coleções** (grade com os formatos A e B): Da Nossa Terra (A), Fala Daqui (B) e Do Nosso Jeito (A), cada uma levando à página da coleção.
5. **Campanha** ("Dividida"): de um lado, duas camisetas reais da coleção do botão (Do Nosso Jeito); do outro, o texto sobre o verde da região. Uma ação só: "Conhecer as releituras".
6. **Seleção curta**: 4 produtos da coleção Novidades em grade, com "Ver novidades".
7. **Rodapé**: sem mudança. O apoio à compra continua sendo o texto do rodapé ("finaliza a compra na loja, onde ficam tamanho, cor, frete e pagamento"). Não criei FAQ porque não há respostas validadas sobre frete, trocas ou medidas.

O Pódio ("Quem está no pódio?") continua logo depois dos estados, com respiro próprio quando vem depois da faixa. Ele já se desliga por região no painel.

## Como cada ponto do feedback foi resolvido

| # | Feedback | Solução |
| --- | --- | --- |
| 1 | Produtos flutuando; preço e seta soltos | Novo estilo de card, "chamada ao lado do preço": o preço e "Ver produto →" ficam na mesma linha, sobre um fio, dentro do card (em card estreito, a chamada desce para baixo do preço). O card inteiro é um link (foto, nome, preço e chamada), sem link ou botão aninhado. Vale para a abertura, os estilos, a seleção e as demais vitrines quando escolhido em Aparência. |
| 2 | Seta que não leva a nada | A seta solta da campanha não foi trazida. A única ação da campanha é o botão com destino real (`/sul/colecoes/do-nosso-jeito`). Verificado por teste: uma ação só na seção. |
| 3 | Cards de coleção alternando produto e mini banner | Formato por card no painel: **A**, camiseta real da coleção sobre cor; **B**, mini banner com imagem própria do celular e enquadramento. Na prévia ficam A, B, A, com o banner no meio como ponto de ritmo. |
| 4 | Áreas que parecem clicáveis e não levam a nada | Revisão da home inteira: nenhuma âncora `#` sem alvo (o link "Ou explore por estado" só aparece quando a home tem a seção de estados), nenhum elemento aninhado, e o hover dos estados só existe no link. O menu fecha ao escolher um link da mesma página. |
| 5 | Estados mal posicionados | Faixa com a mesma grade em cada estado: sigla em coluna fixa, nome e chamada. As três entradas têm a mesma altura e os nomes alinhados, inclusive "Rio Grande do Sul" (medido: 88 px cada, mesmo topo). No menu aberto, a mesma estrutura: sigla, nome e número de cidades. |
| 6 | Abertura com imagem de fundo | A composição "Um produto em destaque" usa a foto da região (imagem e enquadramento por dispositivo, editáveis) sob o véu claro. Sem imagem, o layout continua de pé sobre o fundo da página. |
| 7 | Corte de cor nas laterais | Fundos de seção (faixa dos estados, coleções, campanha, abertura, bloco Meu Pequeno Mundo) vão de ponta a ponta; só o conteúdo respeita o contêiner. Conferido em 1920 px. Não usei `overflow-x: hidden`. |

## Menu

- **Barra:** Sua cidade · Estados ▾ · Coleções ▾ · Novidades (Canecas aparece em produção, onde a seção da Uma Penca existe; no sandbox local não há o feed).
  - **"Sua cidade"** é um botão que abre a busca real.
  - **Estados ▾:** sigla, nome e número de cidades em cada entrada.
  - **Coleções ▾:** o nome e uma descrição curta, editável no painel.
- **Comportamento dos menus abertos:**
  - só um aberto por vez;
  - clicar fora fecha;
  - Escape fecha e devolve o foco;
  - escolher um link da mesma página (por exemplo, `#estados`) também fecha.
- **Celular:** "Sua cidade" (campo de busca) primeiro, depois os estados (sigla, nome e cidades), depois as coleções com descrição. Escolher uma cidade na busca aberta pelo menu fecha o menu e a busca. A rolagem da página volta ao normal.

## O que fica editável no painel

| Onde | Opção |
| --- | --- |
| Home → seção de abertura | Composição: "Três produtos" (atual) ou "Um produto em destaque" (o primeiro dos produtos escolhidos). Imagem do celular e do desktop, enquadramento e véu (já existiam). |
| Home → Escolha seu estado | Composição: "Cartões com capa" (atual) ou "Faixa compacta". Cor de fundo. |
| Home → Estilos da cidade | Composição: "Grade" (atual) ou "Título ao lado". Quantidade de estilos. |
| Home → Campanha | Composição: "Bloco escuro" (atual) ou "Dividida". A imagem vira a metade da foto; sem imagem, entram duas camisetas da coleção do botão. A cor pinta o lado do texto. |
| Home → Grade de imagens, cada bloco | Formato (clássico, A ou B), chamada, cor do card, texto claro ou escuro (ou automático pela cor), imagem do desktop, imagem do celular, texto alternativo e enquadramento por dispositivo. |
| Aparência → Botão nos cards | Novo formato: "Chamada ao lado do preço". |
| Menu (Navegação) → Descrições das coleções | Uma linha por coleção, até 80 caracteres. |
| Menu (Navegação) → blocos e links | Já existia. Na prévia: "Coleções" como nome do menu; Estados antes de Coleções no celular; "Estilos" e "Estados" (âncoras da home) fora da barra. |

## Assets

Todos reais e já no projeto: a foto da abertura (`/banners/sul/hero-*`) e a do "Fala Daqui" (`/banners/sul/fala-daqui-*`). As camisetas vêm do catálogo sincronizado e não ficam copiadas no CMS. Para um mini banner melhor em "Da Nossa Terra" ou "Do Nosso Jeito", falta uma foto de campanha com a camiseta vestida. Não criei nenhuma imagem.

## Verificação

Detalhes e evidências em `docs/evidence/home-editorial/`.

- **Telas:** 360, 390, 430, 1366, 1440 e 1920 px, antes e depois, sem rolagem horizontal em nenhuma.
- **Interação:** 39 de 39 verificações (busca com resultado e vazia; destaque leva à PDP interna; faixa; cards de coleção; campanha; cards de produto por foto, nome e chamada; foco visível; menus abertos, clique fora, Escape e foco; menu mobile com rolagem travada e destravada; alvos de 44 px em 360, 390 e 430).
- **Páginas compartilhadas:** estado, coleção, cidade, PDP e busca respondem 200, sem rolagem horizontal e sem elementos aninhados.
- **Peso das imagens da home**, no mesmo servidor e com o mesmo código, composição antiga × nova:
  - desktop 1440: 1,47 MB → 0,35 MB (62 → 15 imagens);
  - celular 390: 0,91 MB → 0,43 MB (51 → 15).

  É peso de imagens; não é medida de conversão.
- **Testes:** unitários 1597 de 1597 (15 novos).
- **e2e da vitrine:** `sul`, `tracking-and-nav`, `mobile-menu`, `global-search`, `seo`, `city-garment-tabs`, `share-size-guide` e `cart-mirror`, 192 testes. Ficam só as 4 falhas que já existiam:
  - a altura da página de estado, que mede os mesmos 6809 px sem as minhas mudanças;
  - 3 testes do seletor "Sul", que não existe com uma região só no ar.

  O `mobile-menu.spec` foi atualizado para a nova hierarquia. Um teste de `tracking-and-nav` clicava "fora dos links" numa posição que caía em cima do primeiro link (o padding do painel é de 4 px); a posição foi corrigida.
- **Impeccable** (v4.5.0): detector sem achados nos arquivos alterados; crítica de layout e craft floor aplicadas (sem eyebrow, sem números de seção, elevação só por borda, contraste conferido).

## Limitações

- A prévia usa o catálogo e o sandbox locais. A composição precisa ser montada no painel de produção (ou importada) e publicada por quem decide.
- O sandbox local não tem o feed da Uma Penca: "Canecas" e `/sul/outros-artigos` não aparecem aqui.
- Os cards da seleção e das vitrines continuam levando direto à página do produto na loja (como hoje). A abertura leva à PDP interna (como hoje).
- O botão "Sua cidade" abre a mesma busca do ícone: não existe uma busca só de cidades.
