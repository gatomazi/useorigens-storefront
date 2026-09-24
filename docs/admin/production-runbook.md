# CMS em produção: variáveis, provisionamento e rollout

Guia operacional curto. O relatório da rodada (`cms-v1-round6.md`) diz o que foi construído e testado; este arquivo diz **o que fazer, em que ordem**.

**Regra de ouro:** enquanto qualquer variável do admin faltar, `/admin` responde 404 e a loja não muda. Os passos abaixo só ligam coisas; nenhum deles altera a home antes do passo 10.

## 1. Variáveis (no serviço único do Railway)

Nomes apenas. Valores secretos vão direto no painel do Railway/Google/Cloudflare, nunca no chat, no Git ou em log.

| Variável | Obrigatória | Para quê |
|---|---|---|
| `ADMIN_HOST` | sim | host do painel, sem `https://` (ex.: `admin.useorigens.com.br`) |
| `ADMIN_OWNER_EMAIL` | sim | e-mail Google do primeiro owner (criado no primeiro login) |
| `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` | sim | cliente OAuth (tipo Web) |
| `ADMIN_SESSION_SECRET` | sim | ≥ 32 caracteres aleatórios; assina o cookie de login |
| `DATABASE_URL` | sim | Postgres (referência de serviço do Railway) |
| `DATABASE_SSL` | não | `require` se a URL for pública com TLS |
| `DATABASE_POOL_MAX` | não | padrão 4 |
| `R2_ENDPOINT`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | para enviar imagens | R2 (S3 compatível) |
| `MEDIA_PUBLIC_BASE_URL` | para enviar imagens | `https://media.useorigens.com.br` |
| `SITE_CONFIG_HOME` | **desligado** | só vira `on` no passo 10 |
| `INK_TOKEN_*`, `ADMIN_SYNC_TOKEN` | já existem | usados pelos botões de sincronização |

`ADMIN_DEV_MODE` **não** deve existir em produção (é ignorada, mas remova). O admin só fica ligado com o conjunto obrigatório completo e só responde no `ADMIN_HOST`.

## 2. Ordem do proprietário (o que só você pode fazer)

1. **Escolher o e-mail do owner** (conta Google que vai administrar) → `ADMIN_OWNER_EMAIL`.
2. **Railway → Postgres** no mesmo projeto. Referenciar a URL no serviço da loja como `DATABASE_URL`. (Custo estimado, não verificado: poucos dólares por mês. Confirmar no painel antes de aprovar.)
3. **Google Cloud Console → Credenciais → ID do cliente OAuth → Aplicativo da Web.** Origem autorizada: `https://admin.useorigens.com.br`. **URI de redirecionamento autorizada, exatamente:** `https://admin.useorigens.com.br/admin/auth/callback`. Tela de consentimento: *Interna* se a conta for Google Workspace; senão *Externa* em modo de teste, com o e-mail do owner (e dos editores) como usuários de teste. Copiar Client ID e Secret **direto** para as variáveis do Railway.
4. **Cloudflare R2:** criar o bucket; criar um token de API restrito a esse bucket (leitura e escrita de objetos); anotar Access Key ID, Secret e o endpoint `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`; ligar o domínio público `media.useorigens.com.br` ao bucket. **Pergunta em aberto:** onde está o DNS de `useorigens.com.br`? O domínio customizado do R2 exige a zona no Cloudflare. Se o DNS está em outro provedor, decidir entre mover a zona ou delegar só `media.` para o Cloudflare. Sem isso, o envio de imagens fica desligado e o resto do CMS funciona com os banners do projeto.
5. **DNS do admin:** no Railway, adicionar `admin.useorigens.com.br` como domínio do serviço (ele mostra o alvo do CNAME); criar o registro no seu DNS; aguardar o certificado.
6. **Gerar o segredo de sessão** no seu terminal (`openssl rand -base64 48`) e colar no Railway como `ADMIN_SESSION_SECRET`.
7. Preencher as demais variáveis da tabela acima (`ADMIN_HOST`, `R2_*`, `MEDIA_PUBLIC_BASE_URL`).

## 3. Verificação antes de ligar (somente leitura)

```bash
railway run npm run db:status      # o que já está aplicado
railway run npm run db:migrate     # aplica o que falta (idempotente; nunca roda sozinho em build/deploy)
railway run npm run cms:check      # variáveis, banco, R2, Volume, INK — só nomes e OK/FAIL, nunca valores
```

`db:migrate` conecta do seu computador: use a URL **pública** do Postgres do Railway nesse comando (a interna `*.railway.internal` só existe dentro do projeto). Alternativa: rodar o mesmo comando dentro do serviço.

## 4. Rollout controlado

| # | Passo | Como saber que deu certo | Voltar atrás |
|---|---|---|---|
| 0 | (Opcional, release separada) banners WebP: `git checkout -b release/webp-banners main && git cherry-pick 150db18` (único conflito: remover `scripts/repro-image-optimizer-hang.mts`). Deploy normal. | home igual; imagens `/banners/sul/*-640.webp` respondem 200 | rollback normal do Railway |
| 1 | Deploy da branch do CMS **sem** as variáveis do admin | `/admin` 404 em todos os hosts; home idêntica; `/api/ready` ok | rollback normal |
| 2 | Provisionar Postgres, Google, R2, DNS (seção 2) | — | remover as variáveis desliga o admin (404) |
| 3 | `db:migrate` e `cms:check` | `CMS READY` | `db:migrate` é aditivo; nada a desfazer |
| 4 | Adicionar as variáveis do admin (redeploy) | `https://admin…/admin` leva ao login; a loja segue igual | apagar `ADMIN_HOST` |
| 5 | Entrar como owner; **Coleções → Sincronizar coleções agora** (≈ 4 leituras na INK) | Biblioteca mostra data da sincronização | os dados anteriores são mantidos em qualquer falha |
| 6 | **Pessoas**: cadastrar editores (Sul) | editor entra e vê só o que pode | remover acesso |
| 7 | Editar e **Publicar** com `SITE_CONFIG_HOME` ainda **off** | Publicar → "Coerente"; a loja **não** muda (a flag está desligada) | Restaurar versão |
| 8 | Pré-visualizar 375/desktop; conferir seções | igual ao esperado | descartar rascunho |
| 9 | Smoke: `curl` de `/sul`, `/api/ready`; conferir `published.json` no Volume (`site-config/`) | 200; `releaseId` = o da tela | — |
| 10 | Ligar `SITE_CONFIG_HOME=on` (redeploy) | `/sul` mostra a versão publicada; conferir consentimento e um PageView Meta/GA4 depois do aceite | **desligar a flag** (a loja volta ao seed em segundos) ou **Restaurar versão** |

Rollback rápido, em ordem de velocidade: (1) `SITE_CONFIG_HOME` → vazio; (2) **Restaurar versão** no painel (nova release, histórico preservado); (3) remover `ADMIN_HOST` (fecha o painel; a loja segue como está); (4) rollback do deploy.

## 5. O que o sistema garante sozinho

- **A loja nunca depende do banco ou do R2** para renderizar: lê `published.json` (Volume) ou o seed embutido; arquivo ausente/corrompido → seed.
- **Publicar é atômico e reconciliável**: registro `pending` no banco → arquivo (temp + rename) → `live` → invalida cache. Falha em qualquer ponto mantém a versão anterior; um reconciliador refaz o arquivo a partir do banco (também ~15 s depois de cada inicialização, útil quando o Volume é recriado).
- **Imagens publicadas nunca somem**: o app não apaga objetos do R2; "remover" só esconde da biblioteca, e é recusado se alguma versão (inclusive restaurável) ou rascunho usa o arquivo.
- **Tracking**: sem configuração publicada (ou com a flag desligada) o comportamento é exatamente o de hoje (`NEXT_PUBLIC_*`). Publicar é bloqueado se os IDs do documento diferirem dos IDs do build.
- **Sincronizações** só leem a INK (GET), uma por vez (trava no banco), nunca apagam o último bom arquivo.
