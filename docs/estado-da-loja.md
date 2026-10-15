# Use Origens: estado atual da loja

Retrato da loja em **11/10/2026**: o que está no ar, o que fica exposto ao público e como tudo foi montado. Serve para quem chega agora ao projeto, pessoa ou modelo de IA, raciocinar sobre próximos passos sem precisar ler o código.

- **Código descrito:** `main` em `d63a2c9`, depois do PR #66 (menu de coleções).
- **Produção:** conferida em 11/10/2026 em `https://www.useorigens.com.br`, no desktop (1440×900) e no celular (390×844). As capturas estão em [`screenshots/estado-da-loja/`](screenshots/estado-da-loja/).
- **Como ler as marcações:**
  - **[prod]**: visto em produção nesta data.
  - **[código]**: lido no código da `main`.
  - **[doc]**: escrito na documentação do repositório.
  - **(não confirmado)**: não foi possível verificar.

---

## 1. Resumo

1. A **Use Origens** é uma vitrine regional de camisetas com a identidade de cada cidade: nome, mapa, coordenadas, jeito de falar. Atende três regiões do Brasil: **Sul** (PR, SC, RS), **Norte** (AC, AM, AP, PA, RO, RR, TO) e **Centro-Oeste** (DF, GO, MS, MT).
2. **O cliente escolhe no nosso site e compra na INK.** O site (`useorigens.com.br`) cuida da descoberta: busca de cidade, estados, cidades, estilos, coleções, campanhas. Página do produto, carrinho, frete, pagamento e checkout ficam na **INK** (Reserva INK), nas lojas **Use Sul** (`usesul.com.br`), **Use Norte** (`usenorte.com.br`) e **Use Centro** (`usecentro.com.br`).
3. Um **Worker da Cloudflare** roda nas páginas de produto da INK e desenha um cabeçalho igual ao do site, com Regiões, coleções e Cidades. Ele também injeta cupons, compartilhar, guia de medidas, recomendações, o espelho do carrinho e links de volta para o site.
4. O site lê o catálogo da INK **só por sincronização**, apenas leitura, e guarda tudo em arquivos (snapshots). **Nenhuma página consulta a INK quando o visitante abre o site.**
5. Há um **CMS próprio** em `/admin` para montar as homes e páginas (hotpages, categorias-pai), coleções e menu, navegação, cores, cupons, rastreamento, personalização e publicação com histórico.
6. A stack é **Next.js 16** (App Router, ISR) num único serviço do **Railway**. Os snapshots ficam num Volume. O **Postgres** é usado só pelo CMS e pelos pedidos de personalização; as imagens do CMS ficam num bucket privado.
7. **Em produção:** as três regiões estão públicas, o sitemap tem 19.006 URLs e o catálogo tem 17.446 produtos, sincronizado diariamente.
8. **Em andamento:** a preparação da **loja única** (as três regiões numa só loja INK, PR #49 em rascunho) e a migração de produtos na INK.

---

## 2. Números de hoje

| Item | Valor | Fonte |
|---|---|---|
| Produtos no catálogo | **17.446**: Sul 9.851, Norte 3.667, Centro-Oeste 3.928 | [prod] `/api/ready`, sincronizado em 11/10 entre 03:35 e 03:38 (Brasília) |
| Cidades com produto no Sul | **1.191 de 1.191** (100%) | [prod] `/api/ready` |
| Municípios do IBGE no sistema | 2.109: Sul 1.191, Norte 450, Centro-Oeste 468; mais 35 Regiões Administrativas do DF | [código] `data/geo/municipios.json`, `src/lib/geo/administrative-regions.ts` |
| Cobertura de Norte e Centro-Oeste | Norte 450 cidades / 3.582 famílias; CO 468 / 3.713 | [doc] `docs/seo/norte-centro-oeste-evidencias.md` (27/09) |
| URLs no sitemap | **19.006** | [prod] `/sitemap.xml` |
| Coleções da INK | Sul 176 (13 públicas), Norte 22 (20 públicas), Centro 26 (21 públicas) | cópia local de 24/09; os números de produção podem ser outros |
| Preço padrão da camiseta clássica | R$ 109,90 | [prod] |
| Testes unitários | 1.366 passando | [código] `npm test`, rodada do PR #66 |

---

## 3. O que está no ar

### 3.1 Regiões e rotas públicas [prod]

As três regiões respondem 200 e estão no sitemap. A raiz `/` redireciona (307) para `/sul`.

| Rota | O que é | Status |
|---|---|---|
| `/sul`, `/norte`, `/centro-oeste` | Home da região, montada pelo CMS | 200 |
| `/sul/sc` | Página do estado | 200 |
| `/sul/sc/florianopolis` | Página da cidade (ou da RA, no DF) | 200 |
| `/sul/sc/florianopolis/<família>` | Página da estampa: escolha da versão e botão "Escolher tamanho na loja" | (não testada) |
| `/sul/busca?q=gramado` | Busca de produtos, 24 por página, `noindex` | 200 |
| `/sul/colecoes/da-nossa-terra` e `/2` | Página da coleção, paginada | 200 |
| `/sul/h/10-do-10` | Hotpage de campanha, criada no CMS | 200 |
| `/sul/meus-lugares` | Favoritos, guardados no navegador | 200 |
| `/sul/privacidade` | Política de privacidade | 200 |
| `/sul/personalizar/<slug>` | Pedido de camiseta personalizada (modelos do CMS) | [código] |
| `/sul/outros-artigos` | Canecas e ecobags da Uma Penca | [código]; dá 404 sem o feed configurado |
| `/robots.txt`, `/sitemap.xml` | SEO | 200 |
| `/admin` | CMS, com login pelo Railway | [código] |

### 3.2 O que o visitante vê no site

**Cabeçalho**
- **Desktop** [prod]:
  - à esquerda, o logo da região e "USE ORIGENS";
  - no centro, **Regiões ▾**, **Categorias ▾**, "PARA APROVEITAR O 10/10" e "Canecas", esses dois sendo links definidos no CMS;
  - à direita, **Sul ▾** (troca de região), **Meus Lugares** e **Buscar**.
- **"Categorias" no Sul** [prod] tem 12 coleções: Seu Lugar, Do Nosso Jeito, Da Nossa Terra, Feito Para Você, Fala Daqui, Pré-treino Raiz, Personalizados, Rio Grande do Sul, Santa Catarina, Paraná, Novidades e 10/10. Elas aparecem em colunas e cada uma abre `/sul/colecoes/<slug>`. Hoje entram todas as coleções públicas, inclusive as de estado; o dono escolhe o que esconder em **Coleções → Menu de coleções**.
- **Celular** [prod]:
  - no cabeçalho, menu (☰), logo, favoritos (♡) e busca (🔍);
  - o menu abre em tela cheia com quatro blocos: **Comprar** (10/10, Canecas), **Categorias** (as 12), **Estados do Sul** e **Explorar outras regiões** (Norte, Centro-Oeste).
- Acima do cabeçalho há uma faixa preta: "1.191 cidades do Sul em camiseta. Você escolhe aqui e finaliza a compra na loja Use Sul."

**Elementos fixos** [prod]
- Botão flutuante de **cupons** no canto inferior esquerdo, com contador; no Sul mostrava "2".
- **Banner de cookies** com "Rejeitar" e "Aceitar cookies".

**Home do Sul** [prod], seções na ordem:
1. Hero "Busque sua cidade aqui", com campo de busca e 3 produtos em destaque;
2. "Para aproveitar o 10/10";
3. Novidades;
4. Da Nossa Terra;
5. Redesenhos do Sul;
6. "Sua cidade, de 8 jeitos";
7. Canecas;
8. Feito Para Você;
9. Fala daqui;
10. "O número de cada região" (DDD);
11. "Escolha o seu estado";
12. "Quem está no pódio?" (ranking de vendas);
13. campanha "Nome, número e jeito de falar".

**Home do Norte** [prod], na ordem:
1. "O seu lugar, do seu jeito.";
2. "Para aproveitar o 10/10";
3. "Sua cidade, do seu jeito.";
4. "Escolha o seu estado";
5. Pódio;
6. Made In Norte;
7. Identidade;
8. Fala de Onde;
9. campanha.

**Página do estado** (`/sul/sc`) [prod]
- Busca em destaque, "Destaques de Santa Catarina", "Escolha o estilo" e "O Pódio de Santa Catarina".
- Depois, as cidades agrupadas por mesorregião ou em lista de A a Z.

**Página da cidade** (`/sul/sc/florianopolis`) [prod]
- No topo: trilha "Sul / Santa Catarina / Florianópolis", título grande, "Santa Catarina · Grande Florianópolis" e "Compartilhar".
- "Estilos": abas por peça (Camiseta clássica · 8, Algodão Peruano · 7, …), "Guia de medidas" e os cards dos 8 estilos, cada um com favoritar e compartilhar.
- Depois: "Busque outra cidade", "Fala de Florianópolis" e "Mais de Grande Florianópolis".
- O card abre direto a página do produto na INK, por exemplo `https://www.usesul.com.br/usesul/product/feito-em-florianopolis`.

**Página da coleção** (`/sul/colecoes/da-nossa-terra`) [prod]
- Título da coleção e grade "Todos os produtos", 24 por página, com paginação.
- Quando não existe página personalizada no CMS, a página é gerada sozinha e fica `noindex`.

**Busca** [prod]
- **Rápida:** é um diálogo que abre pela lupa, pelo campo do hero ou pelo campo da cidade e sugere lugares, estampas e coleções.
- **Completa:** `/<região>/busca?q=`, com os resultados agrupados por estilo.

### 3.3 O que aparece na página de produto da INK [prod]

Exemplo: `https://www.usesul.com.br/usesul/product/feito-em-florianopolis`.

- **Desenhado pelo Worker:**
  - cabeçalho "USE ORIGENS" com **Regiões ▾**, **Demais categorias ▾** e **Cidades**, mais busca, conta e carrinho da INK;
  - "Demais categorias" ainda mostra a escolha antiga do CMS: Seu Lugar, Do Nosso Jeito, Da Nossa Terra, Feito Para Você e Fala Daqui;
  - links de volta para `useorigens.com.br/sul` e para os estados;
  - "Compartilhar";
  - aba do WhatsApp e aba "Ajuda?";
  - o mesmo botão de cupons do site.
- **Nativo da INK:**
  - faixa de frete grátis, preço com parcelamento em 5x e "Calcule o prazo de entrega";
  - cupons disponíveis;
  - "Também disponível em" (outras peças) e "Modelo" (Baby Look ou Clássica);
  - cor e tamanho;
  - avaliações e banner de cookies próprio.
- "Você também pode gostar" aparece abaixo da foto. Se ele vem do recomendador do Worker ou da própria INK **(não confirmado)**.

### 3.4 APIs públicas [código]

O proxy não passa pelas rotas `/api`, então elas não têm a trava de catálogo nem `noindex`.

| Rota | Para quê | Quem usa | Proteção |
|---|---|---|---|
| `GET /api/busca?region=&q=` | Busca rápida do cabeçalho | site | nenhuma; cache de 60 s |
| `GET /api/cidades/[region]` | Índice das cidades cobertas | Worker (cache de 300 s) | nenhuma |
| `GET /api/navbar/[region]` | Cabeçalho da INK: `{v:2, states, top, more, moreLabel?}` | Worker | 404 se a região não está lançada |
| `GET /api/promotions/[region]` | Cupons e promoções | site e Worker | 404 se a região não está lançada |
| `GET /api/recommendations/[region]/[productId]` | "Você também pode gostar" | Worker | não verifica se a região está lançada |
| `GET /api/cart-mirror?ref=&region=` | Resumo do carrinho da INK, pelo Worker | site | token de 22 caracteres |
| `GET /api/favorites/resolve` | Atualiza os favoritos | site | 60/min |
| `POST /api/buy-session`, `GET /api/buy-session/[id]` | "Comprar minha lista" | site e Worker | assinatura HMAC e limite de taxa |
| `GET /api/health`, `GET /api/ready` | Saúde e prontidão | Railway e scripts | nenhuma |
| `GET /media/...` | Imagens publicadas do CMS | site | só imagens publicadas |
| `/api/admin/*` | Sincronizações (catálogo, peças, pódio, Uma Penca) | crons e scripts | `Bearer ADMIN_SYNC_TOKEN` |

### 3.5 SEO [código + prod]

- **`robots.txt`:** permite tudo e aponta o sitemap. As páginas privadas usam `noindex`.
- **O sitemap inclui** home, privacidade, estados com produto, cidades e RAs cobertas com suas famílias, e páginas do CMS marcadas como indexáveis.
- **Ficam fora do sitemap:** `/busca`, `/personalizar`, `/meus-lugares`, `/outros-artigos` e as páginas de coleção automáticas.
- **Por página:** canonical próprio, Open Graph com foto de produto real e JSON-LD `BreadcrumbList`. A home tem JSON-LD `WebSite` e `Organization`. Não há JSON-LD de `Product`.
- **Host não canônico** recebe `X-Robots-Tag: noindex`. Enquanto o catálogo não carregou, o site responde 503 com `noindex`.

### 3.6 Medição e consentimento [código]

- **Ferramentas:**
  - **Meta Pixel** e **GA4**: um ID por região, definido no CMS em "Tracking". Sem nada publicado, o Sul usa as variáveis de ambiente.
  - **Microsoft Clarity**: um projeto só, com a tag `regiao`.
- **Consentimento:** pelo código, o padrão é **medir sem esperar o aceite** (decisão de 25/09). Com `NEXT_PUBLIC_MEASUREMENT_REQUIRES_CONSENT=true`, nada carrega antes do aceite. O valor usado em produção é **(não confirmado)**.
- **Eventos do Meta:** `PageView`, `Search`, `SelectCity`, `GoToInk`, `GoToPenca`.
- **Eventos do GA4:**
  - navegação e busca: `page_view`, `view_search_results`, `select_city`, `select_state`;
  - ida às lojas: `select_item` + `go_to_ink` e `select_item` + `go_to_umapenca`;
  - ponte com a INK: `origens_storefront_arrived`, `origens_go_to_cart_click`, `origens_cart_mirror_view`;
  - outros: eventos de cupons, `podio_click`, `share`, `size_guide_open`.
- **Origem do clique:** cada link para a INK leva um `source` que diz de qual seção veio, como `hero_search`, `city_styles`, `colecao_pagina` ou `pdp` (`src/lib/analytics/sources.ts`).
- **Campanha repassada à INK (desde 14/10/2026):** o site não cria UTM próprio, mas leva para a INK a campanha com que o visitante chegou. `utm_*`, `fbclid`, `gclid`, `gbraid`, `wbraid` e `ttclid` ficam guardados na visita (sessionStorage) e são somados ao link da INK na hora do clique, sem trocar parâmetro que o link já tenha (`ls`, `origens_open_cart`). Assim o Pixel e o GA4 da própria INK veem o anúncio em vez de um referral do site. Segue a mesma regra de consentimento do Meta/GA4. O redirect `/` → `/sul` também passou a manter a query (`src/lib/analytics/campaign.ts`).

---

## 4. Jornada do cliente

1. O cliente **chega** pelo Google, Instagram ou anúncio, quase sempre numa home de região, num estado ou numa cidade.
2. **Procura a cidade:** pela busca, que aceita apelidos como "floripa", "poa" ou "ctba", pelo menu Regiões, pela página do estado ou, agora, pelo menu **Categorias**.
3. Na página da cidade, **escolhe o estilo e a peça.** O card leva direto à página do produto na INK, na loja da região. Se o estilo tem versões, abre antes a página da estampa no nosso site.
4. **Na INK**, escolhe modelo, cor e tamanho, adiciona ao carrinho e paga. O cabeçalho do Worker mantém a navegação parecida com a do site e oferece cupons.
5. **Volta ao site** pelos links do Worker, que carregam `?cart_ref=`. Com isso o site mostra "Meu carrinho", um espelho do carrinho que só pode ser lido, e o botão "Ir para meu carrinho".
6. **Favoritos:** o cliente marca cidades e estampas com ♡ (ficam no navegador). Em Meus Lugares, "Comprar minha lista" abre o primeiro produto na INK com `?ls=`, e o Worker vai mostrando o próximo da lista.
7. **Personalização:** o cliente preenche um formulário (`/personalizar/<slug>`), o pedido vai para a fila do CMS e a equipe entra em contato manualmente. Não há checkout automático.

---

## 5. Como montamos

### 5.1 Stack

- **Base:**
  - Next.js **16.3.5** (App Router; o antigo `middleware` agora é `src/proxy.ts`), React 19.2, TypeScript, Tailwind CSS 4, `pg` e `embla-carousel`.
  - Sem ORM, sem biblioteca de UI e sem CI (`.github/` não existe).
- **Testes:** Vitest (unit e integração, com PGlite, um Postgres em WASM) e Playwright (vários configs; ver 5.8).
- **Tamanho:** `src/` tem cerca de 370 arquivos e ~35,6 mil linhas, com 34 páginas e 21 route handlers.

### 5.2 Dados: da INK para o site

**API da INK**
- Endereço `https://api.reserva.ink`, com um token por loja (`INK_TOKEN_SUL`, `_NORTE`, `_CENTRO`). Só fazemos leitura (GET).
- Endpoints usados:
  - `/v1/stores/products` para o catálogo;
  - o mesmo endpoint com `begin_date`, para as peças;
  - `/v1/stores/collections`;
  - `/v1/stores/orders?payment_status=paid`, para o Pódio.
- A INK limita a 100 requisições por minuto por loja. Fazemos 1 a cada 1,5 s, nunca em paralelo dentro da mesma loja, com espera progressiva quando a INK responde 429.

**Classificação dos produtos** (`src/lib/catalog/parse.ts`, `indexer.ts`)
- O nome do produto decide a cidade e a família: `<título> | <Família> [UF]` ou `Feito em <Cidade> [- UF]`. O que não casa vira **merch**, ou seja, produto avulso. Nada é adivinhado.
- São 8 famílias de estampa: Ponto de Origem, Feito em, Coordenadas, Legado, Território, Tipografia, Traço e Gentílico. Algumas têm variantes, como regional, personalizado, localidade ou centro.
- Ranking: a variante principal vem primeiro, depois a prioridade da loja, depois o id da INK.

**Peças** (`garment-index.json`)
- As versões do mesmo desenho são ligadas por `product_cluster_id`.
- Tipos de peça: camiseta clássica, algodão peruano, oversized, regata, cropped, cropped moletom, moletom capuz, moletom suéter, infantil e body infantil.

**Coleções** (`collections-snapshot.json` v2)
- Para cada coleção guardamos: pública ou interna, posição no menu da INK, produtos casados com o nosso catálogo, `memberIds` (os primeiros 48) e `allMemberIds` (todos).
- Uma coleção só é usável com pelo menos 3 produtos.

**Proteções do sync**
- Se uma loja falha, ela mantém o último dado bom.
- Uma queda de mais de 50% nos produtos é recusada.
- A gravação é atômica.
- Promoção: o `promotional_price` da INK vira o preço e o preço cheio aparece riscado. Isso só muda depois de um sync.

**Quando sincroniza**

| O quê | Como |
|---|---|
| Catálogo das 3 lojas + peças | Cron **`garments-sync-cron`** todo dia às **03:30** (Brasília), ~176 GETs |
| Pódio | Cron **`podio-sync-cron`** às **04:00** (Brasília) |
| Coleções | **Manual:** botão "Sincronizar coleções agora" ou CLI. O cron diário **não** atualiza coleções |
| Uma Penca | `umapenca:sync` ou rota admin; o painel diz "a cada 6 horas", mas o cron **(não confirmado)** |
| Recomendações | `recommendations:build`, **manual**, sem agendamento |

**Invalidação:** depois de um sync ou de uma publicação, chamamos `revalidatePath('/[region]', 'layout')`.

### 5.3 Renderização e cache [código]

- **Páginas:** todas as páginas da região usam **ISR de 1 hora** (`revalidate = 3600`) com `generateStaticParams() → []`, ou seja, nada é gerado no build, para não congelar um catálogo vazio. A primeira visita gera a página, que fica em cache.
- **Exceções dinâmicas:** `/busca` e o sitemap são dinâmicos (`force-dynamic`).
- **Paginação:** a página de coleção pagina pelo caminho (`/colecoes/<slug>/2`) para continuar em ISR.
- **Proxy** (`src/proxy.ts`):
  - roteia o `/admin` (só no host da loja);
  - responde 503 `noindex` enquanto o catálogo do Sul não está pronto;
  - põe `noindex` em host não canônico.
- **CSP:** não há CSP nas páginas da loja, só em `/media` e no admin.

### 5.4 CMS (`/admin`) [código]

**Acesso**
- Login com a conta do Railway (OIDC com PKCE), permitido só a quem está cadastrado na tabela `admin_user`.
- Sessão de até 12 h, que expira após 2 h parada.
- Papéis **owner** e **editor**. O editor só edita as regiões que recebeu.
- Só o owner pode: sincronizar, mexer no tracking e na paleta globais, lançar ou recolher região, apagar uma release e ligar a indexação de uma página.

**Telas**

| Tela | O que faz |
|---|---|
| Visão geral | Rascunho × publicado, problemas, estado do catálogo |
| Home · Seções | Adicionar, ordenar arrastando, ativar, editar, duplicar ou remover seções. Tipos de seção: coleção da INK (carrossel ou grade), Uma Penca, estados, estilos da cidade, campanha, grade de imagens |
| Páginas | Hotpages (`/h/<slug>`) e categorias-pai (`/colecoes/<slug>`), com SEO, fundo temático e as mesmas seções da home |
| Personalização | Modelos de pedido e a fila de **Solicitações** (recebido → em criação → arte pronta → cliente contatado → fechado/cancelado) |
| Coleções | Biblioteca da loja INK da região: habilitar internas, ordem e escondidos por coleção, página no site, **Menu de coleções**, sincronizações |
| Navegação | Blocos do menu (Comprar, Categorias, Estados, Outras regiões): rótulo, ordem, visibilidade |
| Aparência | Paleta global e paleta por região, com checagem de contraste |
| Cupons e promoções | Até 20 itens por região, com datas |
| Tracking | IDs do Meta e do GA4, global e por região |
| Publicar | Diferenças entre rascunho e publicado, bloqueios, publicar, histórico, restaurar, lançar região |
| Mídia | Upload até 8 MB, convertido em WebP de 4 tamanhos |
| Pessoas | Editores e permissões (só o owner) |

**Modelo de dados**
- Um **documento por escopo**: `global`, `sul`, `norte` e `centro-oeste` (`src/lib/site-config/schema.ts`).
- Campos do documento: `home.sections`, `pages`, `customizers`, `collections` (`enabled`, `menu`, `arrangements` e os campos antigos), `navigation`, `theme`, `promotions`, `tracking` e `launched`.
- Validação: estrita no editor e na publicação. Na loja ela é tolerante: uma seção inválida é descartada, e um hero ou rodapé inválido devolve o escopo inteiro ao padrão.

**Rascunho e publicação**
- Rascunho por região, com controle de versão: se outra aba mudou o rascunho, a gravação é recusada.
- Há três alvos de publicação: a **região** (home, menu, cores, cupons, coleções), **uma página** ou **um modelo de personalização**.
- Protocolo da publicação: a release é registrada no Postgres como pendente → `published.json` é gravado no Volume de forma atômica → a release vira `live` → o cache é revalidado. Um passo de **reconciliação** conserta falhas no meio do caminho e roda no boot e antes de cada publicação.
- **Lançar uma região** é uma publicação com `launched` ligado. Ela é bloqueada se o catálogo cobre menos de 50% das cidades, se não há home ou se não há seção com 3 produtos reais.

### 5.5 Coleções, páginas e menu [código]

- **Pública × interna**
  - **Pública:** aparece na INK e já pode ser usada.
  - **Interna:** fica oculta na INK (é uma segmentação, como "SUL - RS" ou "ZZ - NO") e precisa ser **habilitada** no CMS antes de ser usada.
- **Ordem e escondidos** (`collections.arrangements`): pertencem à coleção. Todas as seções com aquela coleção e a página dela seguem a mesma lista.
- **Página de coleção:** toda coleção que a região pode usar tem `/<região>/colecoes/<slug>`.
  - Se existe uma categoria-pai publicada com o mesmo endereço, ela ocupa a página ("Personalizar página").
  - "Ver todos" das seções aponta para essa página por padrão.
- **Menu de coleções** (PR #66, `collections.menu = {top, hidden, added}`): **um menu só** para o topo do site e para a navbar da INK.
  - **Topo:** coleções direto na barra, na ordem definida pelo dono.
  - **Categorias:** automático. Toda coleção pública com página entra sozinha, na ordem do menu da INK.
  - **Não exibir:** tira a coleção do menu.
  - Coleção interna só entra se for colocada, e só aparece no site.
  - No desktop, o que não cabe na barra sai dela e continua em Categorias.
  - **Ponto de atenção:** a navbar da INK só passa a seguir esse menu **depois que a região publica o menu**. Até lá, `/api/navbar` manda a escolha antiga, idêntica. Além disso, o Worker ainda ignora `url` e `moreLabel` (ver 7.2).

### 5.6 Integrações

**Worker da Cloudflare** (repositório `use-origens-workers`) [código]
- Três Workers: `use-sul-widget`, `use-norte-widget` e `use-centro-widget`.
- Rodam nas rotas `/<loja>/product/*`, `/__origens/*` e nas páginas de casca da INK, injetando um único `loader.js`.
- Funcionalidades, ligadas por flag:

| Funcionalidade | O que faz |
|---|---|
| `header-nav` | Cabeçalho com Regiões, coleções, Cidades, busca, WhatsApp e Ajuda |
| `return-link` | Link de volta para o site |
| `product-discovery`, `post-add-discovery`, `cart-discovery` | "Continue explorando" e sugestões depois de adicionar e no carrinho |
| `city-search` | Busca de cidade |
| `cart-mirror` | Guarda o `cart_ref` no KV para o espelho do carrinho |
| `list-session` | Meus Lugares: abre o próximo item da lista |
| `promo-fab` | Botão de cupons |
| `auto-recommendations` | "Você também pode gostar" |
| `pdp-share` | Compartilhar |
| `size-guide` | Guia de medidas |

- O Worker chama estes endpoints do site: `/api/navbar`, `/api/promotions`, `/api/recommendations`, `/api/cidades` e `/api/buy-session`.
- Release: scripts com frases de confirmação. O rollback é `wrangler rollback` ou `ENABLE_WIDGET=false`.
- Estado registrado [doc]: Sul em produção; Norte e Centro-Oeste publicados em 28/09; `promo-fab` nas 3 lojas em 02/10. O rollout de `pdp-share`, `size-guide` e `auto-recommendations` **(não confirmado)**.

**Outros serviços e recursos**
- **Espelho do carrinho:** o site pede ao Worker (`/__origens/cart-ref/<token>`) o resumo do carrinho. Timeout de 2 s, até 20 itens, válido por 30 min.
- **Comprar minha lista:** o id da sessão é assinado com HMAC (`LIST_SESSION_SECRET`) e não fica guardado. A sessão dura 1 h.
- **Cupons:** vêm do CMS, não da INK. "Copiar" só copia o código; o cupom é aplicado na INK.
- **Recomendações:** índice construído a partir dos snapshots e do CMS publicado (`recommendations-index.json`). O build é manual.
- **Uma Penca:** feed XML de canecas e ecobags (`UMAPENCA_FEED_URL`), que alimenta `/outros-artigos` e o carrossel da home; os cards levam para umapenca.com.
- **Pódio:** ranking de vendas a partir dos pedidos pagos da INK, sem dados pessoais. Desliga por região no painel (Home · Seções → O Pódio,
  depois Publicar), o que tira a exibição e para o cálculo diário daquela região; `PODIO_PUBLIC=off` desliga em todas.
- **Personalização:**
  - os pedidos ficam no Postgres;
  - limite de 10 envios a cada 10 min por IP;
  - o contato com o cliente é manual;
  - nada é enviado à INK.

### 5.7 Infra (Railway) [código + doc]

**Serviços**
- **`useorigens-storefront`:** instância única, sem réplicas por causa do Volume. Build com `npm run build`; start com `next start`. Domínios `www.useorigens.com.br` e `useorigens.com.br`; o admin fica em `www/admin`.
- **`Postgres`:** só rede interna. Migrations 0001 a 0005: usuários, sessões, releases, rascunhos, mídia, auditoria, execuções de sync e pedidos de personalização.
- **Crons:** `garments-sync-cron` e `podio-sync-cron`.
- **Bucket privado:** imagens do CMS.

**Volume** (`/app/data/generated`)
- `catalog-snapshot.json`, `collections-snapshot.json` e `garment-index.json`, com o estado do sync de peças;
- `recommendations-index.json`, `umapenca-snapshot.json`, `podio/`;
- `site-config/published.json`: a configuração publicada que a loja lê.

**Saúde:** `/api/health` (liveness) e `/api/ready` (catálogo pronto; mostra contagens e data do sync).

**Variáveis de ambiente**, só os nomes:

| Grupo | Variáveis |
|---|---|
| INK e sync | `INK_API_BASE_URL`, `INK_TOKEN_SUL`, `INK_TOKEN_NORTE`, `INK_TOKEN_CENTRO`, `ADMIN_SYNC_TOKEN`, `CATALOG_SNAPSHOT_DIR`, `COMMERCE_STORE_PRIORITY` |
| Recursos | `UMAPENCA_FEED_URL`, `LIST_SESSION_SECRET`, `PODIO_PUBLIC`, `CUSTOMIZATION_RETENTION_DAYS` |
| Público | `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_META_PIXEL_ID`, `NEXT_PUBLIC_GA_MEASUREMENT_ID`, `NEXT_PUBLIC_CLARITY_PROJECT_ID`, `NEXT_PUBLIC_MEASUREMENT_REQUIRES_CONSENT` |
| CMS | `ADMIN_HOST`, `ADMIN_OWNER_EMAIL`, `RAILWAY_OAUTH_CLIENT_ID`/`_SECRET`, `ADMIN_SESSION_SECRET`, `DATABASE_URL`, `BUCKET_*`, `SITE_CONFIG_HOME`, `SITE_CONFIG_DIR` |

- `SITE_CONFIG_HOME=on` liga a loja montada pelo CMS. Em produção ela está **ligada**: páginas de coleção, hotpage e menu Categorias respondem, e todos dependem dela.

### 5.8 Testes [código]

| Suíte | Comando | Tamanho |
|---|---|---|
| Unit e integração (Vitest) | `npm test` | 106 arquivos, 1.366 testes |
| E2E da loja | `npx playwright test` | ~190 testes; 4 falhas já existentes |
| E2E do CMS (sandbox, specs encadeados) | `npm run test:admin` | 45 testes (último resultado completo: PR #65) |
| CMS em modo produção | `npm run test:admin:prod` | 1 spec |
| DF, regiões, tracking | configs próprios | 14, 3 specs, 2 |

- **Falhas já conhecidas na `main`:**
  - altura da página do estado no celular (`sul.spec.ts`);
  - 3 testes do dropdown "Regiões" (`tracking-and-nav.spec.ts`).
- Vários testes dependem dos snapshots locais (`data/generated/`).
- No PR #66, os e2e foram atualizados mas não rodados; a validação foi feita no navegador, desktop e celular.

---

## 6. Histórico (PRs mergeados)

| Tema | Entregas |
|---|---|
| Base (21 a 24/09) | `/sul` sobre o catálogo da INK, banners regionais, gate de bootstrap, Meta e GA4, espelho do carrinho |
| CMS | #1 fundação; #3 admin no host da loja e login Railway; #5 Norte e Centro-Oeste e tracking; #9 seções estruturadas; #15 histórico de releases; #17 seções no menu; #37 menu mobile e paleta; #53 grade de imagens; #57 grade de produtos e fundo temático; #63 ordenar arrastando |
| Coleções | #18 navbar da INK (Topo / Demais categorias); #19 e #20 hotpages, categoria-pai e personalização; #50 "Escolha o estilo" por estado; #56 ordem manual e escondidos; **#65 páginas de coleção** (11/10); **#66 menu de coleções com Topo e Categorias** (11/10) |
| Catálogo | #7 estilos abrem a INK direto; #29 abas de peça; #35 sync diário de peças; #32 e #34 Regiões Administrativas do DF |
| Busca | #14 `/busca`; #45 busca global; #56 "Busque outra cidade" |
| SEO | #24 sitemap; #25 correção de `noindex`; #27 robots; #28 JSON-LD e Open Graph |
| Promoções e preço | #41 Central de cupons; #60 preço promocional com o cheio riscado; #62 etiquetas % OFF |
| Personalização e Uma Penca | #42 Outros artigos e "Crie a sua"; #43 carrossel da Uma Penca; #44; #51 foto de hover |
| Analytics | #2 e #4 eventos da ponte com a INK; #8 banner de cookies; #52 Microsoft Clarity |
| Worker | #21 Meus Lugares e sessão de compra; #26 carrinho por região; #47 recomendador; #48 compartilhar e guia de medidas |
| Ranking | #46 O Pódio |
| Cards e design | #58 a #64: botão Comprar, card unificado, cards compactos, "Ver todos" como botão, setas no celular, fundo próprio do card |
| Loja única | #54 leitura sombra da loja unificada e fila de mockups; #49 em rascunho |

---

## 7. Em andamento, pendências e limitações

### 7.1 Loja única: as três regiões numa só loja INK

**PR #49** (rascunho, branch `feature/storefront-unificado-preparacao`)
- Cria o switch `COMMERCE_MODE` (`multi-store`, o padrão, ou `single-store`), com simulação, mantendo o Sul idêntico.
- O próprio PR diz: **não fazer merge sem decisão de ativação.**
- Bloqueios:
  - as 4 dependências externas estão como "não prontas": Worker do carrinho, Worker da lista, tema do checkout e referências do CMS;
  - 1.654 bases do Norte e 1.610 do Centro-Oeste estão sem imagem;
  - o merch e as coleções de Norte e Centro-Oeste não existem na loja do Sul;
  - o preço da loja do Sul é diferente do regional, e isso é decisão de negócio.
- Ao retomar, aplicar o filtro por região também nas páginas de coleção e no menu de coleções.

**Migração na INK** (`docs/migracao-ink/origens-ink-reconciliacao.md`, execução de 05/10)
- A loja do Sul tem 160.662 produtos (Norte 30.816, Centro-Oeste 38.403 nas lojas próprias).
- 75.535 peças do Centro-Oeste e do Norte já foram copiadas, ocultas, para a loja do Sul.
- 98,1% das correspondências estão confirmadas.
- 3.264 camisetas base estão sem mockup.
- Coleções ocultas que marcam a região: `SUL`, `ZZ - CO` e `ZZ - NO`.

### 7.2 Worker e navbar da INK

- O Worker monta o link da navbar pela URL da INK (`/collections/<slug>`), ignora `url` e `moreLabel` e escreve **"Demais categorias"** fixo (`src/loader/header-nav.js`). Para a navbar da INK levar às páginas de coleção do site, o Worker precisa mudar e ser publicado.
- O redirect da home da INK para o site (flag `home-redirect`) foi **adiado em 04/10**. Essa informação está registrada fora do repositório.
- O rate limit de `POST /__origens/cart-ref` está pendente. O README do Worker está desatualizado.

### 7.3 Lacunas e limitações registradas

- **Coleções:**
  - o cron diário não sincroniza coleções; depois do PR #65 é preciso rodar "Sincronizar coleções agora" para guardar a lista completa;
  - "Categorias" lista todas as públicas, inclusive as de estado e "10/10", até o dono escolher "Não exibir".
- **Recomendações:**
  - o build é manual;
  - no Norte, só 14 de 60 editoriais têm cluster;
  - coleções ocultas contam como afinidade.
- **Uma Penca:** a configuração do feed e o cron em produção **(não confirmado)**; "Outros artigos" não está no menu.
- **Peças:**
  - o sync incremental só vê produtos novos na janela de datas; o runbook recomenda uma passada completa periódica;
  - 14,3% dos produtos canônicos do Sul estão sem cluster;
  - as abas de peça são só no cliente, com deslocamento de layout.
- **Preço promocional:** só aparece depois de um sync no início e no fim da promoção.
- **Desempenho:** LCP simulado em 4G lento de 2,9 s na cidade e 3,5 s na página da estampa; a meta é 2,5 s (`docs/qa/performance-debt.md`).
- **QA:** o checklist em aparelho real nunca foi executado.
- **DF:** o índice das RAs foi feito à mão e a INK não tem tag por RA.
- **Pódio:** a INK não informa a data do pagamento; a janela usa a data de criação do pedido.
- **Navegação e tema:**
  - publicar o global também publica o rascunho de tracking global;
  - não há como restaurar o global pela tela.
- **Personalização:**
  - o texto de autorização de contato não teve revisão jurídica;
  - se as migrations 0004/0005 foram aplicadas em produção **(não confirmado)**.
- **Infra:** instância única, com breve indisponibilidade a cada deploy; sem CI.
- **Docs desatualizados:**
  - `docs/deploy/railway.md` ainda diz "sem banco" e "Norte não habilitado";
  - `docs/admin/production-runbook.md` registra o estado de 24/09;
  - o README fala só de `/sul`.

### 7.4 Decisões em aberto

1. Quando e como ativar a loja única (PR #49) e o que fazer com o preço e com as coleções de Norte e Centro-Oeste.
2. Publicar a mudança do Worker para a navbar da INK abrir as páginas do site e usar o nome "Categorias".
3. Quais coleções ficam em "Categorias" e quais vão para o Topo, em cada região.
4. Redirecionar a home da INK para o site (adiado).
5. Agendar o sync de coleções, de recomendações e da Uma Penca.
6. Futuro previsto pelo dono: a INK liberar a jornada de compra para montar o carrinho direto no nosso site e usar só o checkout hospedado lá. Nada disso está implementado; hoje cada card abre a página do produto na INK.

---

## 8. Glossário

| Termo | Significado |
|---|---|
| INK / Reserva INK | Plataforma de e-commerce onde ficam produto, carrinho e checkout |
| Loja da região | Use Sul, Use Norte e Use Centro: uma loja INK por região |
| Família (estilo) | Um dos 8 desenhos de estampa por cidade |
| Peça | Tipo de roupa: clássica, peruano, oversized, regata… |
| Merch | Produto que não é de cidade |
| Coleção pública / interna | Visível na loja INK / oculta, usada para segmentar |
| Hotpage | Página de campanha do CMS (`/h/<slug>`) |
| Categoria-pai | Página do CMS em `/colecoes/<slug>`, que pode substituir a página automática da coleção |
| Topo / Categorias | Posições de uma coleção no menu: direto na barra / no menu "Categorias" |
| Worker | Script da Cloudflare que roda nas páginas da INK |
| `cart_ref` | Token que liga o carrinho da INK ao espelho do carrinho no site |
| Release | Uma publicação do CMS, com histórico e restauração |
| Snapshot | Arquivo com o catálogo, as coleções ou as peças, gerado pelo sync |
| ISR | Página em cache, refeita no máximo a cada 1 hora ou quando o CMS publica |

---

## 9. Onde está cada coisa

| Assunto | Caminho |
|---|---|
| Rotas da loja | `src/app/[region]/**` |
| APIs | `src/app/api/**` |
| Proxy (middleware) | `src/proxy.ts` |
| Cabeçalho, rodapé, menu | `src/components/layout/SiteChrome.tsx`, `MobileMenu.tsx`, `PriorityLinks.tsx` |
| Seções da home e das páginas | `src/components/home/HomeSections.tsx`, `src/components/pages/PublicPage.tsx` |
| Cards de produto | `src/components/catalog/ProductCard.tsx`, `FamilyCard.tsx` |
| Cliente da INK e sync | `src/lib/ink/*`, `src/lib/catalog/sync-service.ts`, `scripts/sync-catalog.mts` |
| Classificação do catálogo | `src/lib/catalog/parse.ts`, `indexer.ts`, `ranking.ts`, `families.ts` |
| Coleções | `src/lib/catalog/collections.ts`, `collection-source.ts`, `collection-menu.ts` |
| Modelo do CMS | `src/lib/site-config/schema.ts`, `navigation.ts`, `collection-menu.ts` |
| Publicação | `src/lib/admin/publishing.ts`, `src/lib/site-config/publish-flow.ts` |
| Telas e ações do CMS | `src/app/admin/(panel)/**`, `src/app/admin/actions.ts`, `src/lib/admin/draft-ops.ts` |
| Navbar da INK (payload) | `src/lib/site-config/navbar.ts` |
| Analytics e consentimento | `src/lib/analytics/*`, `src/lib/consent/*` |
| Banco | `db/migrations/*` |
| Worker | repositório `use-origens-workers` (`src/worker.js`, `src/loader/*`, `src/features.js`) |
| Documentação viva | `docs/admin/cms-v1-structured-sections-and-hero.md`, `docs/navbar-text-search.md`, `docs/storefront/*`, `docs/deploy/railway.md` |
