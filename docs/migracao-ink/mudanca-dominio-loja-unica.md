# Roteiro: mudança de domínio da loja única

> **Para quem for executar (pessoa ou agente):** leia tudo antes de começar. Siga a ordem. Cada passo diz se é **leitura** (pode rodar sem perguntar) ou
> **escrita** (publica algo; confirme com o dono antes). Nada aqui foi executado ainda: o código está pronto e **desligado** desde 16/10/2026.

## Contexto

- Desde 16/10/2026 há **uma loja única** na INK: a antiga Use Sul, que vende Sul, Norte e Centro-Oeste (`COMMERCE_MODE=single-store` no Railway).
  As lojas antigas Use Norte e Use Centro-Oeste redirecionam para ela (worker-lojas #26/#27, `docs/redirect-lojas-antigas.md` naquele repositório).
- A loja única vai mudar de domínio:

  | | Hoje | Depois |
  |---|---|---|
  | Host | `www.usesul.com.br` | `loja.useorigens.com.br` |
  | Prefixo | `/usesul` | `/useorigens` |
  | Slug da loja na INK | `usesul` | `useorigens` (**assumido**, confirmar) |

- É a **mesma loja na INK**: produtos, slugs de produto, variantes, cupons e pedidos não mudam. Só host, prefixo e slug da loja.

## O que já está pronto (desligado)

| Onde | O que liga | O que faz |
|---|---|---|
| **Worker** (repositório `gatomazi/worker-lojas`, local em `~/projects/use-origens-workers-release`), #26 | var `SINGLE_STORE_DOMAIN=next` | Sul: atende em `loja.useorigens.com.br/useorigens`. No domínio antigo, **tudo** redireciona para o mesmo caminho no novo, com **todos** os parâmetros; a região do visitante (cookie `origens_r`) vai como `?origens_r=`. Norte e Centro-Oeste: o redirect vai direto para o domínio novo |
| **Storefront** (este repositório), #94 | `NEXT_PUBLIC_INK_SUL_DOMAIN=next` (Railway, serviço `useorigens-storefront`) | Todos os links da Sul que o site monta: base dos produtos, espelho do carrinho, coleções da INK (menu, seções, busca, MCP), "Ver todos" editoriais, "Loja online", link de personalização |

Peças-chave:
- **Worker:** `src/domain-move.js`, `src/stores.js` (`nextInk`, `withInkDomain`, `singleStore`), `scripts/domain-move-toml.mjs`, `scripts/domain-move-routes.mjs`, `docs/mudanca-dominio-loja-unica.md`.
- **Storefront:** `src/lib/ink/sul-domain.ts` (a fonte de verdade dos dois domínios), `acceptedStoreProductBases` e `storeSlugMatches` em `src/lib/ink/config.ts`.

**Proteção do sync:** o índice de peças, as recomendações e o MCP **aceitam os dois domínios** ao conferir o que a INK manda, e sempre remontam o link com o domínio ativo.
Por isso a ordem entre a troca na INK, o sync e a variável não esvazia o catálogo. Antes do #94, uma peça com URL fora de `www.usesul.com.br/usesul` era descartada.

## Antes do dia

Nenhum destes itens publica nada no site.

1. **Confirmar com a INK** (o dono pergunta):
   - o host e o prefixo finais (`loja.useorigens.com.br/useorigens`);
   - o slug novo da loja;
   - se a URL de **todos** os produtos (`store_product_url` na API) muda de uma vez;
   - se o domínio antigo continua respondendo na INK depois da troca;
   - que registro DNS a INK pede para `loja`.

   **Se o host, o prefixo ou o slug forem outros:** ajustar `nextInk` em `worker-lojas/src/stores.js` e `SUL_INK_DOMAINS.next` em `src/lib/ink/sul-domain.ts` (PR nos dois) antes de seguir.
2. **DNS** na zona `useorigens.com.br` (Cloudflare): criar `loja` conforme a INK pedir, **Proxied** (nuvem laranja), sem isso o Worker não roda.
   Conferir o modo SSL da zona (precisa funcionar com a INK; em geral "Full (strict)") e se nenhuma regra de WAF/bot pega o checkout.
   O token do `wrangler login` não lê essas configurações (deu 403); quem confere é o dono no painel.
3. **Meta:**
   - verificar o domínio `useorigens.com.br` no Business Manager, se ainda não estiver;
   - conferir o feed/catálogo de produtos (URLs) e as URLs de destino dos anúncios ativos. Pelo redirect continuam funcionando, mas convém atualizar.
4. **GA4** (`G-8GYTEJ1F77`, a mesma propriedade no site e na página da INK): em "Configurar domínios", incluir `loja.useorigens.com.br` (manter `usesul.com.br` até o 301).
5. **Search Console:** adicionar a propriedade `loja.useorigens.com.br`. Depois do 301 (passo 9), usar "Mudança de endereço" de `www.usesul.com.br`.
6. **Escolher um horário de pouco movimento.** Login e carrinho da INK não atravessam domínios: quem estiver logado ou com carrinho montado recomeça.
   Pedidos antigos, inclusive os links nos e-mails, seguem funcionando pelo redirect.

## Valores do momento (16/10/2026, conferir de novo no dia)

Conferir com `npx wrangler deployments list --name <worker>` e `npx wrangler versions view <versão> --name <worker> --json`.

| Worker | Versão no ar | Variáveis (`--var`) que precisam ser repetidas no deploy |
|---|---|---|
| `use-sul-widget` | `a58d66e4-0ad4-4346-8b3e-776286086b77` | `ENABLE_WIDGET=true`, `WIDGET_SCOPE_MODE=product-catalog`, `WIDGET_FEATURES=return-link,post-add-discovery,city-search,cart-discovery,cart-mirror,product-discovery,header-nav,list-session,promo-fab,auto-recommendations,pdp-share,size-guide,pdp-guide,size-fit`, `WIDGET_ALLOWLIST` (ver abaixo). Sem `STORE_ID` (padrão = sul). `SERVE_REGIONS` já vem do TOML |
| `use-norte-widget` | `28bfe612-f479-479c-ae05-234aac2c0be2` | `ENABLE_WIDGET=true`, `STORE_ID=norte`, `WIDGET_SCOPE_MODE=product-catalog`, `WIDGET_ALLOWLIST=/usenorte/product/acara-origem-pa-51b9a32f-0281-478d-b641-77b8df830cc2,/usenorte/product/assis-brasil-origem-ac,/usenorte/product/labrea-origem-am`, `WIDGET_FEATURES=return-link,post-add-discovery,city-search,cart-discovery,cart-mirror,product-discovery,header-nav,list-session,promo-fab,auto-recommendations,pdp-share,size-guide` |
| `use-centro-widget` | `1d6fef14-08c8-4445-8e81-2c5a1a1c4b5e` | igual ao Norte, com `STORE_ID=centro` e `WIDGET_ALLOWLIST=/usecentro/product/goiania-origem-go,/usecentro/product/campo-grande-origem-ms,/usecentro/product/sinop-origem-mt` |

**`WIDGET_ALLOWLIST` da Sul hoje:**
```
/usesul/product/serra-catarinense,/usesul/product/made-in-rio-grande-do-sul-8834d3a7-4ed3-49a3-8258-d2ba71fa8241,/usesul/product/made-in-santa-catarina-60ba13f6-62cf-4309-9d03-490ab9193829,/usesul/product/paranaense-essencia,/usesul/product/made-in-parana-cda5fe30-bb4e-4e2e-b416-01e3ec45649a
```
No deploy do domínio novo, troque `/usesul/` por `/useorigens/` em cada caminho. O escopo é `product-catalog`, então a lista quase não pesa, mas um prefixo errado deixa `allowlist_status` inválido no health.

**Para Norte e Centro**, os TOMLs legados (`wrangler.norte.legado.resolved.toml`, `wrangler.centro.legado.resolved.toml`) são ignorados pelo git. Se não existirem, gere de novo:
```bash
node scripts/legacy-toml.mjs norte 02633b81f54e42ebade5eaf66f2ffaeb
node scripts/legacy-toml.mjs centro 741925df1cb9458b9f2782d166f3dd82
```
Eles saem de `wrangler.<loja>.resolved.toml`; os ids são dos KV `LEGACY_MAP_NORTE` e `LEGACY_MAP_CENTRO`.

## No dia, nesta ordem

Rode no repositório do Worker (`~/projects/use-origens-workers-release`, na `main` atualizada), salvo quando indicado.

**1. Leitura: o estado das rotas**
```bash
node scripts/domain-move-routes.mjs plan
```
Esperado: `www.usesul.com.br` com 10 rotas, entre elas a exclusão `www.usesul.com.br/usesul/* -> (sem Worker)`. `loja.useorigens.com.br` com 0 rotas.

**2. Escrita: a exclusão do domínio novo, ANTES de qualquer deploy.** Com ela, login, carrinho e checkout do domínio novo ficam fora do Worker.
```bash
node scripts/domain-move-routes.mjs apply --step=new-exclusion
```

**3. O dono troca o domínio no painel da INK.**
Conferir que `https://loja.useorigens.com.br/useorigens` abre a loja, ainda sem o nosso Worker, e que um produto abre.

**4. Escrita: Worker da Sul no domínio novo**
```bash
node scripts/domain-move-toml.mjs        # gera wrangler.useorigens.resolved.toml (rotas novas + www.usesul.com.br/* + SINGLE_STORE_DOMAIN="next")
npx wrangler deploy -c wrangler.useorigens.resolved.toml --dry-run --var ENABLE_WIDGET:true --var WIDGET_SCOPE_MODE:product-catalog --var WIDGET_FEATURES:<as da tabela> --var WIDGET_ALLOWLIST:<com /useorigens/>
npx wrangler deploy -c wrangler.useorigens.resolved.toml --var ...   # as mesmas --var
```
Anote a versão nova.

**5. Escrita: tirar a exclusão antiga.** Sem isso, `/usesul/*` no domínio antigo não chega ao Worker e não redireciona. O script recusa rodar se o passo 4 não tiver sido feito.
```bash
node scripts/domain-move-routes.mjs apply --step=drop-old
```

**6. Escrita: storefront.** No Railway, crie a variável e o Railway refaz o build sozinho, porque `NEXT_PUBLIC_*` entra no build:
```bash
railway variables --service useorigens-storefront --set "NEXT_PUBLIC_INK_SUL_DOMAIN=next"
```
Espere o deploy terminar (`railway status` ou o painel).

**7. Escrita: sync manual da loja única**, para as URLs dos produtos virem da INK já no domínio novo. É o mesmo sync que roda todo dia às 06:35, pelo painel admin (Sincronização) ou pela rota de admin do catalog-sync.

**8. Escrita: Norte e Centro-Oeste direto para o domínio novo**, sem passar pelo `usesul`. É o mesmo deploy de hoje, mais uma variável:
```bash
npx wrangler deploy -c wrangler.norte.legado.resolved.toml  --var SINGLE_STORE_DOMAIN:next --var <as da tabela do Norte>
npx wrangler deploy -c wrangler.centro.legado.resolved.toml --var SINGLE_STORE_DOMAIN:next --var <as da tabela do Centro>
```

**9. Depois de alguns dias sem problema: 301.** É o que faz o Google transferir o ranqueamento.
- Sul: redeploy do passo 4 com `--var DOMAIN_MOVE_STATUS:301`.
- Norte e Centro: redeploy do passo 8 com `--var LEGACY_REDIRECT_STATUS:301`. Isso é independente da troca de domínio e pode ser feito antes.
- Em seguida, a "Mudança de endereço" no Search Console.

## Conferência (leitura)

```bash
# Health do Worker da Sul, nos dois hosts
curl -s https://www.usesul.com.br/__origens/health | jq '{ink_host, former_ink_host, ink_domain_status, allowlist_status}'
#   esperado: ink_host "loja.useorigens.com.br", former_ink_host "www.usesul.com.br", ink_domain_status "ok", allowlist_status "ok"
curl -s https://loja.useorigens.com.br/__origens/health | jq .ink_host

# O domínio antigo leva tudo, com todos os parâmetros
curl -sI 'https://www.usesul.com.br/usesul/product/serra-catarinense?variant=1&utm_source=x' | grep -i location
#   esperado: https://loja.useorigens.com.br/useorigens/product/serra-catarinense?variant=1&utm_source=x
curl -sI https://www.usesul.com.br/usesul/orders | grep -i location          # -> /useorigens/orders
curl -sI https://www.usesul.com.br/ | grep -i location                       # -> /useorigens

# O domínio novo funciona com o loader
curl -s https://loja.useorigens.com.br/useorigens/product/serra-catarinense | grep -c '__origens/loader.js'   # 1
node scripts/domain-move-routes.mjs plan     # loja.useorigens.com.br/useorigens/* -> (sem Worker) presente; www.usesul.com.br/usesul/* ausente

# Lojas antigas
curl -sI https://www.usenorte.com.br/usenorte/product/acara-origem-pa-51b9a32f-0281-478d-b641-77b8df830cc2 | grep -i location
#   esperado: https://loja.useorigens.com.br/useorigens/product/acara-origem-pa-6db8efef-ac64-44c6-91db-d4f033323c9e?origens_r=norte

# Storefront: links apontando para o domínio novo, e o catálogo da Sul cheio
curl -s https://useorigens.com.br/sul/sc/florianopolis | grep -o 'https://loja.useorigens.com.br/useorigens/product/[a-z0-9-]*' | head -3
curl -s https://useorigens.com.br/sul/sc/florianopolis | grep -c 'www.usesul.com.br'    # 0, ou só o que vier do CMS (ver abaixo)
```

Depois do sync (passo 7), confira no admin (Sincronização) que a contagem de peças da loja única não caiu: hoje são cerca de 17 mil camisetas de cidade.
Conferir também uma compra de ponta a ponta: produto, carrinho, checkout até a tela de pagamento, sem pagar.

## Rollback

Desfaça na ordem inversa. Voltar o site e o Worker só faz sentido **se a INK também voltar** para o domínio antigo: com a INK no domínio novo, o domínio antigo não tem mais loja.
```bash
node scripts/domain-move-routes.mjs apply --step=restore-old                    # recria www.usesul.com.br/usesul/* sem Worker
npx wrangler rollback a58d66e4-0ad4-4346-8b3e-776286086b77 --name use-sul-widget
npx wrangler rollback 28bfe612-f479-479c-ae05-234aac2c0be2 --name use-norte-widget
npx wrangler rollback 1d6fef14-08c8-4445-8e81-2c5a1a1c4b5e --name use-centro-widget
railway variables --service useorigens-storefront --set "NEXT_PUBLIC_INK_SUL_DOMAIN=current"   # novo build
```
Rotas não são versionadas, então o `rollback` do Worker não as restaura. Rotas do domínio novo que sobrarem são inofensivas enquanto o DNS de `loja` não apontar para a INK.

## Pendências conhecidas (não bloqueiam)

- **Links salvos no CMS** (CTAs, tiles, destinos externos) com `www.usesul.com.br/...` continuam funcionando pelo redirect, com um salto a mais. Dá para trocar com calma no admin.
- **Textos e placeholders do admin** que mostram `www.usesul.com.br` (`GridTilesEditor`, `SectionEditorForm`, solicitações de personalização) são só exemplos.
- **Guias de medidas** (`src/lib/catalog/size-guides.ts`, `sourcePage`) guardam a URL de onde a medida foi tirada. É só referência, não vira link.
- **Apex `usesul.com.br`** (sem www) é DNS-only. Para redirecionar também, ligue o proxy e crie uma rota `usesul.com.br/*` no Worker. O código já reconhece o host.
- **Home das lojas antigas com barra e query** (`/usenorte/?utm…`) não passa pelo Worker, porque o Cloudflare não aceita query em rota. Se importar, resolva com uma regra de redirect na zona.
