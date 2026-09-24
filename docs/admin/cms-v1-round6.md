# CMS V1: Rodada 6: integração para produção

- Branch `feature/storefront-admin`. **Só commits locais. Nenhum push, merge, deploy ou provisionamento.** `main`/`origin/main` seguem em `678c26a` (confirmado). Nada foi criado no Railway, Cloudflare ou Google; nenhuma variável de produção foi tocada; o repositório dos Workers não foi tocado.
- Guia operacional (variáveis, ordem, rollout): [`production-runbook.md`](production-runbook.md).
- Uso local (inalterado): [`cms-local-usage.md`](cms-local-usage.md).

## 1. Resumo direto

**Funciona integralmente, testado localmente** contra um PostgreSQL real (PGlite, o próprio motor do Postgres em WASM, inclusive pela rede), um Google OIDC falso, um R2/S3 falso e um `next start` de produção: login, permissões por região, rascunhos com trava otimista, publicação no Volume com reconciliação, rollback, upload de imagem para o R2, tracking publicado, sincronização de coleções e o painel de pessoas.

**Depende de você** (credenciais e serviços): Postgres no Railway, cliente OAuth do Google, bucket R2 + `media.useorigens.com.br`, DNS de `admin.useorigens.com.br`, e as variáveis de ambiente. Nada disso foi criado. Sem elas, `/admin` é 404 e a loja não muda.

**Não feito (opcional, fora do fechamento):** curadoria manual de produtos dentro da coleção (item E.4).

## 2. O que foi integrado

| Frente | Entregue | Como foi provado |
|---|---|---|
| **A. Postgres** | Porta `Db` com adaptadores `pg` (Pool ≤ 4, timeouts, ssl opcional) e PGlite. Repositórios de rascunho (trava otimista), releases (imutáveis, uma só `pending`), pessoas, sessões (só o hash), auditoria (append-only), execuções de sync (trava no banco). Migrations `0001` (a já desenhada, sem segundo esquema) + `0002` (aditiva). CLI explícita: `npm run db:status`, `db:migrate`, `db:validate`. **Nunca** roda em build, deploy ou rota pública. Sem `DATABASE_URL`, o admin é 404. Modo dev segue com `data/admin-dev/`. A vitrine não consulta o banco. | 28 testes de integração no motor real (constraints, triggers, índice parcial, 2 abas, falhas). `db:validate` (38 verificações) up→down→up. |
| **B. Google OIDC** | Fluxo code + PKCE implementado direto na especificação (sem dependência): `state`/`nonce`, cookie de login assinado (10 min), verificação RS256 por `kid` (JWKS), `iss`, `aud`, `exp`, `iat`, `nonce`, `email_verified`. Allowlist em `admin_user`; owner criado no primeiro login do e-mail de `ADMIN_OWNER_EMAIL`; conta Google vinculada (`google_sub`) ao primeiro login. Sessão no banco, cookie `__Host-` `Secure` `HttpOnly` `SameSite=Lax`, 12 h absolutas / 2 h de inatividade. Toda action e página autoriza no servidor (`requireAdmin`), com checagem de `Origin` nas mutações. Página **Pessoas** (só owner). | 60 testes unitários de OIDC/config/roteamento + E2E de produção (7/7). |
| **Roteamento** | `routing.ts` incorporado ao `proxy.ts`: no `ADMIN_HOST` só existe `/admin/**` (com `noindex` e `no-store`), `/` redireciona; em qualquer outro host `/admin/**` é 404; a vitrine dá 404 no host do admin (a API pública somente leitura, fora do proxy, ver bugs). `X-Forwarded-Host` nunca vale como identidade. Gate de catálogo/503 e canonical da vitrine inalterados. | E2E: 8 rotas sem sessão → login; 7 rotas 404 no host da loja; 3 rotas 404 no host do admin (a vitrine); Host falso; `X-Forwarded-Host`. Smoke: configuração **parcial** (`ADMIN_HOST` sozinho) mantém 404. |
| **C. Mídia R2** | Cliente S3 mínimo (SigV4 com `fetch` + `node:crypto`, sem SDK). Envio: PNG/JPEG/WebP/AVIF reais (o decodificador decide, nunca o MIME ou o nome), ≤ 8 MB, ≤ 6000 px, sem animação, orientação aplicada, EXIF removido, WebP em 640/1080/1600/2400 (nunca aumenta). Só as variantes processadas vão ao R2, com chave `media/<sha256>/<largura>.webp` (imutáveis, deduplicadas); o original **não** é guardado. Chaves fora desse formato são recusadas antes de qualquer requisição. A vitrine usa as variantes como `srcset` direto, **sem o otimizador de imagens** (que trava, ver Rodada 3), e só aceita imagens de `media.useorigens.com.br` (ou origens extras configuradas). Sem R2, o envio é desligado com aviso e os banners do projeto continuam. Alt/foco/véu/cor/degradê já existiam. | Vetor oficial da AWS para o SigV4; 8 testes de intake; 5 de R2 com Postgres real; E2E: 4 objetos no R2 após o envio, SVG recusado, URL pública com `cache-control: immutable`. |
| **D. Publicação e tracking** | Um só protocolo (`publish-flow.ts`, já testado com injeção de falhas) sobre portas: sandbox (JSON) ou Postgres + arquivo no Volume (`site-config/published.json`, temp + rename). Outras regiões são carregadas da versão no ar, não regeneradas. Reconciliador roda antes de cada publicar, sob demanda, e ~15 s depois de cada inicialização (recria o arquivo se o Volume foi perdido). `revalidatePath` só depois de promover. `SITE_CONFIG_HOME` segue desligado por padrão. **Tracking**: `global` + regional resolvidos do publicado **somente** com flag ligada e arquivo válido; caso contrário, `NEXT_PUBLIC_*` como hoje. Publicar é **bloqueado** se os IDs do documento diferirem dos do build. Nada é importado no pré-render (a vitrine lê em runtime/ISR). | 9 cenários de publicação/rollback/queda de arquivo/queda do banco/Volume perdido/publicação concorrente em Postgres real; E2E: nada de tracker antes do aceite, Meta e GA solicitados depois, com os IDs de hoje; build limpo sem serviços. |
| **E. Coleções e editor** | Botão **Sincronizar coleções agora** (owner; ≈ 4 GETs; uma por vez, trava no banco; intervalo mínimo de 5 min; falha da INK mantém o último arquivo bom). `POST /api/admin/catalog-sync` aceita `withCollections: true`: só depois de o catálogo dar certo, atualiza as coleções, sem afetar o resultado do catálogo. A Biblioteca mostra data da última sincronização e avisa se o arquivo é v1, tem 7+ dias ou o catálogo é mais novo. Autocompletar: lista limitada (16 rem / 45% da tela) com rolagem, item ativo sempre visível, Ctrl+Home/End, sem cobrir o formulário inteiro. Internas seguem opt-in individual, sem "Ver todos"; só itens ativos da mesma loja. | Testes de integração do lock de sync; E2E (cartões e combobox). O clique real de sincronização **não** foi executado (falaria com a INK; fora do limite de leituras desta rodada). |

## 3. Bugs reais encontrados e corrigidos

1. **`/api/*` responde também no host do admin** (o `matcher` do proxy exclui `api`, como sempre). O E2E de produção achou isso; tentei incluir `api` no matcher, mas o `verify:bootstrap` mostrou que isso quebra a garantia de catálogo vazio (o índice de busca passou a ser servido como 200 em vez de 503). **Revertido**. Fica como desvio conhecido e aceito: `/api/cidades/*` (dados públicos somente leitura, os mesmos da loja) também responde no host do admin; `/api/admin/catalog-sync` segue exigindo o token. Todo o painel está sob `/admin/**`, onde as checagens valem.
2. Wrapper do PGlite devolvia `rowCount` 0 para `SELECT` (fazia a migration reaplicar). Corrigido e coberto.
3. Aviso de retorno das actions quebrava com `?q=` na URL (Rodada 5) — já corrigido antes; mantido.
4. `hookTimeout` do Vitest curto demais sob carga (máquina com load ≈ 200 por outros processos). Ajustado.

## 4. Testes e verificações

| Verificação | Resultado |
|---|---|
| `tsc --noEmit` | limpo |
| Vitest (unitários + integração em Postgres real) | **394 testes**, 26 arquivos |
| Build limpo sem nenhum serviço provisionado e flags off | ok |
| Smoke de produção (inclui admin fechado com configuração parcial) | **passou** (reexecutado no build final) |
| E2E do admin em **modo produção** (`npm run test:admin:prod`: `next start` + PGlite pela rede + OIDC falso + R2 falso + Volume temporário) | **7/7** (também no build final) |
| E2E do admin em modo dev (`npm run test:admin`) | **3/3** (a máquina estava com load ≈ 100–250 por processos de outros projetos: precisei aumentar timeouts de navegação; uma tentativa anterior chegou ao último passo e estourou o tempo total do teste) |
| E2E da loja (Playwright, uma passagem) | 91/93 na passagem; os 2 que falharam (busca de cidade no servidor `next dev`, compilação fria sob carga) passaram ao serem rodados sozinhos. Flakiness ambiental, não regressão |
| `verify:prerender` / `verify:bootstrap` | **ambos passam** (`verify:bootstrap` exige `.next` limpo; ele foi quem barrou a mudança de matcher do item 1 dos bugs) |
| ESLint | 0 erros (2 avisos em `db/validate-migrations.mjs`, script herdado) |

O E2E de produção cobre: usuário sem sessão; e-mail fora da allowlist e e-mail não verificado; owner (cookie `__Host-`, `HttpOnly`, `Secure`, `SameSite=Lax`, ilegível por script; logout invalida o token no servidor); editor de **outra região** recusado no servidor (nada gravado) e sem acesso a Pessoas/sincronização; editor do Sul; fluxo principal (Biblioteca → habilitar interna → upload → seção → salvar → 2 abas → prévia 375/desktop sem trackers → publicar → loja `/sul` com imagens do R2 → consentimento → segunda versão → restaurar → trilha de auditoria).

## 5. Riscos residuais

- **Nunca rodou contra o Google, o Railway Postgres ou o R2 reais.** Os stand-ins seguem os protocolos (o PGlite é o Postgres de verdade; o SigV4 bate com o vetor da AWS), mas peculiaridades do serviço real só aparecem no primeiro uso. Por isso o rollout tem `cms:check` e a publicação com a flag desligada antes de ligar.
- `__Host-` exige HTTPS de verdade: o teste usou loopback (o navegador aceita). Em produção o Railway termina o TLS; o `Host` chega preservado. Se o proxy alterar o `Host`, o login falha de forma segura (404); ver runbook.
- Origem do `Origin`: mutações exigem `Origin = https://ADMIN_HOST`. Um proxy que reescreva `Origin` quebraria os formulários (falha segura).
- Domínio de mídia depende de onde está o DNS (pergunta em aberto no runbook).
- O reconciliador do boot roda uma vez, ~15 s depois de cada início; se o banco estiver fora nesse momento, ele só tenta de novo no próximo publicar ou na abertura da tela Publicar.
- Um aviso de build do Turbopack ("Edge Instrumentation") aparece por causa do import dinâmico em `instrumentation.ts`; é inócuo (guardado por `NEXT_RUNTIME`), mas ruidoso.
- Objetos do R2 nunca são apagados pelo app (decisão de segurança para o "restaurar"): imagens removidas da biblioteca continuam ocupando espaço até uma limpeza manual deliberada.
- Sem fila/cron: sincronizações são manuais (botão) ou via `withCollections`.

## 6. Ações exatas do proprietário (resumo; detalhes no runbook)

1. Definir o **e-mail Google do primeiro owner**.
2. **Railway:** criar o Postgres no projeto e referenciar `DATABASE_URL` no serviço da loja.
3. **Google Cloud:** criar o cliente OAuth (Web) com redirect **exatamente** `https://admin.useorigens.com.br/admin/auth/callback`; copiar ID e Secret **direto para o Railway**.
4. **Cloudflare:** bucket R2 + token restrito ao bucket + domínio `media.useorigens.com.br`. Dizer onde está o DNS de `useorigens.com.br`.
5. **DNS:** `admin.useorigens.com.br` (CNAME indicado pelo Railway) e `media.` (conforme o item 4).
6. **Railway:** `ADMIN_SESSION_SECRET` (`openssl rand -base64 48` no seu terminal), `ADMIN_HOST`, `ADMIN_OWNER_EMAIL`, `GOOGLE_OAUTH_CLIENT_ID/SECRET`, `R2_*`, `MEDIA_PUBLIC_BASE_URL`. **Não** ligar `SITE_CONFIG_HOME` ainda.
7. `railway run npm run db:migrate` e `railway run npm run cms:check` (só nomes e OK/FAIL).
8. Seguir a tabela de rollout do runbook (o passo 10 liga a flag só no Sul).

**Custos: estimativas não verificadas, nunca orçamento aprovado.** Postgres Railway em uso baixo: da ordem de poucos dólares/mês; R2: praticamente zero na faixa gratuita com egress sem cobrança; Google OAuth: sem custo. Confirmar todos os preços nos painéis antes de aprovar. Nenhum recurso pago foi criado.

## 7. Release controlada e rollback

Ordem sugerida (tabela completa no runbook):

0. **Release separada dos banners WebP (`150db18`)**: ele **não** está em `main`. Cherry-pick limpo sobre `main` com um único conflito trivial (`scripts/repro-image-optimizer-hang.mts`, removido em `main`: manter removido). Testado em worktree descartável. Publicar antes do CMS.
1. Deploy da branch do CMS **sem** variáveis do admin: `/admin` 404, home idêntica.
2. Provisionar (seção 6) → `db:migrate` → `cms:check`.
3. Adicionar variáveis do admin; entrar; sincronizar coleções; cadastrar editores.
4. Publicar com `SITE_CONFIG_HOME` **off** (a loja não muda); prévia; conferir `published.json` no Volume.
5. Ligar `SITE_CONFIG_HOME=on` **só** depois; validar `/sul` e o tracking após o aceite.

Rollback, do mais rápido ao mais lento: desligar `SITE_CONFIG_HOME` → **Restaurar versão** (nova release) → remover `ADMIN_HOST` → rollback do deploy.

## 8. Commits locais

Ver `git log` na branch. Ficaram fora: `docs/design/lighthouse/`, `docs/screenshots/`, snapshots locais, `data/admin-dev`, `.env*`.
