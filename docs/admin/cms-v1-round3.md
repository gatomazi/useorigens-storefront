# CMS V1 — Rodada 3: coleções INK, confiabilidade E2E e próximo gate

- Status: **entregue para revisão**. Continua [`cms-v1-round2.md`](cms-v1-round2.md); inventário completo em [`ink-collections-inventory.md`](ink-collections-inventory.md).
- Branch: `feature/storefront-admin`. `main` e `origin/main` seguem em `678c26a`. **Nada foi adicionado ao índice, commitado, empurrado ou implantado.**
- **Não criado**: Postgres, bucket R2, domínio admin, credenciais OIDC. **Não alterado**: home publicada, IDs de rastreamento, regras de consentimento, `proxy.ts`, `layout.tsx`, o catálogo e o snapshot. `SITE_CONFIG_HOME` continua desligada.

## 1. Coleções INK

### 1.1 Enumeração (D6, somente GET)

**4 requisições adicionais, exatamente o orçamento**: Norte 1 página, Centro-Oeste 1 página, Sul 2 páginas. Nenhuma falhou, nenhuma repetiu, nenhum 429. `per_page=100` foi aceito e `total_pages`/`total_count` guiaram a paginação. **Enumeração completa: 224 coleções** (Sul 176, Norte 22, Centro-Oeste 26), ≈ 5,3 MiB em ≈ 16 s de rede. Detalhes, método e lista completa: [`ink-collections-inventory.md`](ink-collections-inventory.md). O que importa:

- **As coleções editoriais do Sul existem**: `Da Nossa Terra` (152188, 73 produtos merch casam com o snapshot), `Feito Para Você` (152191, 21), `Do Nosso Jeito` (152187, 32; é o "Redesenhos" da home), `Fala Daqui` (152079, 55). **Não existe coleção "Lenda"** (a linha Lenda **é** `Feito Para Você`, 21 de 21) **nem coleção DDD** (17 de 17 produtos DDD estão dentro de `Fala Daqui`).
- **163 das 176 coleções do Sul não aparecem na loja** (`is_available=false`, segmentações internas como `SUL - RS`, `ZZ - CO - …`). Só 13 são públicas.
- **A contagem bruta engana**: a coleção `Seu Lugar` reporta 103.653 ids e só 9.521 existem no snapshot; `product_ids` inclui produtos ocultos e não publicados. A contagem útil é a **interseção com o snapshot**.
- **A home atual é um subconjunto curado das coleções**, não a coleção: Da Nossa Terra mostra 6 dos 73; Redesenhos mostra 6 ids fixos dos quais **5** estão em `Do Nosso Jeito` e 1 em `Da Nossa Terra`. Logo `ink-category` com `limit: 6` **não** reproduz a home de hoje; o seed continua em `editorial-module`.
- Verificado também: o **slug da INK é o slug da URL pública** (`https://www.<loja>.com.br/<loja>/collections/<slug>` → 200 nos 4 slugs editoriais do Sul, em `fala-de-onde` (Norte) e `lenda-do-centro` (Centro); slug inexistente → 404). Foram 3 GETs à vitrine pública, não à API.

### 1.2 Decisão técnica: disponibilidade de `ink-category` e `ink-collection`

| | Decisão |
|---|---|
| Viabilidade da sincronização | **Viável**: ~4 requisições, ~16 s, arquivo estimado em **≈ 43 KB** (Sul 32 KB, Norte 5 KB, Centro 6 KB), contra os ~4 min do sync do catálogo, que **não é tocado** |
| `ink-category` (fonte de seção) | Disponível **só** com o arquivo de coleções sincronizado, e só para coleções que estejam no snapshot da loja, sejam `is_available` e tenham produtos no catálogo. **`usable`** a partir de 3 produtos (piso do carrossel) |
| `ink-collection` (destino/CTA) | Disponível para Sul, Norte e Centro (padrão de URL verificado); **`use-origens` não** (sem padrão verificado) |
| **Fallback (estado de produção hoje: sem arquivo)** | `ink-category` = "indisponível", **a seção some** como um carrossel vazio; `ink-collection` sem slug = sem link; **nada muda no site** |
| Fonte `manual` | continua indisponível (fora do escopo) |
| Ordem dos itens | a da INK, preservada como veio (não numérica, sem semântica documentada); **não** rotular como "mais vendidos" nem "mais recentes" |

### 1.3 Implementação (só na branch, com testes)

**Representação isolada do catálogo**: arquivo próprio `collections-snapshot.json`, ao lado de `catalog-snapshot.json`. **O formato do catálogo não muda**, então **não há migração de schema** e o plano de rollback é apagar o arquivo.

| Arquivo | Papel |
|---|---|
| `src/lib/catalog/collections.ts` | tipos (`CollectionRecord`, `StoreCollections`, chave = loja + id), validação de página da API, casamento de ids **só com o índice da mesma loja**, ordenação determinística, guarda de promoção, igualdade sem timestamps |
| `src/lib/ink/collections-client.ts` | leitor paginado **somente GET**, ritmo 1,5 s, *back-off* em 429, corpo lido em stream e recusado acima de 40 MiB, teto de 10 páginas, `Authorization` só no cabeçalho |
| `src/lib/catalog/collections-file.ts` | leitura tolerante (ausente/corrompida ⇒ vazio, nunca lança), escrita atômica, cache por mtime |
| `src/lib/catalog/collections-sync.ts` | sync manual: último-bom por loja, idempotente (conteúdo igual não reescreve), pula loja sem catálogo |
| `src/lib/catalog/collection-source.ts` | o que o CMS pode oferecer (`availableCategories`) e resolução da coleção em itens do carrossel (só produtos da **mesma loja**, só hosts de compra permitidos) |
| `src/lib/site-config/sources.ts` | `resolveSource` aceita o *lookup*; motivos explícitos de indisponibilidade; `collectionUrl`/`destinationHref` |
| `scripts/sync-collections.mts` + `npm run collections:sync` | execução **manual**; **não foi executada** contra a INK (as requisições autorizadas se esgotaram na enumeração) |
| `scripts/inventory-ink-collections.mts` | o script da enumeração (1 GET por execução, sem retry, agrega e descarta os ids brutos) |

Garantias verificadas por teste (37 casos novos em `tests/unit/collections.test.ts`): ids fantasmas nunca viram produto; ids de outra loja não casam nem vazam; ocultas guardam contagem, não produtos; 13 formas malformadas de resposta são rejeitadas; paginação em duas páginas, página trocada, id duplicado entre páginas, 429 com *back-off*, 429 persistente, 403 (escopo), loja sem token (nenhuma requisição), teto de páginas, corpo acima do teto; promoção recusada para resultado parcial, em branco ou com queda > 50 %; sync idempotente (mtime intocado), último-bom preservado após falha, catálogo **byte a byte** intacto.

**Compatibilidade com o estado atual**: sem arquivo, com arquivo corrompido, de versão errada ou de loja desconhecida, tudo cai em "vazio". O smoke (§2.5) confirma no servidor real que a home renderiza igual com o arquivo ausente, corrompido, vazio ou válido. **Nada é sincronizado automaticamente e nenhuma categoria nova aparece na home pública**: o seed não referencia coleções e a flag segue desligada.

## 2. E2E: diagnóstico reprodutível

### 2.1 Ambiente

macOS (Darwin 24.6), **8 CPUs, 16 GiB**, Node 26.7.0, Next.js 16.3.5, Playwright 1.63.0 (Chromium). Comando: `npx playwright test --workers=2 --reporter=line` (suíte e config **inalterados**), contra `next build` + `next start -p 3100` em processos isolados, cache do otimizador de imagens apagado antes de cada rodada, mesmo snapshot INK local (2026-09-21). Timeout padrão de 60 s por teste.

**Achado sobre o ambiente**: durante a Rodada 2 e o começo desta, a máquina esteve com *load average* **140–340 em 8 CPUs**, causado por processos de **outros projetos** (`oria`, testes de painel) e por um Chrome a 100 %. Isso contaminou o que a Rodada 2 reportou e explica o travamento do Chrome real. A carga caiu para 10–30 durante a maior parte desta rodada e as medições abaixo foram feitas depois disso.

### 2.2 Resultado: duas causas, nenhuma em código de produção desta branch

| Sessão | Condições | `main` intocada | branch, flag off | branch, flag on |
|---|---|---|---|---|
| A (carga 140–340 → 20) | uma rodada cada | 18 F · 10,3 min / 5 F · 3,5 min | 14 F · 7,8 min | 14 F · 7,7 min / 1 F · 1,2 min |
| B (carga 12–33) | 2 rodadas cada, alternadas | 14 F · 7,5 min / 14 F · 7,6 min | 1 F · 1,6 min / 16 F · 9,6 min | 16 F · 9,6 min / 1 F · 44 s |
| C (rastreada, `main`) | 3 rodadas | 1 F · 47 s / 1 F · 51 s / **14 F · 4,4 min** | — | — |
| D (**cache de imagens pré-aquecido**) | 6 rodadas, `main` | **1, 1, 1, 3, 1, 1 falhas · ~1 min cada · 0 timeouts em massa** | — | — |

(F = testes com falha de 93. Todos os números são do log de cada rodada.)

O comportamento é **bimodal e independe do código**: a **mesma** build (`main`) alterna entre ~1 min com 1 falha e ~7,5 min com 14 falhas; a branch faz o mesmo, com a flag ligada ou desligada. Não correlaciona com o *load average* (rodadas lentas com carga 12–21).

#### Causa A: 14 falhas em massa = travamento do otimizador de imagens do Next.js (bug reproduzível, presente na `main`)

- **Sintoma**: todas as falhas em massa são `page.goto` com timeout de 60 s **em páginas de cidade** (`/sul/sc/tijucas`, `/sul/rs/torres`, `/sul/pr/pato-branco`), sempre os mesmos 14 testes; a home passa.
- **Evidência direta**: no *trace* de um teste falho da rodada C3, **28 requisições, 27 terminaram em < 150 ms, e uma nunca terminou**: `GET /_next/image?url=%2Fbanners%2Fsul%2Fcity-desktop.png&w=1920&q=80`, o banner local que **toda página de cidade** usa. `waitUntil: "load"` espera essa imagem para sempre.
- **Reprodução mínima** (`scripts/repro-image-optimizer-hang.mts`, sem INK e sem rede): num servidor de produção, para uma imagem ainda **fria** (chave de cache nova), uma requisição é **abortada pelo cliente** após 100–300 ms enquanto 3 outras do **mesmo** URL já esperam. Em ~metade das tentativas (4 de 8; 1 de 1 na verificação de persistência) **as outras três nunca respondem** e **qualquer requisição posterior a esse URL também não** (testado por 90 s) **até o processo reiniciar**. Outros URLs seguem normais. Feito na `main` **intocada**.
- **Por que aparece na suíte**: `infra.spec.ts` carrega páginas de cidade com `waitUntil: "domcontentloaded"` e termina o teste, **abortando** as imagens em voo; o resto da suíte então usa o mesmo URL do banner. É uma corrida: às vezes o envenenamento acontece, às vezes não. Suíte só do `sul.spec.ts` (sem esses testes): **41/41 em 4 de 4 rodadas**.
- **Prova causal**: com as imagens locais das páginas **aquecidas em série antes** da suíte (90 URLs, sem aborto), a suíte completa rodou **6 vezes seguidas sem nenhum timeout em massa** (0 de 6), contra 8 rodadas em 14 sem pré-aquecimento (a `main` mostrou o problema 4 vezes em 7; a branch, 2 de 3 com a flag desligada e 2 de 4 com ela ligada).
- **Mecanismo (consistente com o código, não provado)**: em `next-server.js` (~l.213) o gerador do cache de imagem fecha sobre o `req/res` do **primeiro** solicitante, e o `ResponseCache` junta as chamadas simultâneas na mesma promessa; se o primeiro cliente aborta, os seguidores ficam esperando uma promessa que não resolve. Não abri issue no Next.js.
- **Isto não é da CMS e não foi introduzido por esta branch**, mas **pode afetar produção**: o cache de imagens fica em `.next/cache` (efêmero a cada deploy no Railway); logo, depois de cada deploy há uma janela de cache frio em que um visitante que sai da página cedo, junto com outros pedindo o mesmo banner, pode deixar aquele URL sem resposta até a próxima reinicialização. **Não verifiquei em produção** (não toquei nela). Mitigações possíveis, **nenhuma aplicada**: pré-aquecer as imagens locais conhecidas no start, servir os banners já dimensionados sem o otimizador (`unoptimized`), atualizar o Next quando houver correção, ou reportar o bug. Está na lista de decisões (§5).
- **Correção do que a Rodada 2 disse**: lá a hipótese era "rede para o CDN de imagens da INK/otimizador". A causa é o travamento do otimizador **em imagem local**, não a rede da INK (o CDN respondeu em ~0,17 s em todas as sondagens).

#### Causa B: falhas isoladas (1–3 por rodada) = clique antes da hidratação (corrida dos testes)

Aparecem com **todas** as builds, também nas rodadas rápidas e sem carga, e **mudam de teste a cada rodada**: `infra.spec.ts:70` (o `combobox` da busca nunca abre), `tracking-and-nav.spec.ts:135` e `:319` (clicar em *Rejeitar* e o banner de cookies continua visível), `:436`, `:499`, `:555` (dropdown do cabeçalho). Rodando os 5 testes **em série**, 3 vezes cada, na `main`: **15 de 15 passam**. Os testes clicam logo após `domcontentloaded`; um clique antes de o React hidratar é ignorado (o `sul.spec.ts` já contorna isso com `openHeroSearch`, que fecha e reabre; estes não). É uma fragilidade **dos testes** e uma propriedade normal de SSR + hidratação. **Não alterei nenhum teste**: se a intenção é uma suíte determinística, a correção é esperar a hidratação, decisão sua (§5). Não confirmei pelo trace, teste a teste, que cada falha é essa corrida; a evidência é o padrão (mesmo teste passa em série, falha sob 2 workers, com `main` e branch igualmente).

### 2.3 Custo do carregamento de página de cidade, `main` × branch (mesmas condições)

`scripts/diagnose-page-load.mts`, `/sul/sc/tijucas`, servidor novo e cache frio a cada iteração, **5 iterações alternadas**, imagens habilitadas, carga 8–19:

| | `load` (ms) |
|---|---|
| `main` | 780, 655, 705, 698, 899 |
| branch | 696, 682, 701, 839, 786 |

Indistinguíveis. Com imagens desabilitadas (diagnóstico complementar): ~0,2 s. Uma requisição de imagem **fria** local leva 0,7–1,6 s (até 8 concorrentes); a remota da INK, 0,9–4,6 s; ambas em milissegundos quando quentes. **A geração AVIF fria não explica 60 s.**

### 2.4 O que a suíte padrão permite afirmar

- **Não posso declarar a suíte completa verde**, e não estou. Ela passa **92–93 de 93** quando não cai em um dos dois problemas acima. Nas 6 rodadas com o cache aquecido: 1, 1, 1, 3, 1 e 1 falhas, **todas da Causa B**.
- **Sem regressão atribuível à branch**: mesmos testes falham e passam na `main` e na branch; com a flag ligada o padrão é o mesmo. Mas isto é **ausência de regressão observada**, não uma suíte estável.

### 2.5 Smoke determinístico e verificações

(Resultados na §2.6.)

`scripts/smoke-home-config.mts`: sobe **dois servidores de produção** (flag off e on) sobre um **catálogo fixture** (sem INK, sem CDN de imagens), aborta as requisições aos fornecedores de tracking (o pedido é *observado*, nada sai da máquina) e confere: prontidão; rotas atuais (`/sul`, privacidade, estado, cidade, índice de busca, `/norte` 404); estrutura e ordem das seções; **tracking com o fallback das envs**: zero requisições de Meta/GA4 antes do consentimento, e depois do aceite, Meta carrega e o GA4 carrega com o ID do fallback; ISR (segunda requisição `x-nextjs-cache: HIT`); HTML da home idêntico com flag off e on; o arquivo de coleções ausente/corrompido/vazio/válido sem efeito na home. Imprime **SKIP com o motivo** para o que não existe: upload de mídia, preview, leitor do `published.json`.

### 2.6 Resultados das verificações

| Verificação | Resultado |
|---|---|
| `vitest` | **240 de 240**, 13 arquivos (+43 nesta rodada) |
| `tsc --noEmit` / `eslint src tests scripts` | limpos |
| `next build` | ok (branch, ~20 s); ok também sem snapshot (parte de `verify:prerender`) |
| **Smoke determinístico** (`smoke-home-config.mts`) | **SMOKE PASSED**: 17 verificações com a flag desligada e 17 com ela ligada, mais 2 de igualdade entre as duas e 3 do arquivo de coleções; 3 `SKIP` declarados |
| `verify:prerender` (build sem Volume, primeiro acesso com snapshot, sync invalidando ISR) | **ALL CHECKS PASSED** com `SITE_CONFIG_HOME=off` **e** `on` |
| `verify:bootstrap` | **ALL CHECKS PASSED numa build limpa.** Numa **segunda** execução sobre a mesma `.next`, 1 verificação falha (`GET /api/cidades/sul -> 503 no-store`, recebe 200 público): o script **não faz build** e a execução anterior deixa em `.next` a entrada ISR do índice com o catálogo do fixture. **Ocorre igual na `main` intocada**, é higiene do teste (exige `.next` recém-construída), não regressão |
| **Paridade visual**, `main` × branch (flag off), 375/390/768/1280/1920 px | SSR, DOM hidratado e 138 links **idênticos**; screenshots full-page **pixel-idênticos nas 5 larguras** |
| **Paridade visual**, flag off × flag on, mesmas 5 larguras | idem: SSR, DOM, links **idênticos** e **pixel-idênticos nas 5 larguras**; refeito nesta rodada porque o renderer mudou (recebe o *lookup* de coleções) |

**O que a paridade encontrou de novo nesta rodada.** Numa execução o 1920 px deu 835.480 pixels de diferença: o lado de **referência** (flag desligada, código publicado) não tinha carregado a foto de fundo da campanha. DOM idêntico; foi **uma imagem que não carregou** naquele servidor (a mesma família da Causa A), não uma diferença do renderer. Para não confundir isso com regressão, o script agora **verifica se alguma imagem visível ficou sem carregar de um lado só** e, se ficar, marca a comparação como **inconclusiva**; imagens *lazy* fora da tela que ficam sem carregar **dos dois lados** (7–19 conforme a largura) são apenas informadas. Depois de reiniciar os servidores e aquecer o cache, 390 e 1920 passaram e o restante das larguras já tinha passado (as cinco, na execução completa, sem nenhuma linha de diferença de DOM, link ou pixel; as únicas linhas "FAIL" daquela execução eram o alerta de imagem, agora reclassificado). O método de captura segue igual para os dois lados; nenhuma tolerância de pixel foi usada.

**Continua inconclusivo / não verificado**: a suíte e2e como portão estável (§2.4); Chrome real (o renderer travou sob a carga; usei o Chromium do Playwright); comportamento do travamento de imagens **em produção**; `npm run collections:sync` **contra a INK** (não executado); upload, preview, leitor do `published.json` (não implementados).


## 3. Publicação e segurança (só preparação)

Revisei `publish-flow.ts` e o esquema, sem provisionar nada, e acrescentei 6 casos ao teste de injeção de falhas (agora **24**):

| Situação | Como o desenho a trata | Teste |
|---|---|---|
| Falha **antes** de qualquer gravação | lança; nada mudou | sim |
| Falha de escrita no Volume, antes ou depois do `rename` | antes: release `failed`, arquivo antigo; depois: confere o arquivo e **segue** | sim |
| **Commit no banco confirmado, mas a resposta se perde** | resultado "em dúvida" (`file-live-db-pending`); a reconciliação vê head coerente e só **invalida o cache**, sem reescrever nem promover de novo | **novo** |
| Falha ao promover (arquivo já no ar) | reconciliação **avança** (registra `live`) em vez de reverter | sim |
| **Retry** depois de falha | cria **nova** release; a falha fica no histórico; uma publicação "em dúvida" **bloqueia** a próxima até reconciliar (índice único parcial, espelhado no teste) | **novo** |
| **Rollback** = publicar um bundle antigo pelo mesmo protocolo | se a escrita falha, **a release atual continua no ar**; se dá certo, o histórico mantém tudo | **novo** |
| Banco fora do ar | a vitrine só lê arquivo/seed; a publicação falha antes de escrever | **novo** |

**O banco não é dependência das visitas**: nenhum código de renderização ou de rota pública importa banco (não existe cliente de banco no repositório), e o teste de infraestrutura que proíbe chamadas de rede ao servir páginas continua passando. As migrações seguem com **39 verificações** (`docs/admin/migrations/validate-pglite.mjs`, não reexecutadas nesta rodada porque nada nelas mudou).

`routing.ts` (host admin) **continua não ligado ao `proxy.ts`**, e `SITE_CONFIG_HOME` **não** foi ativada.

### O que será pedido ao owner na implantação (nada foi criado ou inventado)

- **Identidade**: e-mail do **primeiro owner** (vira `ADMIN_BOOTSTRAP_OWNER_EMAIL`, usado só enquanto não houver owner); e-mails dos editores e a matriz **região × pessoa**.
- **Google OIDC** (só depois da identidade do owner): um cliente OAuth num projeto Google Cloud **da conta pessoal**, tela de consentimento, URI de redirecionamento `https://admin.useorigens.com.br/auth/callback`; **Client ID e Client Secret entram como variáveis do Railway, digitados pelo próprio owner, nunca no chat nem no Git**. Também `ADMIN_SESSION_SECRET` (32 bytes aleatórios) e `ADMIN_HOST`.
- **Postgres**: aprovar provisão e custo corrente; `DATABASE_URL` por referência privada do Railway.
- **R2**: conferir zona e conta Cloudflare **ativas**, plano e custo; criar bucket e token de escopo mínimo; `R2_*` e `MEDIA_PUBLIC_BASE_URL`; decidir cópia para segundo bucket.
- **DNS**: `admin.useorigens.com.br` e `media.useorigens.com.br`.

## 4. Arquivos alterados e novos

**Alterados** (`git status`: `M`): `package.json` (só o script `collections:sync`), `src/app/[region]/page.tsx`, `src/components/banners/RegionalPhotoSection.tsx`, `src/components/catalog/ProductCarousel.tsx`, `src/components/home/{Campaign,RegionHero,StateCards}.tsx`. Todas as mudanças de componente são props opcionais; o caminho publicado é o mesmo.

**Novos** (`??`), desta rodada: `src/lib/catalog/{collections,collections-file,collections-sync,collection-source}.ts`, `src/lib/ink/collections-client.ts`, `tests/unit/collections.test.ts`, `scripts/{inventory-ink-collections,sync-collections,diagnose-page-load,repro-image-optimizer-hang,smoke-home-config}.mts`, `docs/admin/{ink-collections-inventory,cms-v1-round3}.md`. Das rodadas 1–2 (ainda não adicionados): `docs/admin/*`, `src/lib/site-config/`, `src/lib/admin/`, `src/components/home/HomeSections.tsx`, `src/components/banners/SectionBackdrop.tsx`, `scripts/verify-home-equivalence.mts`, `tests/unit/{site-config,publish-flow,admin-routing}.test.ts`.

**Testes**: 240 no total (**+43** nesta rodada: 37 de coleções e 6 de publicação), 13 arquivos.

## 5. Riscos residuais e o próximo gate

### Riscos

1. **Travamento do otimizador de imagens do Next 16.3.5 (§2.2, Causa A) pode afetar produção.** É o item mais importante desta rodada e é independente da CMS. **Não confirmado em produção.**
2. Suíte e2e frágil por corrida de hidratação (Causa B): não serve como portão de release enquanto não esperar a hidratação.
3. A máquina de desenvolvimento estava saturada por outros projetos; medições de desempenho e Lighthouse só valem em ambiente estável (pendência da Fase 1).
4. Coleções: ordem sem semântica documentada; defasagem entre snapshot de catálogo e coleções; slug/URL verificados em poucos casos, não nas 224; coleções ocultas nunca devem ser oferecidas (já filtradas).
5. Chrome real não foi usado com sucesso (renderer travou sob a carga); a paridade visual foi feita no Chromium do Playwright.

### Decisões que preciso de você

| # | Decisão | Recomendação |
|---|---|---|
| E1 | O que fazer com o travamento do otimizador | Reproduzir em **staging**/produção com o script; se confirmar, **pré-aquecer os banners locais no start** e/ou servi-los sem otimizador. Nada disso foi feito |
| E2 | Tornar a suíte e2e determinística (esperar hidratação) | Sim, como tarefa separada e revisada; não fiz |
| C1 | Rodar `npm run collections:sync` **uma vez, local**, depois de um catalog sync fresco (~4 requisições) | Sim; é o passo que gera o arquivo real e permite ver a seção por `ink-category` em ambiente local |
| C2 | Home Sul: manter `editorial-module` (idêntica) e usar `ink-category` só para seções novas | Sim |
| C3 | Curadoria manual **restrita a uma coleção** (ids validados como membros) | Desenhar antes de implementar |

### Próximo gate (para autorizar Postgres, R2 e OIDC em fases independentes)

1. **Fase Postgres**: revisar `0001_init.up.sql`; aprovar provisão e custo; sem usuário nem autenticação ainda. Critério: migração aplicada e `validate-pglite.mjs` reexecutado contra o banco real.
2. **Fase OIDC**: exige e-mail do owner e o cliente OAuth criado por você; admin continua **404** sem todas as variáveis.
3. **Fase R2**: exige a conferência de Cloudflare e o custo aprovados.
4. **Antes de qualquer fase**: E1 resolvido ou aceito como risco; a decisão sobre E2.
5. **Antes de ligar `SITE_CONFIG_HOME` em produção**: repetir a paridade e o smoke sobre o snapshot **de produção**.

## 6. Como reproduzir

```bash
npx vitest run && npx tsc --noEmit && npx eslint src tests scripts      # 240 testes
npm run build && npx tsx scripts/smoke-home-config.mts                   # smoke determinístico
npx tsx scripts/verify-home-equivalence.mts http://localhost:A http://localhost:B /sul /tmp/out   # paridade visual
npx tsx scripts/repro-image-optimizer-hang.mts http://localhost:PORT    # bug do otimizador (servidor de produção)
npx tsx scripts/diagnose-page-load.mts http://localhost:PORT /sul/sc/tijucas
```
