# CMS V1 — Rodada 2: contratos, seed, renderer atrás de flag e provas

- Status: **entregue para revisão**. Continuação de [`cms-v1-plan.md`](cms-v1-plan.md), com as decisões D1–D8 aprovadas.
- Branch: `feature/storefront-admin` (a partir de `main` = `origin/main` = `678c26a`). Nada foi commitado, empurrado ou implantado.
- **Não criado**: Postgres, bucket R2, domínio admin, credenciais OIDC. **Não alterado**: tracking em produção, `proxy.ts`, `layout.tsx`, busca, catálogo, o snapshot do Volume.

## 1. Ajuste de sequência em relação às etapas S1–S4 do plano

O plano original previa S3 (tracking por props) e S4 (leitor de `published.json`). Esta rodada autorizou só código sem infraestrutura e **sem migrar o tracking**. Ajuste:

| Etapa original | Esta rodada | Motivo |
|---|---|---|
| S1 contratos + seed | **feito** (`src/lib/site-config/{schema,resolve,seed,checksum}.ts`) | — |
| S2 home por config | **feito, atrás de `SITE_CONFIG_HOME=on` (desligada)** | — |
| S3 tracking por props | **só a regra pura** (`resolveTracking`, testada). `MetaPixel`/`GoogleAnalytics`/`layout.tsx` **intocados** | "Não migrar o tracking da produção" |
| S4 leitor do arquivo publicado | **só o desenho** + protocolo de publicação e reconciliação testados com injeção de falhas (`publish-flow.ts`) | o leitor real precisa do namespace no Volume e do publicador; a flag usa o seed |
| — | **novo**: decisão de rota admin/host como função pura testada (`src/lib/admin/routing.ts`), **sem ligar ao `proxy.ts`** | D4 pediu a verificação de precedência |
| — | **novo**: migração SQL validada num Postgres real em memória | D1 pediu esquema/migrações antes de provisionar |

O restante (S5 em diante) continua como no plano e depende dos recursos externos da §9.

## 2. Resultado da sondagem D6 (INK, somente leitura)

Endpoint e escopo conferidos antes na documentação (`developers.reserva.ink/llms-full.txt`): `GET /v1/stores/collections`, escopo `store.categories.read`, `per_page` padrão 5, máximo 100. O cliente do projeto (`src/lib/ink/client.ts`) só usa `/v1/stores/products`.

**Uma requisição por loja**, `?per_page=1&page=1`, token já configurado em `.env.local`, nada escrito na INK, sem sync completo, sem imprimir credencial nem payload (só formato e contagens):

| Loja | HTTP | Coleções (`total_count`) | Formato do item | `product_ids` da 1ª coleção | Desses, presentes no snapshot local |
|---|---|---|---|---|---|
| Sul | 200 | **176** | `id:int, name, slug, description, is_available:bool, position:int, product_ids:int[], kit_ids:int[], created_at, updated_at` | 103.653 | 9.521 |
| Norte | 200 | **22** | idem | 1.503 | 187 |
| Centro | 200 | **26** | idem | 11.589 | 1.146 |

Conclusões:

1. **O escopo `store.categories.read` existe nos três tokens.** A INK usa o nome *collections* no recurso e *categorias* na documentação: é a mesma coisa. Não há um segundo conceito "categoria" separado.
2. Cada coleção **pertence a uma loja** (o token define a loja). IDs e slugs são por loja; ids de coleção não são comparáveis entre lojas. Após a consolidação (plano de unir as lojas), os ids mudam. Por isso a fonte `ink-category` guarda `store` + `collectionId`.
3. O vínculo é **coleção → `product_ids`** (inteiros). O snapshot guarda `inkProductId` como string: o mapeamento é `String(id)`.
4. **`product_ids` inclui muito mais produtos do que o snapshot** (a 1ª coleção do Sul tem 103.653 ids contra 9.521 conhecidos). O snapshot só guarda produtos publicados e visíveis. **Sempre filtrar pelo snapshot**; nunca contar `product_ids.length` como "produtos da seção".
5. As coleções amostradas parecem ser de **lugar** ("Seu Lugar", "AC", "MT"), não das curadorias editoriais. Só uma coleção por loja foi lida; **não sei se "Da Nossa Terra", "Feito Para Você", "Do Nosso Jeito", "Fala Daqui" existem entre as 176 do Sul**. O plano marcava isso como verificação: continua **em aberto**.
6. Cada resposta com `per_page=100` pode carregar dezenas de milhares de ids por coleção (megabytes). O sync de coleções precisa de ritmo, limite de tamanho e tolerância a falha própria.
7. Sem cabeçalhos `X-RateLimit-*` na resposta. O ritmo de 1,5 s/req do cliente atual continua o critério.

**Consequência para a implementação (S9)**: o sync deve gravar, por loja, `collections: { id, name, slug, position, isAvailable, productIds }[]` já **filtrado para produtos do snapshot**, como campo aditivo em `StoreIndex` (o snapshot segue `version: 1`; snapshots antigos sem o campo continuam válidos). **Pedido de aprovação novo (§9-A)**: o sync completo de coleções precisa de ~2 requisições paginadas por loja no Sul (176/100) e 1 em Norte/Centro. Não foi feito aqui.

Interface preparada sem depender disso: a fonte `ink-category` já existe no contrato e o resolvedor devolve **`unavailable: "ink-collections-not-synced"`**; a seção se oculta, exatamente como um carrossel vazio hoje. Categorias nunca são deduzidas de nomes ou `tags` de produto.

## 3. Inventário das fontes atuais de dados da home (INK → seção)

Nada da home Sul usa coleções INK hoje. Cada seleção é **código editorial** sobre o snapshot:

| Seção (âncora) | Como escolhe produtos | Onde | Fragilidade |
|---|---|---|---|
| Hero (trio) | 3 famílias fixas em cidades fixas (`ponto-de-origem` Porto Alegre, `feito-em` Curitiba, `coordenadas` Joinville), resolvidas nos *bindings* | `editorial/sul.ts` `HERO_FAMILIES` | some se a cidade não tiver a família |
| `estilos` | cidade vitrine `SHOWCASE.sul.hero` (`sc/florianopolis`) → famílias existentes | `site.ts` | idem |
| `terra` | por **nome exato**: `<Estado> \| Clean/Minimal/Escritas/Atlas do Sul` e `<Gentílico> \| Essência` | `editorial/terra.ts` | renomear na INK quebra |
| `estados` | geografia + linha do estado (mesmo padrão de nome) + mesorregiões | `home.ts`, `state-lines.ts` | idem |
| `redesenhos` | **6 ids INK fixos** | `editorial/recreations.ts` | id removido some da seção; validação de marca pendente |
| `feito-para-voce` | **sufixo** `\| Lenda` no nome, ordenado por `totalSalesCount` | `editorial/lenda.ts` | ordena por vendas acumuladas sem período (interno, não rotulado) |
| `fala` | *Dizeres* + `lore` (expressões) com contexto editorial | `dizeres.ts`, `lore.ts` | contexto "PENDENTE DE VALIDAÇÃO" no código |
| `geografia` (DDD) | regex `<Região> \| 0xx` | `editorial/ddd.ts` | — |
| `origem` | 2 recortes de camiseta (`campaignCrops`) quando não há foto | `home.ts` | — |
| "Ver todos" | 4 URLs fixas `usesul.com.br/usesul/collections/<slug>` | `editorial/collections.ts` (verificadas à mão em 2026-09-21) | não derivadas do slug INK |

Limitações registradas: (a) `totalSalesCount` é acumulado e sem período, **não** há "mais vendidos" público; (b) `createdAt` não é persistido em `MerchProduct`, então "novidades" exigiria estender o índice; (c) a regra "URL da coleção = `<loja>/collections/<slug INK>`" foi vista em 4 casos e **não** está provada para as demais.

No seed, todas usam `source.kind = "editorial-module"`: o CMS reproduz a home atual **sem mudar a lógica de seleção**. `ink-category` e `manual` substituem isso depois, seção a seção, com aprovação editorial.

## 4. Contratos e seed

Arquivos novos (todos puros, sem dependência nova; sem `zod`):

- `src/lib/site-config/schema.ts`: tipos (`ScopeDoc`, `Section`, `Appearance`, `Source`, `Destination`, `PublishedBundle`) e validadores `validateScopeDoc` / `validateBundle`.
- `src/lib/site-config/resolve.ts`: `resolveTracking` (herda/sobrescreve **independente por fornecedor**, sem config → envs atuais) e `resolveBackground` (regra imagem/cor/gradiente **por breakpoint**).
- `src/lib/site-config/seed.ts`: `buildSeedBundle` gera a home Sul **a partir das mesmas fontes** do código (`REGION_BANNERS`, `REAL_COLLECTIONS`); determinístico e com checksum fixado em teste.
- `src/lib/site-config/checksum.ts`: JSON canônico + sha256 (mesma função para releases e detecção de divergência).
- `src/lib/site-config/sources.ts`: resolvedor de fontes (`editorial-module` ok; `ink-category` e `manual` explicitamente `unavailable`).
- `src/lib/site-config/flag.ts`: `SITE_CONFIG_HOME=on` (**desligada por padrão**) e `homeBundle()` (hoje só o seed).
- `src/components/home/HomeSections.tsx` + `src/components/banners/SectionBackdrop.tsx`: o renderer.

Ajustes em contratos em relação ao plano (`cms-v1-plan.md` §3.1), necessários para reproduzir o DOM atual:

- `Fill` ganhou `{kind:"none"}` (seções sem fundo continuam sem camada) e as cores aceitam **tokens nomeados** (`token:ground|region-primary|near-black`), que viram as mesmas classes estáticas do Tailwind; `#rrggbb` livre vira estilo inline.
- `Section.headingId` (o `id` do `<h2>` referenciado por `aria-labelledby`) e `analyticsSource` (lista fechada das cinco origens de `SOURCES`, **nunca string livre**, para não poluir Meta/GA4).
- `PublishedBundle.media`: a tabela de mídia **resolvida na publicação** (URL final + dimensões). A vitrine nunca precisa do banco nem do storage para renderizar.
- O seed mantém as imagens em `/public/banners/sul/*.png` (`assetId: "legacy:sul/hero-mobile"`); nada migra para o R2 no dia 1.

Mudanças de componentes existentes (todas **aditivas**, props opcionais com o valor atual como padrão; o caminho original não muda):

`RegionHero` (`copy`, `backdrop`), `Campaign` (`copy`, `backdrop`), `StateCards` (`title`), `ProductCarousel` (`viewAllLabel`), `RegionalPhotoSection` (`baseStyle`, `washStyle`, `wash="none"`), `src/app/[region]/page.tsx` (um `if` no topo, atrás da flag).

Regras do renderer verificadas por teste: hero e footer fixos; seção inativa não renderiza; seção sem produtos **ou com fonte indisponível** não renderiza (como hoje); só a primeira seção com imagem recebe `priority`; imagem ausente cai no `fill`; desktop **não** reutiliza mobile sem opt-in; mídia é sempre camada absoluta **dentro** da própria seção.

Validações (todas com teste): IDs Meta `^\d{10,20}$` e GA4 `^G-[A-Z0-9]{4,20}$` (mesmas regras de `env.ts`); destino `external` só `https` em host da allowlist; destino `route` só `/{região}[/{uf}[/{cidade}]]` sem `..`, esquema ou `//`; `alt` obrigatório salvo decorativa (e vazio se decorativa); sobreposição personalizada com opacidade ≤ 0,85; foco 0–100; âncoras únicas; hero primeiro, footer último; qualquer imagem referenciada deve existir na tabela de mídia; entrada não-objeto devolve erros, nunca lança.

## 4b. Prova de regressão visual e funcional

**Método** (`scripts/verify-home-equivalence.mts`): três builds de produção do mesmo snapshot INK local, três servidores: **A** = `main` (`678c26a`, intocado), **B** = esta branch com a flag desligada, **C** = esta branch com `SITE_CONFIG_HOME=on`. Compara A×B (a refatoração não alterou o caminho atual) e B×C (a home por config é igual à hard-coded). Sem tolerância de pixel: bytes idênticos ou o script reporta a contagem de pixels diferentes.

| Comparação | HTML SSR do `<body>` | DOM hidratado (375/390/768/1280/1920) | Links (138) | Sem overflow horizontal | Screenshot full-page, 5 larguras |
|---|---|---|---|---|---|
| A (`main`) × B (flag off) | idêntico (246.849 car.) | idêntico | idêntico | sim | **pixel-idêntico (0 px)** |
| B (off) × C (`on`) | idêntico (246.849 car.) | idêntico | idêntico | sim | **pixel-idêntico (0 px)** |

O que o script normaliza, e só isso: nomes de arquivo com hash em `/_next/static/` e os separadores `<!-- -->` que o React insere entre nós de texto.

**O que a prova encontrou (e foi corrigido, não mascarado).** Numa rodada intermediária B×C deu 51 / 178 / 19 pixels diferentes em 768 / 1280 / 1920 px, com DOM idêntico. Causa: o parágrafo "Do mapa às coordenadas… O exemplo aqui é {cidade} — …" saía como **um** nó de texto, enquanto o JSX original o divide em três; o navegador forma o texto por nó, então os glifos deslocavam frações de pixel. `CitySubtitle` agora renderiza os três nós como o original. Depois disso, 0 pixels. Isso também mostra que o teste **enxerga** uma diferença sub-pixel.

**Ajustes no próprio método de captura** (aplicam-se igual aos dois lados, não a tolerância): com o mesmo servidor comparado a ele mesmo o script já dava diferenças, por três causas de tempo, todas eliminadas: (1) imagens `loading=lazy` ainda sem decodificar → o script rola a página e espera `complete` + `decode()` de todas; (2) o estado ativo/inativo das setas dos carrosséis (Embla só remede após resize) → forço um resize e faço **duas** capturas, mantendo a segunda; (3) camadas de animação CSS promovidas ou não → congelo `animation`/`transition` na captura e uso `prefers-reduced-motion`. Verificação: main × main, três execuções, 0 pixel.

**Build sem Volume** (o cenário do bug já resolvido): `scripts/verify-prerender.mts` roda `next build` sem snapshot e depois `next start` com o snapshot montado. **ALL CHECKS PASSED** com `SITE_CONFIG_HOME=on` **e** com `off`: primeira requisição já mostra "715 cidades", card do hero com produto e preço reais, índice de busca com as 715 cidades (contém Tijucas), `/sul/sc/tijucas` com produto real; depois um novo sync (fixture) promove 1.191 cidades e a ISR de `/sul`, da privacidade e do índice é invalidada.

**Testes automatizados**: `vitest` 197 de 197 (12 arquivos; +52 desta rodada); `tsc --noEmit` e `eslint` limpos.

**Playwright (suíte e2e existente) — sinal inconclusivo neste ambiente, e é preciso dizer isso.** Rodando contra o build de produção, a suíte **já falha na `main` intocada**: 18 falhas / 75 passam. Com a flag ligada: 14 falhas / 79 passam, e **todas as 14 também falham na `main`** (subconjunto). Todas são `page.goto` com timeout de 60 s em páginas de **cidade** (`/sul/sc/tijucas`, `/sul/rs/torres`), rotas que esta rodada não toca; o padrão sugere rede para o CDN de imagens da INK/otimizador neste ambiente, não código. Não consegui isolar a causa. Portanto: **nenhuma regressão foi introduzida**, mas a suíte e2e **não** serve como prova positiva aqui. Os testes de tracking que passam, passam igual com a flag ligada.

**Claude in Chrome**: autorizado depois; tentei abrir a home nas duas versões no Chrome real, mas o renderer não respondeu (comandos `Runtime.evaluate` expiraram, também com a flag desligada, então não é da flag). Depois de 3 tentativas parei. Nenhuma verificação no Chrome real foi concluída. Não aceitei o banner de cookies: em produção os IDs de Meta/GA4 são reais e aceitar enviaria eventos reais.

## 5. Publicação: consistência Postgres ↔ arquivo no Volume

Não há transação entre os dois. O protocolo (implementado como lógica pura em `src/lib/site-config/publish-flow.ts`, com portas injetadas):

```
1  beginPublish  Postgres TX1: trava o head, compõe o bundle, insere release `pending`   (falha → nada foi escrito)
2  writeAtomic   Volume: escreve tmp + fsync + rename sobre published.json               (falha → release `failed`, arquivo antigo intacto)
3  markLive      Postgres TX2: release `live`, head aponta para ela
4  revalidate    revalidatePath só DEPOIS do passo 3 ter dado certo; depois marca `revalidated`
```

**Autoridade do conteúdo é o Postgres**; o arquivo é uma projeção. A única exceção é a janela entre 2 e 3, em que o arquivo é o que os visitantes já veem: ali a reconciliação **avança** (registra a release como `live`) em vez de reescrever a versão antiga por cima. Em qualquer outra divergência o arquivo é **reescrito a partir do head**.

Reconciliador (`reconcile`, idempotente; roda no boot, no `/admin` e em intervalo):

| Estado encontrado | Ação |
|---|---|
| arquivo == release `pending` (queda entre 2 e 3) | `promote-pending` + `revalidate` |
| `pending` recente, arquivo antigo | `wait` (uma publicação pode estar em andamento) |
| `pending` abandonado (> grace, 2 min) | `fail-pending`; o arquivo não é tocado |
| arquivo ausente, corrompido, **antigo** (Volume restaurado de backup) ou **adulterado** (checksum ≠) | `rewrite-file-from-head` + `revalidate` |
| head consistente, cache nunca invalidado (queda entre 3 e 4) | só `revalidate` |
| só o seed existe (sem release) | nada; o seed é o fallback |

Fora da janela de reconciliação, a vitrine **nunca depende disso**: valida o arquivo, mantém a última config válida em memória e cai no seed.

Testes com injeção de falha (`tests/unit/publish-flow.test.ts`, 18 casos): falha do banco antes de escrever; falha do arquivo **antes** do rename (nada muda, release `failed`); erro **depois** do rename (o arquivo é conferido e a publicação continua, não vira "falha"); falha do arquivo + falha ao marcar `failed` (fica `pending` e a reconciliação falha); falha na promoção (`file-live-db-pending`, **sem** invalidar cache); falha do `revalidate` (`published-cache-stale`); e uma matriz que, para **cada ponto de queda**, aplica o reconciliador e exige **um único release coerente** (arquivo = head = o que o cache serve, nada `pending`), idempotente.

No banco, o protocolo é reforçado por constraints (§6): no máximo **uma** publicação em andamento (índice único parcial), head só aponta para release `live`, conteúdo de release imutável, sem `DELETE`.

Backups (exigência 3): **Postgres** (dump agendado + o backup nativo do provedor, a confirmar), **Volume** (`published.json` + `published.prev.json` + `releases/<id>.json` das últimas 20, em `<mount>/site-config/`, **separado** de `catalog-snapshot.json`), **R2** (objetos endereçados por hash, nunca apagados enquanto uma release recente os referencia; originais privados são o backup das variantes). O R2 não tem versionamento de objeto que eu possa afirmar sem verificar: por isso a regra "não apagar referenciado" é do app, e uma cópia para segundo bucket fica como decisão (§9).

## 6. Esquema e migrações propostos

`docs/admin/migrations/0001_init.up.sql` e `.down.sql` (PostgreSQL 15+, **não aplicados em lugar nenhum**). Tabelas: `admin_user`, `admin_session`, `release`, `release_head`, `config_draft`, `media_asset`, `audit_log`, `schema_migration`.

Decisões de desenho:

- `admin_user.scopes` **não aceita `global`**: configuração global, tracking e permissões são do `owner` (D7). Editor sem região é rejeitado. E-mail em minúsculas (allowlist exata).
- `admin_session` guarda só o **sha256** do token do cookie.
- `release` é **imutável** (trigger) e **append-only**; `status ∈ {pending, live, failed}`; índice único parcial garante **uma publicação em andamento**; `release_head` (singleton) só aceita release `live` (trigger).
- `config_draft.rev` = trava otimista (`update … where scope=$1 and rev=$2`; 0 linhas ⇒ 409).
- `media_asset`: PNG/JPEG/WebP, ≤ 8 MB, ≤ 6000 px, `sha256` único, `public_path` sem `..`, upload exige `original_key`.
- `audit_log` **append-only** (trigger), ações numa lista fechada, sem segredo.

**Validação** com PGlite (Postgres real em WASM, em memória; nada instalado no projeto): `docs/admin/migrations/validate-pglite.mjs` — up → down → up (repetível) e **39 verificações**, cada uma conferida pelo **motivo** da rejeição (constraint/trigger esperado), não só por "falhou": editor sem região, editor `global`, região inexistente, e-mail em maiúsculas, token em claro, 2ª publicação em andamento, head para release pendente, edição de bundle/checksum, promoção sem `promoted_at`, mudança de status de release `live`, `DELETE` de release, release `failed` sem motivo, trava otimista (aceita `rev` atual, rejeita antigo), SVG, > 8 MB, > 6000 px, path traversal, mídia duplicada, edição/remoção do audit log. Resultado: **ALL CHECKS PASSED**.

## 7. Autenticação (Google OIDC) e roteamento por host — desenho

Sem credenciais criadas. Tudo abaixo é desenho; **falha fechada**: admin só existe se `ADMIN_HOST`, `DATABASE_URL`, `OIDC_GOOGLE_CLIENT_ID`, `OIDC_GOOGLE_CLIENT_SECRET` e `ADMIN_SESSION_SECRET` estiverem definidos. Faltando qualquer um, `/admin` é 404 em todos os hosts e a vitrine não muda.

**Fluxo** (Authorization Code + PKCE): `GET /login` no host admin → gera `state`, `nonce`, `code_verifier` → cookie curto assinado (`HttpOnly; Secure; SameSite=Lax; Path=/admin/auth`) → redireciona ao Google (`openid email`) → `GET /auth/callback` valida `state`, troca o `code`, **verifica o ID token** (assinatura via JWKS do Google, `iss`, `aud` = client id, `exp`, `nonce`, **`email_verified === true`**) → procura `admin_user` ativo por e-mail em minúsculas. E-mail fora da allowlist ⇒ resposta genérica (sem revelar se existe) e `audit_log`. Sessão: 256 bits aleatórios, cookie `__Host-` (`Secure; HttpOnly; SameSite=Lax; Path=/`), armazenado como sha256, ociosidade 8 h, absoluto 24 h, rotação no login, logout apaga.

**Bootstrap do primeiro owner**: `ADMIN_BOOTSTRAP_OWNER_EMAIL` (uma única variável). Só vale enquanto **não existe nenhum `owner`**; o primeiro login OIDC com esse e-mail *verificado* cria o owner. Depois é ignorada. Sem a variável, ninguém entra. **Nenhum e-mail é inventado ou hardcoded.**

**Autorização** (na DAL, em **toda** Server Action e route handler; o `proxy.ts` só faz redirect otimista, como manda o guia de autenticação do Next 16): `requireSession()`, `requireScope(scope)` (editor só nas regiões atribuídas), `requireOwner()` (tracking, global, usuários, rollback, sync). Um editor **nunca** altera `admin_user`; um owner não rebaixa/desativa o último owner. Mutação só por `POST`; Server Actions com verificação de origem do Next, mais `SameSite=Lax` e token CSRF por sessão nos route handlers. Rate limit em login e upload (em memória; instância única). Erros sem stack nem SQL. `INK_TOKEN_*`, `ADMIN_SYNC_TOKEN`, `DATABASE_URL`, credenciais R2 e do OIDC só existem no servidor; um teste deve varrer o bundle do cliente por esses nomes.

**Roteamento por host** (`src/lib/admin/routing.ts`, testado, **não ligado** ao `proxy.ts`), precedência da mais alta à mais baixa:

1. `/api/health` e `/api/ready` respondem em **qualquer** host, sem gate e sem rewrite.
2. Estáticos (`/_next/*`, favicon, robots, sitemap) passam em qualquer host.
3. **Host admin**: só rotas admin. O caminho é reescrito para `/admin/…`; caminho `/admin…`, `..`, `//` e `/api/*` são **404**; storefront não existe ali; o **gate de catálogo nunca se aplica** (o admin precisa funcionar justamente sem catálogo); toda resposta com `X-Robots-Tag: noindex, nofollow` e `Cache-Control: no-store`. Login e callback OIDC vivem neste host.
4. **Outro host**: `/admin/**` é **404**. O resto é a vitrine, com o comportamento atual.
`/api/admin/catalog-sync` (Bearer, máquina a máquina) é rota existente e não muda.

**Observação sobre o `proxy.ts` atual**: o matcher **exclui `/api`** e cobre todo o resto, portanto hoje `/admin` cairia no 503 do gate e receberia `noindex` só por host. Isso é o que a integração vai mudar (chamar `decideRoute` primeiro). Como `/api/*` não passa pelo proxy, as rotas admin ficam **fora de `/api`** (`/admin/...`, incl. o callback) e checam o host também na DAL (defesa em profundidade). Meta/GA4 **nunca** são montados no admin nem no preview: o preview usa uma rota própria, sem `MetaPixel`/`GoogleAnalytics`.

Variáveis previstas (nenhuma criada agora): `ADMIN_HOST`, `DATABASE_URL` (referência privada do Railway), `OIDC_GOOGLE_CLIENT_ID`, `OIDC_GOOGLE_CLIENT_SECRET`, `ADMIN_SESSION_SECRET`, `ADMIN_BOOTSTRAP_OWNER_EMAIL`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `MEDIA_PUBLIC_BASE_URL`, `SITE_CONFIG_HOME` (flag), `SITE_CONFIG_DIR` (padrão `<mount>/site-config`).

## 8. Mídia (R2) — desenho e requisitos de verificação

- Domínio: `media.useorigens.com.br`. **A zona no Cloudflare foi informada como ativa, mas não foi conferida nesta rodada** (D2 exige conferir o estado atual antes de criar bucket ou vincular domínio; conferir zona, conta e plano é o **primeiro passo** da etapa S8, e nada foi criado).
- Upload **mediado pelo servidor**, não por URL assinada direta: uma URL assinada de escrita não permite impor tipo, tamanho e dimensões *antes* de o objeto existir; o app recebe (≤ 8 MB), confere magic bytes, decodifica com `sharp` (declarar como dependência), limita dimensão, remove metadados, gera variantes WebP e só então grava no R2 e marca `ready`. (Confirmar na documentação do R2, na S8, se há alternativa com condições impostas.)
- Chave versionada por conteúdo: `media/<sha256>/<largura>.webp`; `Cache-Control: public, max-age=31536000, immutable`. Substituir imagem = novo hash + nova publicação; **publicar nunca apaga** imagens de releases que ainda podem sofrer rollback.
- `next/image` continua como otimizador; o host da mídia entra em `images.remotePatterns` na S8.
- Falha de imagem: cai no `fill` configurado, nunca oculta texto nem produtos (regra §6.1 do plano, coberta por teste do resolvedor). Contraste com e sem banner: aviso no editor com `avg_luminance` (estimativa, não garantia).

## 9. O que ainda depende de recursos externos e o que preciso da sua aprovação

Nada abaixo foi feito.

**A. Aprovações operacionais** (uma por item, no momento apropriado):

| # | Ação | Pré-condição a conferir primeiro |
|---|---|---|
| 1 | Provisionar **Postgres** no Railway (conexão privada `DATABASE_URL`) | conferir custo corrente; revisar `0001_init.up.sql` |
| 2 | Criar **bucket R2**, tokens de API e o domínio `media.useorigens.com.br` | conferir no Cloudflare que zona e conta estão ativas e o plano/custo atual |
| 3 | Criar **credenciais OIDC** (cliente OAuth Google, URI `https://admin.useorigens.com.br/auth/callback`) | 1º owner definido |
| 4 | Criar domínio e **DNS** `admin.useorigens.com.br` no serviço existente | Postgres e OIDC prontos |
| 5 | **Sync de coleções INK** (S9): ~2 requisições paginadas no Sul, 1 em Norte e 1 em Centro, somente leitura | listar as 176 coleções do Sul para achar as editoriais |
| 6 | Ligar `SITE_CONFIG_HOME=on` em produção | prova de equivalência re-executada no snapshot de produção |
| 7 | Migrar tracking para o resolvedor (S3 do plano) | fica **por último**, com o Sul `override` = IDs atuais |

**B. Dados que só você pode fornecer:** e-mail do primeiro `owner`; e-mails dos editores e a matriz região × pessoa; se as coleções editoriais devem sair de categorias INK ou continuar como curadoria por código; cópia (segundo bucket) das imagens R2.

**C. Confirmações pendentes que não consegui fazer:** custos correntes (a estimativa de US$ 2–6/mês do plano **não é orçamento aprovado**); o backup nativo do Postgres no Railway; comportamento exato de upload no R2.

## 10. Como reproduzir

```bash
npx vitest run                                   # 197 testes (inclui site-config, publish-flow, admin-routing)
npx tsc --noEmit && npx eslint src tests scripts
# Equivalência (dois servidores de produção, mesmo snapshot; a flag é a única diferença):
npx tsx scripts/verify-home-equivalence.mts http://localhost:A http://localhost:B /sul /tmp/out
# Migração:
PGLITE_PATH=…/pglite/dist/index.js node docs/admin/migrations/validate-pglite.mjs
```
