# MCP Use Origens × Reserva INK

Conector privado, **somente leitura**, para o dono da loja consultar produtos, vendas e pedidos das lojas Use Origens pelo Claude. O servidor roda no mesmo serviço do site, em `https://www.useorigens.com.br/api/mcp`.

Data desta versão: 15/10/2026.

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

**Claude Code:** `claude mcp add --transport http use-origens https://www.useorigens.com.br/api/mcp`. O retorno é um endereço local (`127.0.0.1` ou `localhost`), e a tela de consentimento avisa disso.

**Desconectar:** remova o conector no Claude. Para revogar no servidor, use `POST /api/mcp/oauth/revoke` com o token. Desativar ou rebaixar a conta dona no painel derruba todas as conexões na hora, porque toda requisição confere se o dono continua ativo.

## 2. Ferramentas

| Ferramenta | O que responde | Fonte |
| --- | --- | --- |
| `origens_capabilities` | Lojas, fontes, limites e definições das métricas | Configuração e índice |
| `origens_search_products` | Produtos por texto, região, UF ou cidade da estampa, família, tipo e visibilidade; paginado | Índice do site |
| `origens_get_product` | Um produto: classificação, preço e, ao vivo, status, visibilidade e variantes | Índice + API INK |
| `origens_sales_summary` | Totais do período (pedidos, unidades, total, mercadorias, frete, descontos, repasse, ticket) ou totais dos itens filtrados | API INK + índice |
| `origens_sales_ranking` | Ranking por produto, cidade/UF/região/família da estampa, cidade/UF de entrega ou loja | API INK + índice |
| `origens_list_orders` | Pedidos do período com status, prazos e atraso informado pela INK; totais por status | API INK |
| `origens_get_order` | Um pedido: itens com estampa classificada, valores, produção, entrega e rastreio | API INK + índice |
| `origens_catalog_status` | Último sync por loja, contagens e produtos sem classificação | Índice do site |

Todas têm as anotações `readOnlyHint: true`, `destructiveHint: false` e `idempotentHint: true`, e o comportamento é o mesmo: o cliente INK só faz GET em rotas fixas. Não existe ferramenta genérica de URL, SQL ou header.

Toda resposta traz `meta` com:
- `source`, `generated_at` e `data_as_of`;
- `period` e `date_basis`;
- `filters_applied`;
- `coverage` (`complete` / `partial` / `unavailable`, com o motivo);
- `unclassified_count` e `next_cursor`.

Os erros saem como resultado da ferramenta com código estável: `INVALID_INPUT`, `NOT_FOUND`, `FORBIDDEN`, `MISSING_SCOPE`, `MISSING_CREDENTIAL`, `RATE_LIMITED`, `UPSTREAM_UNAVAILABLE`, `INCOMPLETE_COVERAGE` e `CATALOG_UNAVAILABLE`.

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

O código está em `src/lib/mcp/auth/*` e na migração `db/migrations/0006_mcp_oauth`.

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

**Variáveis:** nenhuma nova. Valem as do admin (`ADMIN_HOST`, `ADMIN_OWNER_EMAIL`, `RAILWAY_OAUTH_CLIENT_*`, `ADMIN_SESSION_SECRET`, `DATABASE_URL`) e as da INK (`INK_TOKEN_SUL`, `INK_TOKEN_NORTE`, `INK_TOKEN_CENTRO`). O callback do Railway continua o mesmo.

## 6. Implantação e reversão

**Implantação:**
1. Mergear o PR.
2. Aplicar a migração **antes ou junto do deploy**: `npm run db:migrate` com o `DATABASE_URL` de produção. Ela só cria as 3 tabelas `mcp_oauth_*` e amplia o `CHECK` de ações do `audit_log`.
3. Fazer o deploy no Railway (como sempre).
4. Conferir sem login:
   - `curl -i -X POST https://www.useorigens.com.br/api/mcp` deve dar **401** com `WWW-Authenticate`;
   - `curl https://www.useorigens.com.br/.well-known/oauth-authorization-server` deve devolver o JSON de metadados.
5. Adicionar o conector no Claude (seção 1) e fazer uma pergunta de teste.

**Reversão:**
- **Desligar:** remover o conector no Claude e fazer o rollback do deploy. A loja não depende de nada disto.
- **Banco:** o arquivo `0006_mcp_oauth.down.sql` apaga as tabelas e as linhas de auditoria `mcp.*`.

## 7. Verificações feitas (15/10/2026)

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
- **Estampas estaduais** ficam em `unclassified`. Uma classificação estadual por nome exato do estado ("Santa Catarina | …", "Made in Goiás") seria uma mudança deliberada, a decidir.
- **Sem atribuição de campanha** nos pedidos da INK: estes dados não dizem qual anúncio gerou a venda (o ROAS precisa dos dados de Meta e Google).
- **Clickjacking:** o painel não manda `X-Frame-Options`. A tela de consentimento fica protegida porque o cookie de sessão é `SameSite=Lax` e não vai para iframe de outro site, que então mostraria só o login. Endurecer todos os cabeçalhos do admin fica para outra rodada.
- **Opcional, não feito:** uma tela no painel para listar e revogar conexões. Hoje a revogação é pelo Claude, pelo endpoint ou desativando a conta.
