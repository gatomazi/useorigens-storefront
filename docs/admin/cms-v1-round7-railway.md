# CMS V1: Rodada 7: tudo no Railway

- Branch `feature/storefront-admin` (= `origin/feature/storefront-admin` no início; `main` avançou com 3 commits do cart-mirror, ver riscos). **Só commits locais. Nenhum push, merge, deploy, DNS, migração real, serviço pago, alteração de variáveis de produção ou mudança na INK.** Nenhum serviço real do Railway foi tocado: **Parte B não iniciada (depende de você)**.
- Guia operacional atualizado: [`production-runbook.md`](production-runbook.md). Verificação: `npm run cms:check`.
- Substitui as partes de Google e R2 do [`cms-v1-round6.md`](cms-v1-round6.md).

## 1. O que mudou (Parte A, tudo em código, testado com stand-ins)

| Área | Antes (Rodada 6) | Agora |
|---|---|---|
| Login | Google OIDC | **Login with Railway** (OIDC). Discovery oficial (`backboard.railway.com/oauth/.well-known/openid-configuration`, com os URLs documentados como reserva, e todo endpoint precisa estar sob `https://backboard.railway.com/`). Code + PKCE S256, `state`, `nonce`; ID token **ES256** (o único algoritmo do Railway; RS256/HS256/none recusados); `iss`, `aud`, `exp`, `iat`, JWKS por `kid`; cliente autenticado por HTTP Basic. **Escopos: só `openid email profile`.** Sem tokens guardados. |
| Identidade | e-mail Google verificado | Vínculo pelo **`sub` imutável** (coluna `provider_sub`, migration `0002` ajustada: nunca foi aplicada em banco real). Outra conta com o mesmo e-mail é recusada; a conta vinculada continua entrando se o e-mail mudar. |
| E-mail verificado | assumido | **Nunca assumido.** Só e-mail presente **e** verificado abre uma vaga na lista de pessoas. Se o ID token não trouxer e-mail, consulta-se `userinfo` (`/oauth/me`) só para a **mesma** conta. Se o Railway não vouchar o e-mail do owner: a tela de recusa mostra o **identificador da conta** e o owner o define em `ADMIN_OWNER_RAILWAY_SUB` (vínculo por id, procedimento controlado, sem confiar em e-mail). Ninguém vira editor só por conseguir entrar. |
| Env | `GOOGLE_*` | `RAILWAY_OAUTH_CLIENT_ID`, `RAILWAY_OAUTH_CLIENT_SECRET`, `ADMIN_OWNER_RAILWAY_SUB` (opcional). Redirect URI a cadastrar, **exatamente**: `https://www.useorigens.com.br/admin/auth/callback` (Rodada 7b; antes era o subdomínio `admin.`; mantive a rota efetiva `/admin/auth/callback`, não `/auth/callback`: todo o painel usa o prefixo `/admin`). |
| Mídia | R2 + `media.useorigens.com.br` | **Railway Storage Bucket privado** (endpoint documentado `https://t3.storageapi.dev`, região `auto`, endereçamento virtual-hosted por padrão, path-style por `BUCKET_ADDRESSING=path`). Sem domínio de mídia, sem bucket público, sem CDN prometido. Env: `BUCKET_ENDPOINT`, `BUCKET_NAME`, `BUCKET_ACCESS_KEY_ID`, `BUCKET_SECRET_ACCESS_KEY`, `BUCKET_REGION` (referências às variáveis do serviço do bucket). |
| Entrega de imagens | URL do R2 no `published.json` | `GET /media/<sha256>/<largura>.webp` **na própria loja**: formato estrito (sem traversal/SSRF), **só chaves listadas no `published.json`** (leitura local: nada de banco, nada de listar o bucket), `immutable` por um ano, `nosniff`, CSP `sandbox`, `ETag`/304, cache LRU em memória (32 MB), erro do bucket = 502 não cacheável (a seção cai para cor/gradiente). Fora do gate 503 do catálogo. O `published.json` guarda só caminhos relativos `/media/...`; URLs absolutas e `/admin/...` são recusadas na publicação e no leitor tolerante (exceção: o sandbox local de desenvolvimento). |
| Prévia/rascunhos | URL pública | Imagens de rascunho **não** saem por `/media` (404 até publicar). A prévia usa `/admin/media/<sha256>/<largura>.webp`, autenticado e `no-store`, e só objetos de uploads conhecidos. |
| `cms:check` | Google + R2 | Railway OAuth (imprime a redirect URI a cadastrar e avisa sobre `ADMIN_OWNER_RAILWAY_SUB`), PostgreSQL, **Railway Bucket** (leitura HEAD de um objeto inexistente: não grava nem apaga; sugere `BUCKET_ADDRESSING=path` se falhar), Volume, INK. Só nomes e OK/FAIL. |
| Docs | — | `production-runbook.md` reescrito (sem Google/R2/Cloudflare/`media.`); `.env.example` com os nomes; `docs/deploy/railway.md` aponta para o runbook. |

Mantido sem mudança: PostgreSQL, migrations, trava otimista, releases imutáveis, publicação atômica no Volume + reconciliação, rollback, auditoria, Pessoas, cookies `__Host-`, autorização no servidor em toda mutation, host admin (`noindex`, `no-store`), tracking com fallback exato, sincronização de coleções, `SITE_CONFIG_HOME` desligado por padrão.

## 2. O que foi testado, e com o quê

**Stand-ins (tudo local): nenhum serviço real foi usado.**

- Provedor OIDC falso com o formato do Railway (ES256, Basic, `userinfo`, JWKS), PostgreSQL real em WASM (PGlite, inclusive pela rede), bucket S3 falso **privado** (sem leitura pública), Volume temporário.
- Fora do que só o Railway real pode provar: compatibilidade exata do S3 do bucket (assinatura SigV4 validada contra o vetor da AWS; endereçamento virtual-hosted coberto por teste de URL/host assinado), formato real do ID token (baseado no discovery e na documentação, não em um token real), disponibilidade do claim `email_verified` para contas Railway, e o comportamento do proxy (`Host`, `Origin`) do Railway.

Resultados: seção 3.

## 3. Verificações

| Verificação | Resultado |
|---|---|
| `tsc --noEmit` | limpo |
| ESLint | 0 erros (2 avisos antigos em `db/validate-migrations.mjs`) |
| Vitest (unitários + integração em Postgres real) | **408 testes**, 27 arquivos. Novos/reescritos: OIDC Railway (ES256, Basic, discovery, userinfo, decisão de acesso), S3 (virtual-hosted, GET), rota pública de mídia, bucket store, fontes de mídia same-origin, config |
| `db:validate` (migrations up/down/up) | 40 verificações ok |
| Build limpo sem nenhum serviço, flags off | ok |
| Smoke de produção (inclui `/media/` inválido/traversal = 404 e admin fechado com configuração parcial) | **passou** |
| E2E do admin em **modo produção** (`npm run test:admin:prod`: `next start` + Postgres real via rede + provedor OIDC falso no formato Railway + bucket S3 **privado** falso + Volume temporário) | **8/8**: sem sessão, hosts, e-mail fora da lista/não verificado (mostra o id da conta), owner (cookie endurecido, logout invalida), ID token sem e-mail resolvido por `userinfo`, editor de outra região recusado, fluxo completo (habilitar interna → upload → prévia autenticada → 2 abas → publicar → `/media` público com `immutable`/`nosniff`/WebP real → 404 para não publicado, hash inexistente, traversal e outros formatos → tracking só depois do aceite → restaurar → auditoria), imagem em uso não removível |
| E2E do admin em modo dev (`npm run test:admin`) | **3/3** |
| E2E da loja (Playwright, uma passagem) | **93/93** |
| `verify:prerender` | passou |
| `verify:bootstrap` (build limpo) | passou |
| Captura 375 e 1440 de `/sul` (flag off) | sem overflow; home igual: [`screenshots/round7/`](screenshots/round7/) (o renderer público só ganhou o `srcset` de uploads, inerte sem upload publicado) |

**Não testado (só o Railway real prova):** login com uma conta Railway de verdade (formato real do ID token e `email_verified`), S3 do bucket real (SigV4 bate com o vetor da AWS; o endereçamento virtual-hosted foi coberto por teste de URL/host assinado, não contra o serviço), proxy do Railway (`Host`/`Origin`), egress e latência do `/media`.

## 4. Riscos relevantes

1. **`main` avançou** (3 commits de `feature/cart-mirror-consumer`: `4ba96c4`, `f811426`, `af830bf`) e a branch do CMS não os contém. Vai ser preciso integrar (merge/rebase) antes de um deploy; não fiz por não estar autorizado. As áreas tocadas por cart-mirror e pelo CMS são diferentes, mas a suíte completa deve rodar depois da integração.
2. **Primeiro uso real do Login with Railway e do bucket** é a maior incerteza (seção 2). Mitigação: `cms:check`, publicação com a flag desligada, admin privado antes da home.
3. **E-mail verificado**: se o Railway não o informar, o fluxo por `ADMIN_OWNER_RAILWAY_SUB` resolve para o owner; editores precisam de e-mail verificado (ou o owner cadastra e eles entram depois que o e-mail for verificado no Railway).
4. **Egress do serviço**: `/media` passa pelo serviço; sem CDN. Arquivos pequenos e cache de um ano no navegador; medir com tráfego real.
5. **`/api/cidades/*` responde também no host do admin** (desvio conhecido da Rodada 6, dados públicos somente leitura).
6. **Backup do Postgres**: não verificado no plano atual; o runbook manda comprovar e fazer um dump manual antes da primeira migração.
7. O ID token do Railway é ES256; se um dia o Railway trocar de algoritmo, o login falha de forma segura (recusa) até ajustarmos a lista de algoritmos.

## 5. Ações exatas do proprietário (Parte B), em ordem

Sem enviar segredos no chat: valores vão direto no painel do Railway.

1. Informar (por variável, não no repositório) o e-mail do owner → `ADMIN_OWNER_EMAIL`. Editores, se houver, precisam de conta Railway.
2. Aprovar custo e criar **um PostgreSQL** no projeto; `DATABASE_URL` por referência. Comprovar backup no painel.
3. Aprovar custo (US$ 0,015/GB-mês, documentado) e criar **um Storage Bucket**; referenciar `BUCKET_ENDPOINT`, `BUCKET_NAME`, `BUCKET_ACCESS_KEY_ID`, `BUCKET_SECRET_ACCESS_KEY`, `BUCKET_REGION`.
4. Criar/ajustar a **OAuth App** (Settings → Developer) com redirect `https://www.useorigens.com.br/admin/auth/callback`; Client ID/Secret → `RAILWAY_OAUTH_CLIENT_ID`, `RAILWAY_OAUTH_CLIENT_SECRET`.
5. ~~Custom domain do admin~~ (abandonado: ver Rodada 7b).
6. `ADMIN_SESSION_SECRET` (gerado por você) e `ADMIN_HOST=www.useorigens.com.br`.
7. Então, com a minha ajuda: `railway run npm run db:status` → `db:migrate` → `cms:check`; e os testes de ponta a ponta reais (login owner, editor negado em outra região, upload, seção, prévia, publicar/restaurar, coleções internas, tracking inalterado).
8. Só depois: autorizar push/deploy (admin operacional primeiro, home ainda na configuração atual), depois `SITE_CONFIG_HOME=on` em separado, depois (opcional) IDs de tracking regionais.

## 6. Rollout e rollback

Tabela completa no runbook (seção 4). Ordem: infraestrutura → admin privado → publicação piloto com a flag off → home → tracking regional. Rollback do mais rápido ao mais lento: desligar `SITE_CONFIG_HOME` → Restaurar versão → remover `ADMIN_HOST` → rollback do deploy. A release opcional dos banners WebP (`150db18`) segue separável (cherry-pick com um conflito trivial) e **não** foi feita.

## 7. Commits locais

Ver `git log` na branch. Ficaram fora: `docs/design/lighthouse/`, `docs/screenshots/`, snapshots locais, `data/admin-dev`, `.env*`.

---

# Rodada 7b: painel em `/admin` no host `www` (mesmo serviço, sem DNS novo)

Decisão do proprietário: abandonar `admin.useorigens.com.br` (o limite de dois domínios já foi atingido). O painel passa a viver em **`https://www.useorigens.com.br/admin`**, no mesmo serviço da loja. Sem wildcard, sem outro serviço, sem alteração de DNS.

- **Integração:** `origin/main` já continha as Rodadas 1–6 (PR #1, com `150db18`), o cart-mirror e os eventos de tracking (PR #2). Fiz `git merge origin/main` na branch (sem conflito); nenhuma funcionalidade publicada foi perdida (a suíte completa da loja passou depois da integração).
- **Roteamento (`routing.ts` + `proxy.ts`):** só caminhos `/admin/**` são tratados. No `ADMIN_HOST` passam com `noindex` e `no-store` (sem gate de catálogo); **todo o resto é a loja, intocado** (o teste compara status e cabeçalhos das rotas públicas no host do admin e em outro host). Em qualquer outro host `/admin/**` é 404. `useorigens.com.br/admin/...` redireciona 307 para `www` (caminho e consulta mantidos); o restante do domínio raiz não muda.
- **Cookies:** como o painel divide o host com a loja, a sessão (`__Secure-uo_admin`) tem `Path=/admin` e o estado do login (`__Secure-uo_oidc`) `Path=/admin/auth`; ambos `Secure`, `HttpOnly`, `SameSite=Lax`, sem `Domain`. Teste E2E prova que uma requisição a `/sul` no mesmo host **não** leva o cookie. (`__Host-` foi abandonado: exige `Path=/`.)
- **Origin/Host:** mutations exigem `Origin = https://www.useorigens.com.br`; o redirect do OAuth é montado a partir de `ADMIN_HOST`, nunca do `Host` recebido. `/media/...` (pública, só publicados) e `/admin/media/...` (autenticada) coexistem sem conflito.
- **Callback:** exatamente `https://www.useorigens.com.br/admin/auth/callback`. Redirecionamentos raiz↔`www` não interferem: o login sempre começa e termina em `www`.
- **CLI de banco:** `npm run db:status|db:migrate` agora é Node puro + `pg` (`db/db-cli.mjs`), para rodar **dentro** do serviço (`railway ssh`), já que o Postgres do Railway não tem endereço público. O código do runner é o mesmo que os testes exercitam.
- **S3:** o cliente tenta a região configurada (`iad`, que é o que o Railway mostra) e, se o bucket recusar (403), repete uma vez com `auto` e memoriza o que funcionar.
- **Estado real do Railway** (verificado só por nomes/flags, sem valores): ver seção 3 do runbook. Pendências: `ADMIN_HOST` ainda aponta para `admin.`; `ADMIN_SESSION_SECRET` tem < 32 caracteres (o painel ficaria desligado); conferir o callback no OAuth App.

## Verificações da 7b

| Verificação (depois de integrar `origin/main`) | Resultado |
|---|---|
| `tsc`, ESLint | limpo (2 avisos antigos em `db/validate-migrations.mjs`) |
| Vitest (unitários + integração em Postgres real, incluindo cart-mirror e tracking do `main`) | **493 testes**, 29 arquivos |
| Roteamento (`/admin` no host `www`, raiz → `www`, outros hosts 404, loja intocada) | 10 testes unitários novos |
| Build de produção sem serviços, flags off | ok |
| E2E do admin em modo produção (Postgres real via rede, OIDC Railway falso, bucket privado falso) | **8/8**, agora no mesmo host da loja: login, permissões por região, upload, prévia, publicar/restaurar, `/media`, cookie `Path=/admin` que **não** acompanha requisições públicas, rotas públicas idênticas no host do admin e em outro host |
| E2E do admin em modo dev | **3/3** |
| Smoke de produção (inclui loja intacta no mesmo host com configuração parcial do admin) | passou |
| E2E da loja (Playwright, uma passagem, com cart-mirror e eventos de tracking) | **143/143** |
| `verify:prerender` e `verify:bootstrap` (build limpo) | passaram |
| CLI `db-cli.mjs` sobre o protocolo real do Postgres (status → migrate → migrate → status) | ok (idempotente) |
