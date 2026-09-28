# Correção do `noindex` global (Storefront)

Escopo: só o Storefront (`src/proxy.ts`). Nada da INK, Worker, checkout ou integrações. Autorização do dono: PR em branch separada; **merge e deploy são do dono**.

## Causa raiz

`src/proxy.ts` adiciona `X-Robots-Tag: noindex` a toda resposta cujo host não seja o canônico (regra pensada para o endereço temporário `*.up.railway.app`). A comparação usava `request.nextUrl.hostname`. Atrás de Railway/Cloudflare, `nextUrl` traz o hostname de bind do servidor (não o `Host` da requisição), então a comparação nunca batia e **toda página do domínio real saía `noindex`**.

Evidência:
- Produção, 2026-09-27: `/sul`, `/sul/rs`, `/sul/rs/bage`, famílias, `/norte` e o domínio raiz com `x-robots-tag: noindex`; `/sitemap.xml` sem o header (o matcher do proxy o exclui).
- Reprodução local: com `Host: www.useorigens.com.br`, com ou sem `X-Forwarded-Host`, o header continuava.
- Configuração efetiva do host canônico, sem ler variáveis: o `canonical` renderizado em produção é `https://www.useorigens.com.br/...` (vem de `metadataBase = siteUrl()`), portanto `NEXT_PUBLIC_SITE_URL` efetivo é `www` (valor definido ou fallback).

## Mudança (diff mínimo)

- Novo `src/lib/seo/canonical-host.ts`: `isCanonicalHost(hostHeader, siteUrl)`, função pura.
  - Usa o header `Host` recebido, em minúsculas, sem porta e sem ponto final.
  - Só aceita nomes de host bem formados (`[a-z0-9-]` separados por ponto, porta opcional). Host ausente, vazio, com vírgula, espaço, `@`, `/`, esquema, IPv6 ou quebra de linha: **não canônico** (continua `noindex`).
  - Comparação estrita e exata com o host de `NEXT_PUBLIC_SITE_URL`. O domínio raiz, subdomínios e hosts parecidos (`www.useorigens.com.br.evil.example`) não são canônicos.
  - `NEXT_PUBLIC_SITE_URL` malformado: nada é canônico (fail closed).
  - `X-Forwarded-Host` é ignorado. O resultado só decide se o `noindex` é adicionado; não é identidade nem destino de redirect, e nenhum redirect foi introduzido.
- `src/proxy.ts`: `isCanonical(request)` chama a função com `request.headers.get("host")`. O restante do proxy não muda: gate 503 do catálogo (com `noindex`), roteamento do admin (`decideRoute`, `noindex, nofollow`), matcher.

## O que continua protegido

- Host não canônico (raiz, Railway, preview, `localhost`, host inesperado, sem `Host`): `noindex` como antes.
- Admin: `decideRoute` roda antes e não foi alterado; `/admin/**` segue `noindex, nofollow` no host do admin e 404 nos demais.
- Páginas não indexáveis continuam pela própria meta `robots`: `/busca`, `/meus-lugares`, `/personalizar/*`, `/personalizar/solicitacao/*`, páginas do CMS com `indexable: false`, `/admin/*`.
- Nenhuma outra camada da aplicação emite `X-Robots-Tag` (busca em `src`, `next.config.ts` sem `headers()`).
- Não verificável daqui: regras do Cloudflare (Transform Rules, Managed robots.txt, WAF). O código reproduz o sintoma sozinho, então o app é a causa; mesmo assim, o teste pós-deploy abaixo confirma que nenhuma outra camada reintroduz o header.

## Testes

- `tests/unit/canonical-host.test.ts` (10 testes): `www` com/sem porta, maiúsculas, espaços, ponto final; domínio raiz; `*.up.railway.app` e preview; `localhost`/`0.0.0.0`; host inesperado; hosts parecidos; ausente/vazio; malformado/múltiplo; `NEXT_PUBLIC_SITE_URL` inválido, com porta e com caminho.
- `tests/e2e/infra.spec.ts` (+4): `Host` canônico → sem `x-robots-tag`; canônico só em `X-Forwarded-Host` → `noindex`; raiz e Railway → `noindex`; `/sul/busca` com `Host` canônico → meta `noindex`. Os 17 testes do arquivo passam, incluindo o teste antigo do gate de staging.
- `admin-routing.test.ts` continua verde.

## Procedimento pós-deploy (dono faz o deploy)

1. `curl -sI -A "Googlebot" https://www.useorigens.com.br/sul` (e `/sul/rs/bage`, uma página de família, `/norte`, `/centro-oeste`, uma cidade de cada): esperado `HTTP 200` **sem** `x-robots-tag`. Repetir com `-X GET` (não só HEAD).
2. Conferir `cf-cache-status`: respostas antigas em cache podem carregar `noindex` (`cache-control: s-maxage=3600`). Se aparecer, purgar o cache do Cloudflare para essas URLs.
3. Confirmar que continuam `noindex`: `https://useorigens.com.br/sul`, o endereço `*.up.railway.app`, `/sul/busca` (meta), `/admin/login`.
4. Meta robots no HTML: `curl -s URL | grep -i 'name="robots"'` só deve aparecer nas páginas não indexáveis.
5. Search Console: URL Inspection em `/sul`, `/sul/rs/bage`, uma família; "Solicitar indexação". Remover o `noindex` não garante indexação imediata.

## Rollback

Reverter o commit deste PR (`git revert`) ou voltar ao deployment anterior no Railway. Efeito do rollback: volta o `noindex` global (o estado atual). Não há migração, variável nem dado envolvidos.
