# MCP Use Origens × Reserva INK

Conector privado para o dono da loja consultar produtos, categorias, cupons, vendas, pedidos e trocas das lojas Use Origens pelo Claude. É **somente leitura** por padrão. Se o dono marcar na conexão, também altera produtos e trocas na INK, sempre com prévia e código de confirmação (seção 9). O servidor roda no mesmo serviço do site, em `https://www.useorigens.com.br/api/mcp`.

Data desta versão: 15/10/2026 (categorias, cupons e promoções acrescentados no mesmo dia, PR seguinte ao #76).

## 1. Como conectar no Claude

1. **Antes da primeira conexão:** aplicar a migração e fazer o deploy (seção 6).
2. **Adicionar o conector.** No Claude: Configurações → Conectores → Adicionar conector personalizado.
   - URL: `https://www.useorigens.com.br/api/mcp`, exatamente com `www`, porque no domínio raiz o MCP responde 404.
   - Não precisa de client ID nem de secret: o Claude se registra sozinho (DCR).
3. **Autorizar.**
   - O Claude abre `https://www.useorigens.com.br/admin/oauth/authorize`.
   - Sem sessão no painel, entra o mesmo "Entrar com Railway" do admin.
   - Só a conta **dona** (`role = owner`, ativa) pode aprovar.
4. **Na tela "Conectar ao Claude":** conferir que o endereço de retorno é `claude.ai` e clicar **Aprovar**.
   - Para permitir alterações, marcar **"Também permitir alterações na INK"** antes de aprovar. Desmarcado, a conexão é somente leitura e as ferramentas de escrita nem aparecem.
   - Para mudar essa escolha depois, remova o conector e conecte de novo.

**Claude Code:** `claude mcp add --transport http use-origens https://www.useorigens.com.br/api/mcp`. O retorno é um endereço local (`127.0.0.1` ou `localhost`), e a tela de consentimento avisa disso.

**Desconectar:** remova o conector no Claude. Para revogar no servidor, use `POST /api/mcp/oauth/revoke` com o token. Desativar ou rebaixar a conta dona no painel derruba todas as conexões na hora, porque toda requisição confere se o dono continua ativo.

### Pela chave de API (sem OAuth)

Alternativa ao fluxo acima, criada em 24/10/2026 quando o OAuth do conector parou de conectar no claude.ai. É uma chave única, só do dono, e ela **lê e altera** — as alterações continuam com prévia e código de confirmação (seção 9).

1. **Gerar a chave:** `npm run -s mcp:api-key`. A chave vai direto para a área de transferência e nunca aparece na tela. O script mostra só o hash.
2. **Railway:** no serviço `useorigens-storefront`, criar `MCP_API_KEY_SHA256` com o hash mostrado. O deploy reinicia o serviço.
3. **Claude:** em Adicionar conector personalizado, colocar a URL `https://www.useorigens.com.br/api/mcp`.
   - Em **Autenticação**, escolher **Sem login**.
   - Em **Cabeçalhos de requisição**, adicionar `X-Api-Secret` com a chave colada. O claude.ai não aceita qualquer nome de cabeçalho; `X-Api-Secret` é um dos permitidos.

**Regras:**
- O servidor guarda só o SHA-256. Sem a variável, ou com um valor inválido nela, nenhuma chave é aceita.
- Chave errada dá 401 e não cai para o OAuth.
- A chave age como a conta de `ADMIN_OWNER_EMAIL` enquanto ela for dona e estiver ativa.
- Nas alterações e nos logs, o cliente aparece como `chave-api`.

**Revogar:** trocar ou apagar `MCP_API_KEY_SHA256` no Railway. A chave antiga para de valer no próximo deploy. Para trocar, gere outra com o mesmo comando.

## 2. Ferramentas

| Ferramenta | O que responde | Fonte |
| --- | --- | --- |
| `origens_capabilities` | Lojas, fontes, limites e definições das métricas | Configuração e índice |
| `origens_search_products` | Produtos por texto, região, UF ou cidade da estampa, família, tipo, visibilidade, **categoria** e **em promoção**; paginado | Índice do site + categorias |
| `origens_get_product` | Um produto: classificação, **categorias**, preço (com % de desconto) e, ao vivo, status, visibilidade e variantes | Índice + API INK |
| `origens_list_categories` | **Categorias (coleções) da INK** por loja: id, nome, slug, visibilidade, posição, produtos do catálogo e link; paginado | Snapshot de categorias do site |
| `origens_promotions` | **Cupons e promoções do painel** (por região) com status de agora; com período, o **uso de cada código** nos pedidos pagos | Painel + API INK |
| `origens_sales_summary` | Totais do período (pedidos, unidades, total, mercadorias, frete, descontos, repasse, ticket) ou totais dos itens filtrados (inclusive por categoria e por cupom) | API INK + índice |
| `origens_sales_ranking` | Ranking por produto, cidade/UF/região/família da estampa, **categoria**, **modelo/tamanho/cor**, cidade/UF de entrega ou loja; aceita filtro de categoria e de cupom | API INK + índice |
| `origens_list_orders` | Pedidos do período com status, prazos e atraso informado pela INK; totais por status | API INK |
| `origens_get_order` | Um pedido: itens (com `variant_id`) com estampa classificada, valores, produção, entrega, rastreio e **se aceita edição de item ou troca** | API INK + índice |
| `origens_list_exchanges` | **Trocas** por loja: status, motivo, cortesia, análise do suporte, recusa, pedidos antigo/novo (só ids) | API INK |
| `origens_get_exchange` | Uma troca, com a descrição do problema | API INK |
| `origens_catalog_status` | Último sync por loja, contagens e produtos sem classificação | Índice do site |

Todas têm as anotações `readOnlyHint: true`, `destructiveHint: false` e `idempotentHint: true`: o cliente INK só faz GET em rotas fixas. Não existe ferramenta genérica de URL, SQL ou header.

Com escrita autorizada (seção 9), aparecem mais cinco:

| Ferramenta | O que faz |
| --- | --- |
| `origens_preview_product_changes` | **Prévia** de até 25 produtos: preço, preço promocional (definir ou encerrar), publicar/ocultar, nome (um produto), descrição, tags e categorias (incluir/remover) |
| `origens_preview_order_item_edit` | **Prévia** da troca de tamanho, cor ou produto de um item antes da fábrica (`items_editable`), no próprio pedido |
| `origens_preview_exchange` | **Prévia** de uma troca na INK (`exchangeable`) |
| `origens_confirm_change` | **Aplica** uma prévia pelo código. É a única ferramenta com `destructiveHint: true` |
| `origens_change_status` | Estado e resultado de uma alteração pelo código |

Toda resposta traz `meta` com:
- `source` (`ink_api`, `use_origens_index`, `use_origens_panel` ou combinações), `generated_at` e `data_as_of`;
- `period` e `date_basis`;
- `filters_applied`;
- `coverage` (`complete` / `partial` / `unavailable`, com o motivo);
- `unclassified_count` e `next_cursor`.

Os erros saem como resultado da ferramenta com código estável: `INVALID_INPUT`, `NOT_FOUND`, `FORBIDDEN`, `MISSING_SCOPE`, `MISSING_CREDENTIAL`, `RATE_LIMITED`, `UPSTREAM_UNAVAILABLE`, `INCOMPLETE_COVERAGE`, `CATALOG_UNAVAILABLE`, `CONFLICT` (código usado, expirado, de outra conta, ou pedido fora da janela) e `INK_REJECTED` (a INK recusou a escrita).

## 3. Contrato das métricas

O código está em `src/lib/mcp/sales.ts` e os testes em `tests/unit/mcp-tools.test.ts`.

- **Venda.** Pedido **criado** no período, contado em dias de São Paulo com início e fim inclusivos, com pagamento "Pago" **no momento da consulta**.
  - A INK não expõe a data de confirmação do pagamento. Por isso o `date_basis` é "pedidos criados no período com pagamento aprovado", e não "pagamentos recebidos no período".
  - A INK filtra pedidos por dia de criação, num fuso que não documenta. A consulta pede um dia a mais de cada lado e o corte exato é feito aqui.
- **Excluídos e contados à parte:**
  - não pagos;
  - trocas (`is_exchange`);
  - pedidos com total ≤ 0;
  - duplicados de paginação.
- **Unidades:** quantidade − reembolsadas − brinde.
- **Dinheiro:** é calculado em centavos inteiros, a partir das strings decimais da INK, sem float. Identidade conferida em **400 de 400** pedidos reais (Sul e Centro-Oeste, jul–out/2026):
  - `item.total_value = unit_value × quantity`;
  - `order.total_value = Σ itens + shipping_value − promotion_value − payment_discount_value − freight_value_difference`;
  - um pedido reembolsado mantém o `total_value` e muda só o status.
- **Repasse:** é o `kickback_value` informado pela INK. Não é lucro.
- **Com filtro por item** (estampa, produto ou destino), o valor é preço unitário × unidades líquidas, antes de promoção e desconto do pedido e sem frete. A INK não informa o rateio por item, então não se inventa um "líquido por item".
  - Um pedido com estampas de duas regiões conta **só as linhas** de cada uma.
  - `orders_with_matching_items` e `orders_only_matching_items` separam "pedidos com itens da região" de "pedidos só com ela".
- **Estampa × entrega × loja:**
  - região, UF e cidade da **estampa** vêm da classificação do produto (`src/lib/mcp/classify.ts`), pelas mesmas regras do Pódio;
  - **cidade e UF de entrega** vêm do pedido;
  - a **loja** é só a origem comercial.
- **Como a estampa é classificada, em ordem:**
  1. catálogo da mesma loja, pelo ID INK;
  2. peça irmã, pelo `product_cluster_id`;
  3. parser determinístico do nome. Uma UF escrita no nome vale mesmo em outra loja (estampa migrada); sem UF no nome, valem só as UFs da loja.
- **Sem classificação:** item que nenhuma dessas regras resolve vai para `unclassified` (`not_placed` no ranking), com a participação informada. Nunca há aproximação.
- **Nunca usados:** o preço atual do catálogo para vendas passadas e o `total_sales_count` acumulado.

### Categorias

O código está em `src/lib/mcp/categories.ts`.

- **Categoria = coleção da INK** (`GET /v1/stores/collections`, escopo `store.categories.read`). O MCP **não chama a INK** para isso: lê o `collections-snapshot.json` que o `collections:sync` já grava ao lado do catálogo.
- **Visibilidade:** `public` aparece na loja INK (ex.: "Território", "Fala Daqui"); `internal` é segmentação oculta (ex.: "ZZ - SU - SC"). Na listagem saem as duas; no ranking o padrão é `public` (`category_visibility` muda).
- **Referência:** `category` aceita o id numérico ou o slug/nome. Um slug pode existir em mais de uma loja ("territorio" no Norte e no Centro-Oeste): o filtro vale para todas as lojas consultadas.
- **Pertença:** o sync guarda os membros só entre as estampas clássicas e o merch do catálogo (a lista bruta da INK passa de 100 mil ids). Logo:
  - um produto **fora** desse conjunto (outro modelo vendido por link, produto retirado, produto sem classificação) tem pertença **desconhecida**, nunca "sem categoria";
  - essas unidades saem em `not_placed` (motivo `category_membership_unknown`) e em `category_coverage`, e a `coverage` da resposta fica `partial` com a participação delas;
  - uma loja com categorias de um sync antigo (só parte dos membros) também fica como desconhecida até rodar `collections:sync` de novo.
- **Sobreposição:** um produto pode estar em várias categorias. No ranking por categoria, a linha conta em cada uma, a participação é sobre as linhas do recorte e as participações não somam 100% (`overlapping: true`).

### Cupons e promoções

O código está em `src/lib/mcp/promotions.ts`. São duas fontes, que não se misturam:
- **Painel** ("Cupons e promoções", por região, só o publicado): título, código, texto, janela e status **de agora** (`live`, `scheduled`, `ended`, `disabled`).
  - O painel descreve, e quem aplica é a INK. A configuração da promoção dentro da INK (regra, valor, limite) **não é lida**.
  - O painel não guarda quando um item esteve ligado.
- **Pedidos:** `promotion_code` e `promotion_value` dos pedidos pagos do período, no mesmo universo das vendas.
  - **Por código**, sem diferenciar maiúsculas: pedidos, unidades, total, mercadorias, desconto, frete e ticket médio, ligados ao cupom do painel quando o código bate.
  - **Sem código:** os mesmos totais, para comparar. `orders_with_promotion_discount` conta os pedidos que tiveram desconto da INK sem código, como uma promoção automática.
  - **Cupons do painel que ninguém usou** no período, só das regiões das lojas consultadas.
- **Sem período,** a ferramenta só lê o painel e não chama a INK.
- **`region`** também restringe o uso à loja da região.
- **Limite da leitura:** pedido com cupom não prova que o cupom causou a venda. O ticket com e sem código é uma comparação, não um efeito.
- **Filtro `promotion_code`** em resumo e ranking: só as linhas dos pedidos com aquele código. Serve para ver, por exemplo, quais estampas saem com o LEVEMAIS.

### Produtos em promoção

- **Quando um produto está em promoção:** o preço promocional da INK está abaixo do preço normal no último sync. O índice guarda o preço normal em `list_price`.
- **Desconto:** `discount_percent` é truncado, como a página da INK mostra.
- **Busca:** `on_sale: true` filtra só esses produtos.

### Dimensões da variante

`model`, `size` e `color` agrupam pelo que a INK grava na variante do item vendido. Item sem o campo vai para `not_placed` (motivo `unknown_variant`).

**Observado em 15/10/2026 (últimos 30 dias, 3 lojas):** 16,5% das unidades vendidas ficaram sem classificação. Todas são **estampas estaduais**, não de cidade: "Mato Grosso do Sul | Clean", "Made in Amazonas", "Santa Catarina | Atlas do Sul" e afins. O catálogo trata essas peças como merch. Ficaram de propósito em `unclassified` (ver seção 8).

## 4. Dados pessoais

O parse (`src/lib/mcp/orders-model.ts`) descarta, já na entrada, os campos abaixo. Nada disso chega a cache, log ou resposta:
- comprador: nome, e-mail, telefone e documento;
- endereço de cobrança;
- rua, número, complemento, bairro e CEP do endereço de entrega;
- forma de pagamento e dados de PIX;
- imagens de arte;
- descrição e observação dos eventos de entrega.

Do destino ficam só a cidade e a UF. Os testes colocam PII nos pedidos brutos e conferem que ela não aparece em nenhuma resposta.

Cada chamada gera **uma linha de log** JSON (`evt: "mcp_tool"`) com: ferramenta, `call_id`, `client_id`, sujeito (id interno), duração, quantidade de registros, resultado e código. Entradas, tokens e dados de pedido não entram no log.

## 5. Autenticação (OAuth 2.1)

O código está em `src/lib/mcp/auth/*` e nas migrações `db/migrations/0006_mcp_oauth` e `0007_mcp_changes`.

| Endpoint | Função |
| --- | --- |
| `GET /.well-known/oauth-protected-resource/api/mcp` | Metadados do recurso (RFC 9728): `resource` = URL do MCP |
| `GET /.well-known/oauth-authorization-server` | Metadados do servidor (RFC 8414): PKCE S256, cliente público, DCR |
| `POST /api/mcp/oauth/register` | DCR (RFC 7591). Só aceita `https://claude.ai/api/mcp/auth_callback` ou loopback |
| `GET /admin/oauth/authorize` | Consentimento. Login Railway do admin, só o dono |
| `POST /admin/oauth/authorize/decision` | Aprovar ou negar. Exige `Origin` do admin e sessão |
| `POST /api/mcp/oauth/token` | `authorization_code` com PKCE; `refresh_token` com rotação |
| `POST /api/mcp/oauth/revoke` | Revogação (RFC 7009). Revoga a autorização inteira |
| `POST /api/mcp` | O MCP (Streamable HTTP, sem sessão, respostas JSON) |

**Regras:**
- **Códigos:** 60 s de validade e uso único. Um código reaproveitado revoga o que saiu dele.
- **Access token:** opaco, 1 h, amarrado ao `resource`.
- **Refresh token:** 30 dias, com rotação a cada uso. Um refresh antigo reapresentado depois de 60 s revoga a autorização inteira; dentro de 60 s, conta como refresh paralelo e só é recusado.
- **Armazenamento:** no banco só fica o **sha256** de códigos e tokens.
- **Sem token:** a resposta é 401 com `WWW-Authenticate: Bearer resource_metadata=…`, e é isso que faz o Claude iniciar o login.
- **Host:** fora do `ADMIN_HOST`, ou com o admin desligado, tudo responde 404.
- **Credenciais separadas:** a autorização Claude → MCP não tem relação com a credencial backend → INK. O token da INK nunca sai do servidor.
- **Escopos:**
  - `origens.read` vem sempre;
  - `origens.write` só se o dono marcar a caixa na tela de consentimento, peça o Claude ou não. A resposta do token informa o escopo concedido;
  - um refresh não amplia o escopo: para passar a escrever, é preciso conectar de novo.

**Variáveis:** para a leitura, valem as do admin (`ADMIN_HOST`, `ADMIN_OWNER_EMAIL`, `RAILWAY_OAUTH_CLIENT_*`, `ADMIN_SESSION_SECRET`, `DATABASE_URL`) e as da INK (`INK_TOKEN_SUL`, `INK_TOKEN_NORTE`, `INK_TOKEN_CENTRO`). O callback do Railway continua o mesmo. A escrita usa ainda `INK_WRITE_TOKEN_*` (seção 9).

## 6. Implantação e reversão

**Implantação:**
1. Mergear o PR.
2. Aplicar as migrações **antes ou junto do deploy**: `npm run db:migrate` com o `DATABASE_URL` de produção.
   - `0006` cria as 3 tabelas `mcp_oauth_*`.
   - `0007` cria `mcp_change`, aceita o escopo `origens.write` e a ação `mcp.write` no `audit_log`.
   - Sem a `0007`, a leitura funciona, mas uma conexão com escrita falha ao gravar o código.
3. Fazer o deploy no Railway (como sempre).
4. Conferir sem login:
   - `curl -i -X POST https://www.useorigens.com.br/api/mcp` deve dar **401** com `WWW-Authenticate`;
   - `curl https://www.useorigens.com.br/.well-known/oauth-authorization-server` deve devolver o JSON de metadados.
5. Adicionar o conector no Claude (seção 1) e fazer uma pergunta de teste.

**Reversão:**
- **Desligar:** remover o conector no Claude e fazer o rollback do deploy. A loja não depende de nada disto.
- **Só a escrita:** apagar as variáveis `INK_WRITE_TOKEN_*` desliga toda alteração na hora. Prévias passam a responder `MISSING_CREDENTIAL`.
- **Banco:**
  - `0007_mcp_changes.down.sql` apaga `mcp_change`, os registros `mcp.write` e as conexões com escrita;
  - `0006_mcp_oauth.down.sql` apaga o resto.

## 7. Verificações feitas (15/10/2026)

**Rodada de categorias e cupons:**
- **`tests/unit/mcp-tools.test.ts`:** 28 testes, 10 deles novos. Cobrem:
  - categoria por id, slug e nome em duas lojas, e categoria inexistente;
  - ranking por categoria com sobreposição e pertença desconhecida (e a `coverage` parcial);
  - resumo filtrado por categoria;
  - busca por categoria e `on_sale`, e categorias de um produto e de uma peça irmã;
  - listagem com filtros;
  - o caso sem snapshot de categorias;
  - cupons sem período (nenhuma leitura da INK) e com período (código em minúsculas ligado ao cupom do painel, pedidos sem código, cupom sem uso, `region`);
  - filtro `promotion_code` e ranking por tamanho.
- **Suíte completa:** 1.522 testes passando; `tsc` e `eslint` limpos.
- **Dados locais reais, sem INK** (snapshot de catálogo, de categorias e o `published.json` local):
  - 260 categorias nas 3 lojas, 52 públicas com produtos;
  - "territorio" achou 908 produtos em Norte e Centro-Oeste;
  - a categoria "Santa Catarina" achou as 35 estampas estaduais;
  - 20 produtos em promoção;
  - os 3 itens do painel do Sul saíram com status.
- **Não rodado:** a parte de pedidos contra a INK real. O `scripts/qa/mcp-e2e.mts` já tem os checks novos, mas lê a produção.

**Primeira versão:**

- **Contrato INK, só leitura, com as credenciais atuais das 3 lojas:**
  - `GET /v1/stores/orders` (lista, filtros `payment_status`, `order_status`, `begin_date` e `end_date`), `/v1/stores/orders/{id}`, `/v1/stores/orders/{id}/refunds`, `/v1/stores/products/{id}` (com `product_variants`) e `/v1/stores/collections` respondem 200;
  - os scripts imprimiram só nomes de campos, tipos e contagens.
- **Testes:**
  - `tests/unit/mcp-tools.test.ts`: 18 testes. Cobrem período e fuso, dinheiro, minimização de PII, classificação, pedido com duas regiões, troca, reembolso, item sem classificação, ranking, cursor e o protocolo MCP inteiro via SDK;
  - `tests/unit/mcp-oauth-*.test.ts`: fluxo OAuth e rotas;
  - `tests/integration/mcp-oauth-pg.test.ts`: o store em Postgres (PGlite), com corrida pelo mesmo código, rotação, reuso, revogação e purge;
  - `node db/validate-migrations.mjs` passa.
- **Suíte completa:** 1.454 testes passando; `tsc` e `eslint` limpos.
- **Ponta a ponta em dev** (`scripts/qa/mcp-e2e.mts`, servidor local com `ADMIN_DEV_MODE`), com **23/23** checks:
  - descoberta, DCR (redirect estranho recusado), consentimento, código, troca, código repetido revogado, refresh com rotação e token inválido;
  - depois, o cliente MCP oficial chamando as 8 ferramentas contra a **INK real**: resumo de 30 dias nas 3 lojas em ~1,6 s com 4 GETs, e repetição servida do cache em ~10 ms;
  - pedido sem nenhuma chave de dado pessoal e período longo recusado.

## 8. Limites e pendências

- **Não testado no Claude de verdade:** depende do deploy e da migração em produção. Um curl respondendo não prova o conector pronto.
- **Pedidos direto da INK, por escolha do dono:**
  - até 186 dias por pergunta em vendas e 92 em pedidos;
  - no máximo 45 GETs e 50 s por pergunta; passou disso, a resposta é `INCOMPLETE_COVERAGE` em vez de um total parcial;
  - 1 GET/s por loja; somado ao sync do catálogo (40/min), fica dentro dos 100/min por loja.
  - Para análises longas (ano inteiro, recorrência), uma base própria de pedidos seria o próximo passo.
- **"Pago" é o status atual:** um pedido reembolsado depois sai da conta quando a pergunta é refeita. Isso é declarado no `date_basis`.
- **Estampas estaduais** ficam em `unclassified`. Uma classificação estadual por nome exato do estado ("Santa Catarina | …", "Made in Goiás") seria uma mudança deliberada, a decidir. O ranking por categoria já mostra essas vendas pelas categorias "Santa Catarina", "Paraná" e "Rio Grande do Sul" do Sul, sem reclassificar nada.
- **Categorias de outros modelos:** a pertença de peças vendidas por link (Oversized, Body…) não é conhecida, porque o sync não guarda a lista bruta da INK. Herdar a categoria da camiseta clássica do mesmo cluster seria uma suposição, então não é feito.
- **Promoções dentro da INK:** o conector não lê a configuração das promoções na INK. A especificação da INK expõe `GET /v1/stores/promotions` (escopo `store.promotions.read`): ler isso é o próximo passo natural do `origens_promotions`.
- **Sem atribuição de campanha** nos pedidos da INK: estes dados não dizem qual anúncio gerou a venda (o ROAS precisa dos dados de Meta e Google).
- **Clickjacking:** o painel não manda `X-Frame-Options`. A tela de consentimento fica protegida porque o cookie de sessão é `SameSite=Lax` e não vai para iframe de outro site, que então mostraria só o login. Endurecer todos os cabeçalhos do admin fica para outra rodada.
- **Opcional, não feito:** uma tela no painel para listar e revogar conexões. Hoje a revogação é pelo Claude, pelo endpoint ou desativando a conta.

## 9. Escrita: alterações confirmadas

O código está em `src/lib/mcp/changes.ts` (regras), `write-tools.ts` (ferramentas), `ink-write.ts` (chamadas à INK) e `change-store.ts`/`change-pg-store.ts` (códigos), com a migração `0007_mcp_changes`. As rotas e campos seguem a especificação OpenAPI da INK (`documentacao-api-ink.yaml`, a mesma usada no Oria).

### Como funciona

1. **Prévia (não altera nada).**
   - Lê a INK **agora** e devolve o antes → depois, os avisos e um `confirmation_code` (`chg_…`).
   - O código vale **10 minutos**, **uma vez**, e só para a conta que pediu.
   - O plano fica no banco; do código, só o sha256.
2. **O dono aprova na conversa.** As instruções do servidor e a descrição de cada prévia mandam mostrar a prévia e esperar o OK explícito.
3. **Confirmação** (`origens_confirm_change`):
   - envia exatamente o plano guardado: nada do que o modelo escrever nessa hora muda o que vai para a INK;
   - toda escrita leva uma `Idempotency-Key` derivada do código, então uma repetição (rede, 5xx, 429) nunca aplica duas vezes;
   - o resultado sai item a item: `applied`; `rejected` (a INK recusou, nada mudou); `unknown` (sem resposta, confira); `not_sent`.
4. **Registro:** cada confirmação vira uma linha `mcp.write` no `audit_log`, com o que foi enviado e o que a INK respondeu. `origens_change_status` mostra o resultado depois.

### Requisitos

- **Escopo:** a conexão precisa do `origens.write`: a chave de API sempre tem, e pelo OAuth é a caixa na tela de consentimento. Sem ele, as ferramentas de escrita não aparecem.
- **O que o Claude lê:** as instruções do servidor e o `origens_capabilities` seguem a conexão. Com escrita, `access` diz "Leitura e alteração" e lista as lojas com credencial de escrita (`write_tools.stores_with_write_credential`). Antes de 25/10/2026, os dois diziam "somente leitura" mesmo com escrita, e o Claude no claude.ai respondia que não podia alterar.
- **Credencial:** cada loja precisa da sua credencial de escrita, `INK_WRITE_TOKEN_SUL`, `INK_WRITE_TOKEN_NORTE` e `INK_WRITE_TOKEN_CENTRO`.
  - Ela é **separada** do token de leitura dos syncs, que continua só de leitura.
  - Escopos na INK: `store.products.read/write`, `store.categories.read/write`, `store.orders.read/write` e `store.exchanges.read/write`.
  - Sem a variável, a loja não aceita alteração.
- **Trocas na leitura:** a leitura de trocas usa a credencial de escrita quando existe, porque o token de leitura pode não ter `store.exchanges.read`.

### Produtos (`PATCH /v1/stores/products/{id}`)

- **Campos:**
  - preço normal (não mexe no promocional);
  - preço promocional do próprio produto (`promotional_price`): um valor menor que o preço normal, ou `null` para encerrar a promoção. É o campo do produto na INK (PATCH), não as promoções/cupons da INK. A INK também recusa abaixo do preço mínimo do tipo de produto;
  - `visible_in_store` (ocultar mantém o produto vendável por link);
  - nome (um produto por vez) e descrição;
  - tags (incluir/remover) e categorias (incluir/remover).
- **Limites e restrições:**
  - até 25 produtos por prévia;
  - a INK só altera produtos sob demanda;
  - arte e variantes ficaram de fora.
- **Avisos da prévia:** preço que muda mais de 30%, produto com preço promocional ativo quando só o preço normal muda, publicar um produto que a curadoria ainda não aprovou.
- **Tags e categorias são listas inteiras na INK.** Por isso:
  - o plano guarda só o pedido ("incluir Natal", "tirar de Território");
  - na confirmação, o MCP relê a INK e aplica esse pedido sobre o estado daquele momento;
  - assim, nenhuma tag ou categoria que ninguém citou se perde.
- **Categoria muda pelo produto** (o campo `collections` dele), com a lista de categorias relida ao vivo para saber em quais ele está.
  - A INK não informa as categorias na leitura do produto.
  - O `PATCH /collections/{id}` não é usado: ele substitui a lista inteira da categoria e aceita no máximo 100 produtos, então apagaria milhares numa categoria grande.
- **Depois da confirmação:** o site e o índice do MCP mostram a mudança no próximo sync do catálogo.

### Troca: os dois caminhos da INK

A leitura do pedido (`origens_get_order`) diz qual vale agora.

- **Antes da fábrica** (`items_editable`): `PATCH /v1/stores/orders/{id}`.
  - Troca tamanho, cor ou produto direto no pedido, sem abrir troca e só por item de mesmo preço.
  - Troca a linha inteira (todas as unidades do item).
  - A prévia avisa quando o preço difere.
- **Antes da produção ou até 30 dias após a entrega** (`exchangeable`): `POST /v1/stores/exchanges`.
  - Leva motivo e itens; a quantidade vai até as unidades não reembolsadas.
  - Defeito, posição e qualidade de impressão exigem descrição e ao menos uma foto (URL https, que a INK baixa) e passam pela análise do suporte.
  - Depois da entrega, a troca **consome o direito de troca do cliente**; antes da produção, é cortesia. A INK decide, e a prévia avisa o esperado.
- **Variante:** dá para escolher pelo `variant_id` ou por tamanho/cor/modelo. O que não for informado mantém o do item: só `size: "G"` quer dizer mesmo modelo e cor, tamanho G. Variante ambígua ou indisponível é erro, com a lista das opções.
- **O que a API não faz:** aprovar, recusar ou cancelar troca. O status vem da INK.
- **Dados pessoais:** prévias e trocas mostram pedido, item, produto e variante; nunca dados do comprador. Dos pedidos ligados a uma troca, ficam só os ids.

### Fora do escopo, de propósito

Excluir produto ou categoria, reembolso, criar produto, arte, variantes, criar ou editar promoção na INK e lotes maiores que 25. Cada um seria uma decisão à parte.

### Verificações (16/10/2026)

- **`tests/unit/mcp-write.test.ts`:** 16 testes. Cobrem:
  - validação de entrada;
  - listas inteiras preservadas (tags e categorias relidas na confirmação);
  - escolha de variante;
  - janelas de edição e de troca;
  - exigências dos motivos de defeito;
  - código usado, expirado, de outra conta e inventado;
  - resultado parcial (`rejected` e `unknown`);
  - loja sem credencial de escrita;
  - conexão somente leitura sem as ferramentas;
  - trocas sem dados do comprador.
- **`tests/integration/mcp-change-pg.test.ts`:** duas confirmações simultâneas do mesmo código têm um só vencedor no Postgres; expiração, outra conta e purge.
- **`node db/validate-migrations.mjs`:** passa, com up → down → up da `0007`.
- **Não testado contra a INK real:** a validação feita aqui não alterou nada na INK nem na produção. O primeiro uso real deve ser um produto de teste ou oculto.

