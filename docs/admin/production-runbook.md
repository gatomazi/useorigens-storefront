# CMS em produção: `https://www.useorigens.com.br/admin`, tudo no Railway

Guia operacional. O relatório da rodada (`cms-v1-round7-railway.md`) diz o que foi construído e testado; este arquivo diz **o que fazer, em que ordem**.

**Arquitetura:** um único serviço Next.js (`useorigens-storefront`), dois domínios já atribuídos (`www.useorigens.com.br` e `useorigens.com.br`). O painel vive em **`/admin` no mesmo host da loja** (`www`): sem subdomínio novo, sem wildcard, sem outro serviço, sem mudança de DNS. PostgreSQL do Railway (rascunhos, versões, pessoas, sessões, auditoria). **Railway Storage Bucket** privado (imagens enviadas). **Volume existente** (`/app/data/generated`: `catalog-snapshot.json`, `collections-snapshot.json`, `site-config/published.json`). Login: **Login with Railway** (OAuth 2.0/OIDC). As imagens saem pela própria loja em `/media/...`.

**Regra de ouro:** enquanto qualquer variável obrigatória do admin faltar ou estiver inválida, `/admin` responde 404 e a loja não muda. A navegação pública nunca passa pelo código do admin: só caminhos que começam com `/admin` são tratados por ele.

## 1. Como o host e o cookie funcionam

- `/admin/**` só existe no `ADMIN_HOST` (`www.useorigens.com.br`), com `noindex, nofollow` e `no-store`. Em qualquer outro host (endereço temporário `*.up.railway.app`, look-alikes) `/admin/**` é **404**.
- **Domínio raiz:** `https://useorigens.com.br/admin/...` **redireciona (307) para `https://www.useorigens.com.br/admin/...`**, mantendo caminho e consulta. O resto do domínio raiz continua exatamente como está (o app não faz redirecionamento raiz↔`www` para a loja). O login e o callback acontecem sempre em `www`, então nenhum redirecionamento www↔raiz atrapalha o OAuth. Se algum dia o Railway/DNS passar a redirecionar a raiz inteira para `www`, nada muda para o painel.
- **Callback exato:** `https://www.useorigens.com.br/admin/auth/callback`. O redirect é montado a partir de `ADMIN_HOST` (nunca do `Host` da requisição), então precisa ser cadastrado igual no OAuth App.
- **Cookies** (ambos `Secure`, `HttpOnly`, `SameSite=Lax`, sem `Domain`, ou seja, presos ao host): sessão `__Secure-uo_admin` com `Path=/admin`; estado do login `__Secure-uo_oidc` com `Path=/admin/auth`. Como o painel divide o host com a loja, o navegador **nunca envia** esses cookies para páginas públicas (testado). O prefixo `__Host-` foi abandonado porque exige `Path=/`.
- Toda página, Server Action, upload e rota do painel autentica e autoriza **no servidor** (sessão + papel + região); as mutations também exigem `Origin` igual a `https://www.useorigens.com.br`.

## 2. Variáveis (serviço `useorigens-storefront`)

Nomes apenas. Segredos entram direto no painel do Railway, **nunca** no chat, no Git ou em log.

| Variável | Obrigatória | Valor |
|---|---|---|
| `ADMIN_HOST` | sim | **`www.useorigens.com.br`** (sem `https://`) |
| `ADMIN_OWNER_EMAIL` | sim | e-mail da conta Railway do primeiro owner |
| `RAILWAY_OAUTH_CLIENT_ID` / `RAILWAY_OAUTH_CLIENT_SECRET` | sim | do OAuth App (redirect acima) |
| `ADMIN_SESSION_SECRET` | sim | **≥ 32 caracteres** aleatórios (`openssl rand -base64 48`) |
| `DATABASE_URL` | sim | referência ao serviço `Postgres` (URL privada, `*.railway.internal`) |
| `ADMIN_OWNER_RAILWAY_SUB` | não | id imutável da conta do owner; só se o e-mail não vier verificado (seção 6) |
| `BUCKET_ENDPOINT`, `BUCKET_NAME`, `BUCKET_ACCESS_KEY_ID`, `BUCKET_SECRET_ACCESS_KEY`, `BUCKET_REGION` | para enviar imagens | referências às variáveis do bucket |
| `BUCKET_ADDRESSING` | não | `path` só se o bucket for antigo |
| `SITE_CONFIG_HOME` | **`off`** | vira `on` só no passo 9 do rollout |

`ADMIN_DEV_MODE` não deve existir em produção (é ignorada).

## 3. Estado atual do Railway (verificado em 2026-09-24, sem revelar valores)

Projeto `useorigens`, ambiente `production`. Serviços: `useorigens-storefront` (domínios `www.useorigens.com.br` e `useorigens.com.br`; Volume em `/app/data/generated`) e `Postgres` (**sem endereço público / TCP proxy**: só alcançável por dentro do projeto). Último deploy da loja: `SUCCESS`.

| Item | Estado | Ação |
|---|---|---|
| `SITE_CONFIG_HOME` | `off` ✔ | manter |
| `ADMIN_HOST` | presente, mas **ainda `admin.useorigens.com.br`** ✘ | trocar para `www.useorigens.com.br` |
| `ADMIN_OWNER_EMAIL` | presente, formato de e-mail válido ✔ | — |
| `ADMIN_SESSION_SECRET` | presente, mas **menos de 32 caracteres** ✘ (o admin ficaria desligado) | regenerar (comando abaixo) |
| `RAILWAY_OAUTH_CLIENT_ID` / `_SECRET` | presentes ✔ | conferir que o OAuth App tem o **callback novo** |
| `DATABASE_URL` | presente, host interno do Railway ✔ | — |
| `BUCKET_ENDPOINT` (`t3.storageapi.dev`), `BUCKET_NAME`, `BUCKET_ACCESS_KEY_ID`, `BUCKET_SECRET_ACCESS_KEY` | presentes ✔ | — |
| `BUCKET_REGION` | `iad` (localização do bucket) | o cliente S3 tenta `iad` e, se o bucket recusar (403), repete uma vez com `auto` e mantém o que funcionar; `cms:check` avisa qual serviu |
| `ADMIN_SYNC_TOKEN`, `INK_TOKEN_SUL`, `NEXT_PUBLIC_*` | presentes ✔ | — |
| `ADMIN_DEV_MODE` | ausente ✔ | — |

Comandos para corrigir (não executei: alteram produção; seus valores não passam pelo chat):

```bash
railway variables --service useorigens-storefront --set "ADMIN_HOST=www.useorigens.com.br"
railway variables --service useorigens-storefront --set "ADMIN_SESSION_SECRET=$(openssl rand -base64 48)"
```

Cada `--set` dispara um redeploy; aplique os dois juntos (`--set A=... --set B=...`) ou use a interface e faça um único deploy. **No OAuth App** (Settings → Developer), o redirect precisa ser exatamente `https://www.useorigens.com.br/admin/auth/callback`.

## 4. Primeira migração real do PostgreSQL (aguarda sua autorização)

O Postgres não tem acesso público, então **não** dá para migrar do seu computador. A migração roda **dentro do serviço** com um CLI de Node puro (`db/db-cli.mjs`, só precisa de `node` e `pg`, já presentes; sem `tsx`). O banco é novo e vazio: não há dados a proteger; um dump só passa a fazer sentido depois do primeiro uso real.

Ordem segura (o painel só liga quando `ADMIN_HOST` e o segredo de sessão forem corrigidos, então dá para migrar antes de ligá-lo):

1. **Deploy do código** (autorização sua). Enquanto `ADMIN_SESSION_SECRET` tiver < 32 caracteres, o painel segue em 404 e a loja não muda.
2. Status (somente leitura):
   ```bash
   railway ssh --service useorigens-storefront -- npm run db:status
   ```
   Esperado: `applied: (none)` e `pending: 0001_init, 0002_auth_sync` (código de saída 1 enquanto houver pendências).
3. Aplicar (idempotente; cada migração numa transação, com trava; nunca roda sozinha):
   ```bash
   railway ssh --service useorigens-storefront -- npm run db:migrate
   ```
   Esperado: `applied 0001_init`, `applied 0002_auth_sync`, `done: 2 migration(s) applied`. Rodar de novo diz `nothing to apply`.
4. Conferir: `db:status` → `pending: (none)`; e `railway ssh --service useorigens-storefront -- npm run cms:check` (mostra o que ainda falta; o DB e o bucket são testados de dentro do projeto).
5. Só então corrigir `ADMIN_HOST`/`ADMIN_SESSION_SECRET` (seção 3): o painel liga.

Se `railway ssh` não estiver disponível na sua conta, alternativa: habilitar temporariamente o *TCP Proxy* do serviço `Postgres` (Settings → Networking; tem custo de egress) e rodar `DATABASE_URL=<url pública> npm run db:migrate` no seu computador; remova o proxy depois. Reversão de uma migração é só para desenvolvimento (`*.down.sql`); em produção, corrigir para frente.

## 5. Primeiro login (depois da migração e das variáveis)

1. Confirme no OAuth App o redirect `https://www.useorigens.com.br/admin/auth/callback`.
2. Abra `https://www.useorigens.com.br/admin` numa janela anônima: deve ir para a tela **Painel → Entrar com Railway**.
3. Entre com a conta Railway cujo e-mail é o `ADMIN_OWNER_EMAIL` **e** que o Railway declara verificado. Você é criado como owner e a conta fica vinculada.
4. **Se aparecer "Este e-mail não tem acesso ao painel"** com um *identificador da conta Railway*: o Railway não informou o e-mail como verificado. Copie o identificador, defina `ADMIN_OWNER_RAILWAY_SUB=<identificador>` e entre de novo (vínculo por id imutável).
5. Em **Coleções**, `Sincronizar coleções agora` (≈ 4 leituras na INK). Em **Pessoas**, cadastre editores (cada um com conta Railway).
6. Envie **uma** imagem de teste em **Mídia** e confirme que `GET https://www.useorigens.com.br/media/<hash>/640.webp` dá **404** antes de publicar.
7. Publique com `SITE_CONFIG_HOME=off`: a loja **não muda**.

## 6. Login with Railway: detalhes que importam

- Provedor de identidade apenas; escopos `openid email profile`. Endpoints por discovery (`https://backboard.railway.com/oauth/.well-known/openid-configuration`, com os URLs documentados como reserva). ID token **ES256**; verificamos assinatura, `iss`, `aud`, `exp`, `iat`, `nonce`; PKCE S256; cliente autenticado por HTTP Basic.
- Quem pode entrar é decidido pela **tabela de pessoas no PostgreSQL**, nunca pelo Railway. A conta é vinculada ao usuário pelo `sub` (imutável) no primeiro login; outra conta com o mesmo e-mail é recusada. Só aceitamos e-mail que o Railway declare verificado (ou o owner por `ADMIN_OWNER_RAILWAY_SUB`).
- O CMS não guarda tokens do Railway (só `sub`, e-mail e nome). A sessão do painel é própria: 12 h absolutas / 2 h de inatividade, token só como hash no banco.

## 7. Imagens

- O upload passa pelo serviço: formato real (PNG/JPEG/WebP/AVIF), ≤ 8 MB, ≤ 6000 px, sem animação, orientação aplicada, metadados removidos, WebP em 640/1080/1600/2400. Só as variantes processadas vão ao bucket privado, com nome por hash (`media/<sha256>/<largura>.webp`): imutáveis.
- Imagens **publicadas** saem por `GET /media/<sha256>/<largura>.webp` na própria loja: só chaves listadas no `published.json` (local), `Cache-Control: public, max-age=31536000, immutable`, `nosniff`, cache em memória. Rascunhos só por `/admin/media/…` (com sessão). O bucket nunca é exposto.
- A loja **não** depende do bucket nem do banco para renderizar; se o bucket falhar, a seção usa cor/gradiente. O app **nunca apaga** objetos do bucket.
- **Custo:** o tráfego de `/media` passa pelo serviço e pode gerar egress **do serviço** (o do bucket é gratuito; US$ 0,015/GB-mês de armazenamento segundo a documentação do Railway). Sem CDN. Estimativa, não orçamento; medir com tráfego real.

## 8. Rollout controlado

| # | Passo | Como saber que deu certo | Voltar atrás |
|---|---|---|---|
| 0 | Os banners WebP (`150db18`) e o cart-mirror já estão em `origin/main` e foram integrados nesta branch | — | — |
| 1 | Deploy da branch do CMS com as variáveis **como estão** (segredo curto ⇒ painel 404) | `/admin` 404; home idêntica; `/api/ready` ok | rollback normal |
| 2 | `db:status` → `db:migrate` (seção 4) | `pending: (none)` | migração é aditiva |
| 3 | Corrigir `ADMIN_HOST` e `ADMIN_SESSION_SECRET`; conferir o redirect do OAuth App | `…/admin` mostra o login | apagar `ADMIN_HOST` (painel some) |
| 4 | Primeiro login (seção 5); sincronizar coleções; Pessoas | painel abre | remover acesso |
| 5 | Imagem de teste; `/media/…` = 404 antes de publicar | 404 | — |
| 6 | Editar e **Publicar** com `SITE_CONFIG_HOME=off` | "Coerente"; `published.json` em `/app/data/generated/site-config/` | Restaurar versão |
| 7 | Prévia 375/desktop; smoke: `/sul`, busca, cidade, `/api/ready`, `/media/` inválido = 404 | tudo esperado | descartar rascunho |
| 8 | Conferência visual final | — | — |
| 9 | `SITE_CONFIG_HOME=on` (redeploy) **só depois** do passo 8 | `/sul` mostra a versão publicada; consentimento e PageView Meta/GA4 depois do aceite | **`off`** (volta ao seed) ou **Restaurar versão** |
| 10 | (Separado, autorização própria) IDs de tracking regionais | — | restaurar versão |

Rollback rápido: `SITE_CONFIG_HOME=off` → **Restaurar versão** → apagar `ADMIN_HOST` (fecha o painel) → rollback do deploy.

## 9. O que o sistema garante sozinho

- **Publicar é atômico e reconciliável:** registro `pending` no banco → arquivo (temp + rename no Volume) → `live` → invalida cache. Falha em qualquer ponto mantém a versão anterior; o reconciliador refaz o arquivo a partir do banco (também ~15 s depois de cada inicialização).
- **Tracking:** sem configuração publicada (ou com a flag desligada) o comportamento é exatamente o de hoje (`NEXT_PUBLIC_*`). Publicar é bloqueado se os IDs do documento diferirem dos do build.
- **Sincronizações** só leem a INK (GET), uma por vez (trava no banco), e nunca apagam o último arquivo bom.


## Regiões e tracking (Rodada 8)

- Norte e Centro-Oeste são editáveis no painel (seletor de região no topo) e **só ficam públicas** quando o owner usa **Publicar → Lançar <região> ao público**, com a flag `SITE_CONFIG_HOME` ligada e o catálogo da loja INK da região sincronizado (cobertura ≥ 50% das cidades). **Recolher** volta à prévia (404 público). Ambos são publicações da região, reversíveis, sem efeito nas outras regiões nem no catálogo.
- Tracking em `/admin/tracking`: global (owner) e por região; Meta e GA4 independentes; salvar = rascunho; publicar exige confirmar os IDs efetivos quando eles mudam. Sul usa os IDs do build ("legado") até uma escolha explícita; Norte/Centro começam sem rastreamento.
- Sem migração de banco nesta rodada. Detalhes e roteiro: [`cms-v1-round8-regions-tracking.md`](cms-v1-round8-regions-tracking.md).
