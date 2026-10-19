# Catálogo de todas as regiões

`/regioes` reúne as coleções públicas das lojas que vendem no modo de comércio ativo. A home usa as coleções destacadas nas homes publicadas e oferece a lista completa de coleções com produtos.

- `/regioes/colecoes/<slug>`: primeira página da coleção, com 24 produtos.
- `/regioes/colecoes/<slug>/<n>`: páginas seguintes, sem mudar o contexto para uma região.
- `/api/colecoes/regioes/<slug>`: busca, filtros e ordenação sobre todos os membros da coleção. Um filtro de estado só se aplica quando escolhido explicitamente.

O catálogo usa os mesmos snapshots locais das lojas regionais, com cache por mtime. A rota é dinâmica para ler os dados do Volume em execução; nenhum catálogo vazio é congelado no build. Não há chamadas à INK ao visitar a página.

Na loja única, os produtos das três regiões pertencem à mesma loja física. No modo antigo, coleções com o mesmo slug são reunidas entre as lojas, preservando a identidade `loja:produto`. Nenhuma quarta região é criada. As rotas `/sul`, `/norte` e `/centro-oeste` conservam seus filtros.

Somente coleções públicas na INK, com associação completa sincronizada e cards vendáveis, recebem páginas gerais. Segmentações internas não são expostas por esta home. Produtos ocultos, simulados ou sem URL de compra válida não aparecem.

Produtos publicados cujo nome/geografia não puderam ser classificados são guardados como `unscopedProducts` pelo sync da loja única. Eles podem aparecer nas coleções gerais com seu nome original, mas não são atribuídos a uma região ou cidade.

## Primeira publicação

Depois de implantar esta versão, executar uma sincronização completa da loja única (`syncLojaUnica`, respeitando o lock do sync de peças) para preencher `unscopedProducts` e atualizar os membros das coleções. Snapshots anteriores continuam funcionando, mas ainda não contêm esses produtos sem classificação. O sync não publica nem altera produtos na INK.

O link “Explorar todas as regiões juntas” da raiz mantém os parâmetros de campanha da entrada. Links de coleção, menu e paginação permanecem em `/regioes`. O carrinho continua sendo o da loja física na modalidade loja única; ele não define um filtro de navegação.

## Cores das páginas sem região

Em **Aparência → Páginas sem região**, o owner pode configurar uma paleta exclusiva para `/`, `/regioes` e suas coleções: cor principal, destaque, fundo e texto do header, menu mobile e página. Ela fica em `docs.global.neutralTheme`, separada da paleta global que as regiões podem herdar. Os cards de escolha de região na raiz conservam suas identidades regionais.

O formulário salva um rascunho com prévia e verificação de contraste. A escolha “Visual padrão” remove a configuração. A publicação ocorre em **Publicar → Configuração global**, com as alterações identificadas na revisão. Texto praticamente ilegível bloqueia a publicação. As páginas leem apenas o arquivo publicado, com cache por mtime, e as cores chegam à próxima visita sem rebuild. Snapshots antigos sem `neutralTheme` conservam o visual padrão.

## Verificação

Os testes em `tests/unit/all-regions.test.ts` cobrem a união das regiões, produtos sem classificação, associação além dos primeiros 48 membros, busca, paginação, coleções internas/incompletas e identidade entre lojas. `tests/unit/loja-unica.test.ts` cobre a preservação somente de produtos publicados e vendáveis.

Na verificação HTTP com uma cópia dos snapshots públicos de produção, Kids retornou 33 produtos em `/regioes`, contra 12 em Sul, 8 em Norte e 13 em Centro-Oeste. Foram conferidos os links de paginação, os canônicos e os 404 de coleção/página inexistente. A revisão visual ficou com disposição `recapture`: o acesso ao navegador local está negado pela permissão salva do usuário, portanto não foram produzidas capturas.
