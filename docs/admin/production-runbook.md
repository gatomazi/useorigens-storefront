# CMS em produção, tudo no Railway: variáveis, provisionamento e rollout

Guia operacional. O relatório da rodada (`cms-v1-round7-railway.md`) diz o que foi construído e testado; este arquivo diz **o que fazer, em que ordem**.

**Arquitetura:** um único serviço Next.js (`useorigens-storefront`) atende a loja (`useorigens.com.br`) e o painel (`admin.useorigens.com.br`) por **host**. PostgreSQL do Railway (rascunhos, versões, pessoas, sessões, auditoria). **Railway Storage Bucket** privado (imagens enviadas). **Volume existente** (`catalog-snapshot.json`, `collections-snapshot.json`, `site-config/published.json`). Login: **Login with Railway** (OAuth 2.0/OIDC). Sem Google, sem R2, sem Cloudflare, sem `media.` — as imagens saem pela própria loja em `/media/...`.

**Regra de ouro:** enquanto qualquer variável obrigatória do admin faltar, `/admin` responde 404 e a loja não muda. Nada abaixo altera a home antes do passo 10 do rollout.

## 1. Variáveis (serviço `useorigens-storefront`)

Nomes apenas. Segredos entram direto no painel do Railway, **nunca** no chat, no Git ou em log. Preferir **referências** entre serviços (`${{Serviço.VARIÁVEL}}`) a copiar valores.

| Variável | Obrigatória | Origem / valor |
|---|---|---|
| `ADMIN_HOST` | sim | `admin.useorigens.com.br` (sem `https://`) |
| `ADMIN_OWNER_EMAIL` | sim | e-mail da conta Railway do primeiro owner |
| `RAILWAY_OAUTH_CLIENT_ID` / `RAILWAY_OAUTH_CLIENT_SECRET` | sim | OAuth App (passo 3 abaixo); o secret aparece **uma única vez** |
| `ADMIN_SESSION_SECRET` | sim | ≥ 32 caracteres aleatórios, gerados por você (`openssl rand -base64 48`) |
| `DATABASE_URL` | sim | referência ao PostgreSQL do mesmo projeto (URL privada) |
| `ADMIN_OWNER_RAILWAY_SUB` | não | id imutável da conta Railway do owner; só se o e-mail não vier verificado (ver seção 5) |
| `BUCKET_ENDPOINT`, `BUCKET_NAME`, `BUCKET_ACCESS_KEY_ID`, `BUCKET_SECRET_ACCESS_KEY`, `BUCKET_REGION` | para enviar imagens | referências às variáveis `ENDPOINT`, `BUCKET`, `ACCESS_KEY_ID`, `SECRET_ACCESS_KEY`, `REGION` do serviço do bucket |
| `BUCKET_ADDRESSING` | não | `path` só se o bucket for antigo e exigir path-style (a aba Credentials do bucket diz qual estilo vale). Padrão para `*.storageapi.dev`: virtual-hosted |
| `DATABASE_SSL`, `DATABASE_POOL_MAX` | não | `require` se usar URL pública; padrão de pool 4 |
| `SITE_CONFIG_HOME` | **deixar desligado** | vira `on` só no passo 10 |
| `INK_TOKEN_*`, `ADMIN_SYNC_TOKEN` | já existem | usados pelos botões de sincronização |

`ADMIN_DEV_MODE` **não** deve existir em produção (é ignorada). O admin só liga com o conjunto obrigatório completo e só responde no `ADMIN_HOST`. Exemplo de referência: `BUCKET_NAME=${{<nome do serviço do bucket>.BUCKET}}`.

## 2. Ordem do proprietário (o que só você pode fazer)

1. **Decidir o e-mail do owner** (a conta Railway que vai administrar). Editores também precisam de conta Railway; entrar **não** lhes dá acesso ao projeto Railway, só ao que o CMS autorizar.
2. **PostgreSQL:** criar **um** PostgreSQL no projeto existente; no serviço da loja, `DATABASE_URL` como referência. Custo **não verificado**: confirmar no painel antes de aprovar. **Backup:** não presumir backup nativo; confirmar no painel do Railway o que o plano oferece e, antes da primeira migração, guardar um dump manual (`pg_dump -Fc` com a URL pública, de um terminal seu).
3. **Login with Railway:** no workspace, *Settings → Developer → New OAuth App*. Nome livre. **URI de redirecionamento, exatamente:** `https://admin.useorigens.com.br/admin/auth/callback`. Copiar Client ID e Secret **direto** para o Railway (`RAILWAY_OAUTH_CLIENT_ID`, `RAILWAY_OAUTH_CLIENT_SECRET`); o secret só aparece uma vez. Escopos usados pelo app: apenas `openid email profile`.
4. **Storage Bucket:** criar **um** bucket no projeto (região próxima ao serviço). Custo documentado pelo Railway: US$ 0,015 por GB-mês; operações S3 e egress do bucket sem cobrança. Referenciar suas variáveis no serviço da loja (tabela acima). O bucket é **privado**; não há domínio público de mídia.
5. **Domínio do admin:** no serviço da loja, *Settings → Networking → Custom Domain*: `admin.useorigens.com.br`. O Railway mostra o **CNAME** e um **TXT** de verificação; criá-los no **DNS que hoje hospeda o domínio** (sem mover nameservers e sem tocar no domínio raiz). Aguardar o certificado.
6. **Segredo de sessão:** gerar no seu terminal e colar no Railway como `ADMIN_SESSION_SECRET`.
7. Preencher `ADMIN_HOST` e `ADMIN_OWNER_EMAIL`.

## 3. Verificação antes de ligar (somente leitura)

```bash
railway run npm run db:status      # o que já está aplicado
railway run npm run db:migrate     # aplica o que falta (idempotente; nunca roda sozinho em build/deploy)
railway run npm run cms:check      # variáveis, redirect URI, banco, bucket, Volume, INK: só nomes e OK/FAIL
```

`db:migrate` conecta do seu computador: use a URL **pública** do Postgres nesse comando (a interna só existe dentro do projeto), ou rode o mesmo comando dentro do serviço. `cms:check` testa o bucket com uma leitura (HEAD) de um objeto inexistente: não grava nem apaga nada.

## 4. Rollout controlado

| # | Passo | Como saber que deu certo | Voltar atrás |
|---|---|---|---|
| 0 | (Opcional, release separada) banners WebP: `git checkout -b release/webp-banners main && git cherry-pick 150db18` (conflito trivial: `scripts/repro-image-optimizer-hang.mts`). Não fazer sem aprovação. | home igual; `/banners/sul/*-640.webp` respondem 200 | rollback normal |
| 1 | Deploy da branch do CMS **sem** as variáveis do admin | `/admin` 404 em todos os hosts; home idêntica; `/api/ready` ok | rollback normal |
| 2 | Provisionar (seção 2): Postgres, OAuth App, bucket, domínio | — | remover as variáveis desliga o admin (404) |
| 3 | `db:migrate` e `cms:check` | `CMS READY` | `db:migrate` é aditivo |
| 4 | Adicionar as variáveis do admin (redeploy) | `https://admin…/admin` leva ao login; a loja segue igual | apagar `ADMIN_HOST` |
| 5 | Entrar como owner; **Coleções → Sincronizar coleções agora** (≈ 4 leituras na INK) | Biblioteca mostra a data | dados anteriores mantidos em qualquer falha |
| 6 | **Pessoas**: cadastrar editores (Sul) | editor entra e vê só o que pode | remover acesso |
| 7 | Enviar **uma** imagem de teste; conferir que `GET /media/…` da loja dá 404 enquanto não publicada | `/media/…` = 404 antes de publicar; a imagem aparece na Mídia do painel | — |
| 8 | Editar e **Publicar** com `SITE_CONFIG_HOME` **off** (a loja não muda) | "Coerente"; `published.json` no Volume (`site-config/`) | Restaurar versão |
| 9 | Pré-visualizar 375/desktop; smoke: `/sul`, busca, cidade, `/api/ready`, `/media/` inválido = 404 | tudo 200/404 esperados | descartar rascunho |
| 10 | Ligar `SITE_CONFIG_HOME=on` (redeploy) **só depois** da conferência visual | `/sul` mostra a versão publicada; consentimento e PageView Meta/GA4 depois do aceite | **desligar a flag** (a loja volta ao seed) ou **Restaurar versão** |
| 11 | (Separado, autorização própria) IDs de tracking regionais diferentes | — | restaurar versão |

Rollback rápido, do mais rápido ao mais lento: `SITE_CONFIG_HOME` → vazio; **Restaurar versão** no painel (nova release, histórico preservado); remover `ADMIN_HOST` (fecha o painel); rollback do deploy.

## 5. Login with Railway: detalhes que importam

- Provedor de identidade apenas. Endpoints por discovery (`https://backboard.railway.com/oauth/.well-known/openid-configuration`, com os URLs documentados como reserva). ID token **ES256**; verificamos assinatura, `iss`, `aud`, `exp`, `iat`, `nonce`; PKCE S256; autenticação do cliente por HTTP Basic.
- Quem pode entrar é decidido pela **tabela de pessoas no PostgreSQL**, nunca pelo Railway. A conta é vinculada ao usuário pelo `sub` (imutável) no primeiro login; outra conta com o mesmo e-mail é recusada.
- **E-mail verificado:** só aceitamos e-mail que o Railway declare verificado. Se o Railway não trouxer essa informação para a conta do owner, o painel recusa e mostra na tela o **identificador da conta**; coloque-o em `ADMIN_OWNER_RAILWAY_SUB` e entre de novo (procedimento controlado, sem confiar em e-mail).
- O CMS **não** guarda tokens do Railway (só o `sub`, e-mail e nome). A sessão do painel é própria (cookie `__Host-`, `Secure`, `HttpOnly`, `SameSite=Lax`, 12 h absolutas / 2 h de inatividade, token só como hash no banco).

## 6. Imagens: como funcionam

- O upload passa pelo serviço: validação pelo formato real (PNG/JPEG/WebP/AVIF), ≤ 8 MB, ≤ 6000 px, sem animação, orientação aplicada, metadados removidos, WebP em 640/1080/1600/2400. Só as variantes processadas vão ao bucket, com nome por hash do conteúdo (`media/<sha256>/<largura>.webp`): imutáveis.
- O bucket é privado. Imagens **publicadas** saem por `GET /media/<sha256>/<largura>.webp` na própria loja: só chaves listadas no `published.json` (local), formato estrito, `Cache-Control: public, max-age=31536000, immutable`, `nosniff`, cache em memória. Imagens de **rascunho** só por `/admin/media/…` (com sessão). Nenhuma URL do bucket chega ao navegador.
- A loja **não** depende do bucket nem do banco para renderizar; se o bucket falhar, a seção usa a cor/gradiente de fallback. As páginas nunca leem o PostgreSQL.
- O app **nunca apaga** objetos do bucket (o "restaurar" precisa deles). Limpeza é manual e deliberada.
- **Custo:** o tráfego de `/media` passa pelo serviço e pode gerar egress **do serviço** (o do bucket é gratuito). Não há CDN. Os arquivos são pequenos e cacheáveis por um ano no navegador; medir depois do tráfego real. Estimativa, não orçamento.

## 7. O que o sistema garante sozinho

- **Publicar é atômico e reconciliável:** registro `pending` no banco → arquivo (temp + rename no Volume) → `live` → invalida cache. Falha em qualquer ponto mantém a versão anterior; o reconciliador refaz o arquivo a partir do banco (também ~15 s depois de cada inicialização, útil se o Volume for recriado).
- **Tracking:** sem configuração publicada (ou com a flag desligada) o comportamento é exatamente o de hoje (`NEXT_PUBLIC_*`). Publicar é bloqueado se os IDs do documento diferirem dos do build.
- **Sincronizações** só leem a INK (GET), uma por vez (trava no banco), e nunca apagam o último arquivo bom.
