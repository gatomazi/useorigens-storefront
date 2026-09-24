# CMS operacional do storefront — plano da V1 (Fase 2)

- Status: **proposta para revisão — nada implementado**. Sem código, banco, storage, migração, commit, push ou deploy.
- Branch de trabalho: `feature/storefront-admin`, criada localmente a partir de `main` = `origin/main` = `678c26a`.
- Origem: `CLAUDE_ENCERRAR_FASE1_INICIAR_CMS_POS_BUSCA (1).md`.
- Escopo: home do Sul, tracking por região e a fundação de Norte / Centro-Oeste / Global. Páginas de estado, cidade e PDP continuam em código (§9, D8).

---

## 0. Ponto de partida verificado

| Item | Resultado |
|---|---|
| `main` local vs `origin/main` | idênticos, `678c26a` (0 ahead / 0 behind, após `git fetch`) |
| Fix da busca `678c26a` | ancestral de `origin/main` |
| Railway | projeto `useorigens`, ambiente `production`, serviço `useorigens-storefront` (deploy `SUCCESS`, 1 réplica) |
| Domínios | `useorigens.com.br`, `www.useorigens.com.br`, `*.up.railway.app` |
| Volume | `useorigens-storefront-volume` em `/app/data/generated`, 87 MB / 5000 MB |
| Working tree | só untracked pré-existente: `docs/design/lighthouse/2026-09-23/`, `docs/screenshots/2026-09-23/`. Preservado, não tocado |
| Outros serviços Railway | **nenhum** (sem Postgres, Redis ou bucket) |

Variáveis do serviço (só nomes; valores não lidos): `ADMIN_SYNC_TOKEN`, `INK_TOKEN_SUL`, `NEXT_PUBLIC_GA_MEASUREMENT_ID`, `NEXT_PUBLIC_META_PIXEL_ID`, mais as `RAILWAY_*`. Só `INK_TOKEN_SUL` está definido em produção; Norte e Centro-Oeste não têm token no serviço.

---

## 1. Auditoria

### 1.1 Stack e infraestrutura

- **Next.js 16.3.5 / React 19.2.8**, App Router, `next start` em instância única. A versão tem breaking changes; li os guias em `node_modules/next/dist/docs/` (revalidação, draft mode, self-hosting, autenticação) antes de decidir.
  - `middleware` virou **`proxy.ts`** (Node runtime). Já existe em `src/proxy.ts`: devolve 503 enquanto o catálogo não está pronto e põe `noindex` em host não canônico.
  - O guia de autenticação do Next manda **verificar sessão e papel em cada Server Action e route handler** (Data Access Layer); o proxy só serve para checagem otimista e redirect.
  - Cache Components (`'use cache'`) **não** está habilitado. O storefront usa ISR clássico (`revalidate = 3600`) e `revalidatePath("/[region]", "layout")` após o sync. O plano mantém esse mecanismo.
- **Instância única por construção**: Railway não permite réplicas em serviço com Volume (`docs/deploy/railway.md`). Consequência para o CMS: o cache ISR em disco é local e consistente, mas quem escreve no Volume precisa estar **no mesmo serviço**.
- **Sem dependências de backend**: `package.json` só tem `next`, `react`, `react-dom`, `embla-carousel-react`, `server-only`. `sharp` e `zod` existem em `node_modules` só como transitivas. Precisam ser declaradas se usadas.
- **Regra de rede em runtime**: `tests/unit/infra.test.ts` e `tests/e2e/infra.spec.ts` provam que nenhuma página faz chamada de rede ou de INK ao servir. O CMS não pode quebrar isso. A vitrine lê **um arquivo local**, nunca banco.

### 1.2 Snapshot INK (o que realmente existe)

`data/generated/catalog-snapshot.json` (8 MB local; o do Volume tem o mesmo formato):

| Loja | produtos | bindings (cidades) | merch | excluídos |
|---|---|---|---|---|
| use-sul | 9.834 | 9.531 | 244 | 59 |
| use-norte | 3.646 | 3.584 | 60 | 2 |
| use-centro | 3.914 | 3.829 | 81 | 4 |

Limitações registradas:

1. **O snapshot não tem categorias nem coleções.** `MerchProduct` guarda id, nome, slug, url, imagem, preço e `totalSalesCount`. `tags` são lidas em `parse.ts` e descartadas. Hoje as curadorias vivem **em código** (`src/lib/editorial/*.ts`) e os "Ver todos" são URLs fixas verificadas à mão (`collections.ts`).
2. **A INK expõe coleções**, mas o sync não as consome. `GET /v1/stores/collections` (escopo `store.categories.read`) devolve `id, name, slug, position, is_available, product_ids[], kit_ids[]`. Fonte: `developers.reserva.ink/llms-full.txt`.
   - **Não sei se os tokens atuais têm esse escopo.** Verificar exige um GET real (D6). Não fiz nesta rodada.
   - O sync usa só `/v1/stores/products`.
3. Uma categoria pode conter produtos que o indexador classifica como *binding de cidade* (não merch). O lookup por `inkProductId` precisa cobrir merch **e** bindings.
4. **Vendas**: `totalSalesCount` é acumulado, sem período. A vitrine `sales` da INK também não declara período. **Nenhum "mais vendidos" público na V1.** Ordenação por vendas fica só como critério interno do admin, rotulado como "vendas acumuladas".
5. `createdAt` existe em `InkProductNormalized` mas **não** é persistido em `MerchProduct`. "Novidades" exigiria estender o índice.
6. Produtos podem ficar indisponíveis entre syncs. Seções por categoria já devem esconder-se se ficarem vazias, como faz `home.terra.length > 0 &&` hoje.

### 1.3 Componentes da home Sul (o que o CMS precisa reproduzir)

Ordem real em `src/app/[region]/page.tsx`, igual à ordem pedida:

| # | Âncora (DOM id) | Componente | Fundo | Fonte de dados hoje |
|---|---|---|---|---|
| 1 | `hero-title` | `RegionHero` | foto `hero-{mobile,desktop}.png`, foco `30% 35%`, wash `regional-wash`, `priority` (LCP) | `HERO_FAMILIES` (trio de camisetas) |
| 2 | `estilos` | `FamilyGrid` | sem imagem | cidade vitrine `SHOWCASE.sul.hero` (sc/florianopolis) |
| 3 | `terra` | `ProductCarousel` (paper) | sem imagem | `editorial/terra.ts` |
| 4 | `estados` | `StateCards` | sem imagem | `mesoGroupsOfState`, `state-lines.ts` |
| 5 | `redesenhos` | `ProductCarousel poster` (paper) | sem imagem | `editorial/recreations.ts` |
| 6 | `feito-para-voce` | `ProductCarousel` | sem imagem | `editorial/lenda.ts` |
| 7 | `fala` | `ProductCarousel tone=dark` | foto `fala-daqui-*.png`, wash `regional-wash-primary`, base `bg-region-primary` | `editorial/dizeres.ts` + lore |
| 8 | `geografia` | `ProductCarousel` | **sem imagem por decisão** (ADR 0003) | `editorial/ddd.ts` |
| 9 | `origem` | `Campaign` | foto `campaign-*.png`, wash `regional-wash-dark`, base `#0a0c0a`. Sem foto: recortes de camiseta (`crops`) | `campaignCrops` |
| 10 | — | `Footer` (via `RegionLayout`) | — | `catalog.syncedAt` |

Fatos que moldam o desenho:

- **Textos (títulos, intros, CTAs) estão hardcoded** nas páginas e nos componentes. O CMS precisa de um valor inicial idêntico para cada um.
- Os banners já são **fundo da própria seção** (`RegionalPhotoSection`, ADR 0003). O CMS só parametriza esse mecanismo. Imagens hoje são PNGs em `/public/banners/sul/`.
- As classes de wash (`regional-wash*`) e `settle-*` estão em `globals.css`. Sobreposição configurável precisa ter **presets que apontam para essas classes**, senão a migração muda pixels.
- Tracking: `MetaPixel.tsx` e `GoogleAnalytics.tsx` são os **únicos** leitores dos IDs (`public-env.ts` → `NEXT_PUBLIC_*`, **inline no build**). Os helpers de evento (`track.ts`, `TrackedInkLink`, etc.) não referenciam ID. Ambos os componentes já renderizam `null` sem consentimento (nada no DOM, nenhuma requisição).
- **Consequência crítica**: com `NEXT_PUBLIC_*` o ID muda só com novo build e deploy. O CMS tem de passar o ID **por props vindas do layout do servidor**.
- `RegionLayout` monta `MetaPixel` + `GoogleAnalytics` uma vez por segmento `[region]`. Navegar entre regiões por link soft faria o segmento remontar e reinicializar o SDK. O plano trata isso em §2.6.
- `ENABLED_REGIONS = ["sul"]`: Norte e Centro-Oeste ainda dão 404 no storefront.
- `proxy.ts`: o matcher exclui `/api` mas cobre todo o resto. **`/admin` cairia no 503 do gate de catálogo e receberia `noindex` só por host.** Precisa de tratamento próprio (§2.4).

### 1.4 O que falta e o que já ajuda

| Necessidade | Existe? | Observação |
|---|---|---|
| Persistência durável | Volume (single-instance) | Compartilhado com o catálogo |
| Escrita atômica de arquivo + leitura cacheada por mtime | **Sim** (`snapshot-file.ts`) | Padrão a reaproveitar |
| Job assíncrono + lock em memória | **Sim** (`sync-job.ts`, `after()`) | Válido em instância única |
| Invalidação ISR pós-mudança | **Sim** (`revalidatePath` na rota de sync) | Reaproveitar |
| Auth de admin | Só Bearer estático (`ADMIN_SYNC_TOKEN`) | Insuficiente para usuários humanos |
| Banco, object storage/CDN | **Não** | Ver §5 |
| Allowlist de destinos | `ALLOWED_COMMERCE_HOSTS` (`ink/config.ts`) | Reaproveitar para CTAs |
| Playwright + screenshots | **Sim** (`playwright.config.ts`, `scripts/screenshots.mts`) | Base do gate visual |

---

## 2. Arquitetura proposta

### 2.1 Visão geral

```
                      ┌────────────────────── Railway: serviço useorigens-storefront (1 instância) ──────────────────────┐
 Visitante ──HTTPS──▶ │  /[region]/**  (ISR)        ──lê──▶  Volume: site-config/published.json   (arquivo, mtime-cache) │
 (www.)               │        ▲                                Volume: catalog-snapshot.json      (já existe)           │
                      │        │ revalidatePath                                                                             │
 Editor ──HTTPS──▶    │  /admin/**  (Server Actions,   ──SQL──▶  Postgres (novo): rascunhos, releases, usuários, audit,   │
 (admin host)         │   route handlers, DAL c/ RBAC)           metadados de mídia                                          │
                      │        │                                                                                            │
                      │        └──upload validado──▶  Object storage/CDN (novo): originais + variantes  ◀── <img> via CDN   │
                      └─────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

Princípios:

1. **A vitrine nunca consulta o banco.** Lê `published.json` no Volume (cache em memória por mtime, como o catálogo). Se o arquivo faltar, cai no **seed embutido no código** (§7). O banco pode estar fora do ar e o site continua igual.
2. **Um lugar só para a verdade editável**: Postgres (rascunho, releases, auditoria). O arquivo publicado é uma projeção derivada dele.
3. **Admin e storefront no mesmo processo** (motivo: só o serviço dono do Volume escreve `published.json`). Isolamento por **fronteira de código**, não por processo (§2.2).
4. **Nada de HTML/markdown livre, nenhum page builder.** O admin escolhe entre templates e layouts pré-definidos (§6).

### 2.2 Fronteiras de código

```
src/
  app/
    [region]/…                   # storefront (existente)
    admin/…                      # painel (novo) — route group próprio, layout próprio, sem chrome do storefront
  lib/
    site-config/                 # CONTRATO compartilhado (novo, sem server-only quando puro)
      schema.ts                  #   tipos + validação dos documentos
      resolve.ts                 #   herança/override/fallback (puro, 100% testável)
      seed.ts                    #   config inicial idêntica à home atual (§7)
      published.ts               #   leitor do arquivo publicado (server-only)
  admin/                         # DOMÍNIO do painel (novo, server-only): db, auth/DAL, drafts, releases, media, audit
```

Regras de import (aplicadas por regra de lint):

- `lib/site-config/*` **não importa** `admin/*`. É o único ponto de contato do storefront.
- `admin/*` pode importar `lib/catalog` (somente leitura), `lib/geo`, `lib/site-config`.
- O storefront **não importa** `admin/*`, nem cliente de banco, nem cliente de storage.
- Se um dia o admin virar serviço separado, a costura é `getPublishedConfig()` (D4 discute).

**Por que no mesmo app e não em serviço à parte**:

| Critério | Mesmo app (recomendado) | Serviço admin separado |
|---|---|---|
| Escrita do arquivo publicado no Volume | direta, atômica | impossível (Volume só anexa a 1 serviço). Exigiria API interna ou storefront lendo banco/objeto em runtime |
| Serviços novos | 0 (só Postgres + storage) | +1 |
| Blast radius de bug do admin | mesmo processo. **Mitigação**: rotas isoladas, limite de corpo, sem estado global mutável, testes de que o storefront serve sem `DATABASE_URL` | isolado |
| Deploy | 1 pipeline | 2 |
| Dependência de rede da vitrine | nenhuma | banco/objeto no caminho de render |

### 2.3 Fluxo Draft → Preview → Publish

1. **Editar**: o editor altera `config_draft` do escopo (uma linha JSONB por escopo). Cada save leva `rev`; conflito devolve 409 (§2.5).
2. **Preview**: rota `/admin/preview/[scope]`, renderizada no servidor a partir do rascunho.
   - `dynamic`, `noindex`, `no-store`, exige sessão e papel a cada requisição.
   - Usa os **mesmos componentes** e o mesmo compositor de seções que a home pública (`HomeSections`). Só muda a origem da config.
   - **Não monta `MetaPixel`/`GoogleAnalytics`**: preview nunca polui analytics.
   - O editor mostra dois iframes reais, **375 px** e **1280 px**.
   - Draft Mode do Next foi descartado (§2.7).
3. **Validar** ("publicável"): schema, mídia `ready`, destinos permitidos, categorias existentes no snapshot, hero ativo e nenhum conflito. Erros bloqueiam. Avisos (contraste, seção sem produtos, dimensão abaixo do mínimo) não bloqueiam.
4. **Publicar** (atômico):
   1. transação Postgres; `SELECT … FOR UPDATE` em `release_head`; compõe o bundle = release atual com os escopos publicados substituídos; calcula `checksum`;
   2. insere `release` (`kind=publish`);
   3. escreve `site-config/published.json.tmp` no Volume e faz `rename` (mesmo padrão de `writeSnapshot`); guarda o anterior como `published.prev.json`;
   4. atualiza `release_head` (com `file_checksum`) e faz **commit**;
   5. `revalidatePath("/[region]", "layout")` (mesmo comando do sync), só depois do commit;
   6. grava `audit_log`.
   - Falha em (1)–(3): rollback da transação, nada muda, a vitrine segue na versão anterior.
   - Falha em (4)–(5): o arquivo está à frente do banco. O overview mostra **drift** com botão "reaplicar release atual". O boot também reconcilia (§2.8).
5. **Rollback**: escolher release anterior → novo `release` (`kind=rollback`) com o bundle antigo → mesmo passo 4. Nunca apaga histórico.

### 2.4 Cache e invalidação

- A vitrine continua com `revalidate = 3600` como rede de segurança. A invalidação real é `revalidatePath` **depois** de arquivo válido e commit feito.
- `published.ts` cacheia por mtime. Arquivo corrompido ou inválido pelo schema → **mantém a última config válida em memória** e loga erro; no primeiro boot sem última válida usa o seed. Nunca quebra a página.
- Mudança de tracking: `RegionLayout` (ISR) recebe o ID publicado. `revalidatePath` do layout regenera o HTML que o carrega.
- Mídia: chaves **endereçadas por hash** (`media/<sha256>/<variante>.webp`), `Cache-Control: public, max-age=31536000, immutable`. Substituir imagem = novo hash + nova publicação. Nada de purge.
- `next/image` continua como otimizador. O host da mídia entra em `images.remotePatterns` (mudança de `next.config.ts` na etapa de mídia).
- Para `/admin`: `Cache-Control: no-store` e `X-Robots-Tag: noindex, nofollow`.
- **`proxy.ts` precisa mudar** (etapa S5): excluir `/admin` do gate 503 de catálogo. O admin precisa funcionar justamente quando o catálogo está ausente, senão não dá para diagnosticar.

### 2.5 Concorrência de edição

- Lock otimista: `config_draft.rev`. `PATCH` exige `If-Match: rev`; divergência → 409 com a versão atual e o autor da última mudança.
- Presença leve: "Fulano editou há 40 s" (via `updated_by/updated_at`), sem websocket.
- Autosave com debounce de 3 s usando o mesmo `rev`.
- Merge campo a campo **fora da V1**: conflito real se resolve escolhendo "manter minha versão" ou "carregar a dele".
- Publicação serializa em `release_head FOR UPDATE`. Duas publicações simultâneas nunca se sobrescrevem.

### 2.6 Tracking dinâmico sem deploy

Resolução (função pura em `resolve.ts`):

```
effective(vendor, scope):
  s = doc[scope].tracking[vendor]
  s.mode = 'override'  → s.id
  s.mode = 'disabled'  → null
  s.mode = 'inherit'   → doc.global.tracking[vendor] (override→id, disabled→null)
```

Sem config publicada (arquivo ausente), fallback para `process.env.NEXT_PUBLIC_*` atual. **Comportamento de hoje preservado.**

Mudanças de código, todas pequenas (etapa S3):

- `RegionLayout` resolve `{ metaPixelId, ga4Id }` do escopo e passa por **props** para `<MetaPixel pixelId>` e `<GoogleAnalytics measurementId>`. `public-env.ts` deixa de ser lido pelos componentes (fica como fallback do servidor).
- IDs validados no publicar com as regexes existentes (`validateMetaPixelId`: `^\d{10,20}$`; `validateGaMeasurementId`: `^G-[A-Z0-9]{4,20}$`).

Garantias:

| Requisito | Mecanismo |
|---|---|
| Nenhum evento antes do consentimento | inalterado: ambos os componentes retornam `null` sem `record.choice === "accepted"`. Teste novo cobre **todos os modos** (override, inherit, disabled) com interceptação de rede |
| Sem script/evento duplicado ao trocar de região | 1 ID por documento. Troca de região por link vira **navegação completa** (`<a>`, não soft-nav), então cada documento inicializa o SDK uma vez. Defesa extra: se `window.fbq`/`gtag` já foi inicializado com **outro** ID, não inicializa de novo e registra aviso (dev) |
| Mudar ID ≠ mudar código | publicar → arquivo → `revalidatePath` |
| Preservar Sul | Sul = `override` com os IDs atuais em produção (mesmos valores das envs); Global começa `disabled` |
| Consentimento | `CONSENT_VERSION` continua `2`. Trocar **ID** não muda o que o "aceito" cobre. Adicionar **fornecedor** novo exigiria bump (regra registrada no admin) |

Fora da V1: pixel/GA4 **aditivos** (regional + global juntos). Ver D5.

### 2.7 Por que não Draft Mode do Next para o preview

Draft Mode (cookie) faz a rota pública ficar `private, no-store` e re-renderizar. Serve a CMS headless externo. Aqui admin e vitrine são o mesmo app, então uma **rota de preview dedicada** é mais simples e **não pode vazar rascunho por cache**: nunca passa pelo cache ISR. O custo é extrair um `HomeSections` compartilhado. Isso já é necessário para renderizar a home a partir da config.

### 2.8 Autoreparo e observabilidade

- Boot (`instrumentation.ts`, já loga o caminho do snapshot): se `published.json` faltar e o banco estiver acessível, **reidrata do `release_head`**. Se não estiver, usa o seed e sinaliza no `/api/ready` (campo informativo, sem quebrar readiness da vitrine).
- Perda do Volume não pode reverter edições em silêncio para o seed. Por isso o autoreparo e o aviso de drift existem.
- `/api/ready` **não passa a depender do banco**.

---

## 3. Modelo de dados mínimo

SQL ilustrativo; o DDL final e as migrações saem na etapa S5.

```sql
-- Usuários e papéis. Sessões ficam nas tabelas da biblioteca de auth escolhida (D3).
create table admin_user (
  id text primary key,                          -- ULID
  email text not null unique,                   -- allowlist: só entra quem está aqui
  name text,
  role text not null check (role in ('owner','editor')),
  scopes text[] not null default '{}',          -- editor: ['sul'] etc. owner ignora
  active boolean not null default true,
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);

-- Um rascunho por escopo (global, sul, norte, centro-oeste).
create table config_draft (
  scope text primary key check (scope in ('global','sul','norte','centro-oeste')),
  doc jsonb not null,                           -- ScopeDoc (§3.1)
  rev integer not null default 1,               -- lock otimista
  base_release_id bigint,                       -- release sobre a qual o rascunho foi criado
  updated_by text references admin_user(id),
  updated_at timestamptz not null default now()
);

-- Release = bundle completo, imutável. Rollback = republicar um antigo.
create table release (
  id bigserial primary key,
  parent_id bigint references release(id),
  kind text not null check (kind in ('seed','publish','rollback')),
  bundle jsonb not null,                        -- { global, sul, norte, centro-oeste } — dezenas de KB
  checksum text not null,
  scopes_changed text[] not null,
  note text,
  created_by text references admin_user(id),
  created_at timestamptz not null default now()
);

create table release_head (
  singleton boolean primary key default true check (singleton),
  release_id bigint not null references release(id),
  file_checksum text,                           -- do published.json escrito; detecta drift
  updated_at timestamptz not null default now()
);

create table media_asset (
  id text primary key,                          -- ULID
  sha256 text not null unique,                  -- dedupe + chave endereçada por hash
  kind text not null check (kind in ('upload','legacy-public')),
  original_key text,                            -- objeto privado; legacy-public usa public_path
  public_path text,                             -- ex.: /banners/sul/hero-mobile.png (migração)
  mime text not null, bytes integer not null,
  width integer not null, height integer not null,
  avg_luminance real,                           -- 0..1, para aviso de contraste
  variants jsonb not null default '[]',         -- [{w, format, key}]
  status text not null check (status in ('processing','ready','rejected')),
  reject_reason text,
  created_by text references admin_user(id),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table audit_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  actor text not null,                          -- admin_user.id
  action text not null,                         -- 'draft.save','publish','rollback','media.upload','login','user.change'
  scope text, target text,
  meta jsonb                                    -- sem segredos, sem PII além do e-mail do ator
);
```

**O que fica de fora do banco, de propósito**: token INK, `ADMIN_SYNC_TOKEN`, catálogo, categorias e contagens. Continuam em env e no snapshot. **Alt text e metadados de imagem por uso** ficam no documento da seção, não em `media_asset`, porque o mesmo arquivo pode ter alts diferentes.

### 3.1 Documento por escopo (`ScopeDoc`, `schemaVersion: 1`)

```ts
type Scope = "global" | "sul" | "norte" | "centro-oeste";

type ScopeDoc = {
  schemaVersion: 1;
  scope: Scope;
  tracking: { meta: VendorSetting; ga4: VendorSetting };
  appearanceDefaults?: { fill: Fill };        // global e por região: fallback de fundo
  home?: { sections: Section[] };             // só regiões; global terá home da raiz numa fase futura
};

type VendorSetting =
  | { mode: "inherit" }                        // não permitido no escopo global
  | { mode: "override"; id: string }           // validado por regex do fornecedor
  | { mode: "disabled" };

type Section = {
  id: string;                                  // ULID, estável
  anchor: string;                              // DOM id atual (ex.: "terra"), ^[a-z0-9-]{1,32}$, único
  template: TemplateKey;                       // §6
  active: boolean;
  locked?: boolean;                            // hero e footer não se movem
  title?: string;                              // ≤ 80, texto puro
  subtitle?: string;                           // ≤ 200, texto puro
  cta?: { label: string; dest: Destination };  // label ≤ 32
  layout: Record<string, string | number>;     // chaves e valores pré-definidos por template
  source?: Source;                             // seções de catálogo
  appearance: Appearance;
};

type Destination =
  | { kind: "route"; path: string }                                     // validado contra rotas reais
  | { kind: "ink-collection"; store: CommerceStoreKey; collectionId: number }
  | { kind: "external"; url: string };                                  // https + host em ALLOWED_COMMERCE_HOSTS

type Source =
  | { kind: "editorial-module"; key: "terra" | "recreations" | "lenda" | "dizeres" | "ddd" }  // legado, só migração
  | { kind: "ink-category"; store: CommerceStoreKey; collectionId: number; order: "category" | "manual"; limit: number }
  | { kind: "manual"; productIds: string[]; limit: number };            // ids INK, ordem manual

type Appearance = {
  fill: Fill;                                  // SEMPRE presente: é o fallback
  image?: { mobile?: MediaRef; desktop?: MediaRef; reuseMobileOnDesktop?: boolean };
  focal: { mobile: Point; desktop: Point };    // 0..100 cada
  overlay:
    | { preset: "none" | "regional-wash" | "regional-wash-primary" | "regional-wash-dark" }
    | { color: string; opacity: number };      // 0..0.85 (teto para não zerar a imagem)
  text: { color: "auto" | string; accent?: string };
};
type Fill = { kind: "solid"; color: string } | { kind: "gradient"; from: string; to: string; angle: number };
type MediaRef = { assetId: string; alt: string; decorative: boolean };   // alt obrigatório se !decorative
```

Regras de validação comuns: cores `^#[0-9a-fA-F]{6}$`; textos renderizados como texto React (sem HTML); `path` só de rotas conhecidas (`/{region}`, `/{region}/{uf}`, `/{region}/{uf}/{city}`); IDs em ULID.

---

## 4. Sitemap e wireframes do painel

Desktop-first. Tela útil a partir de 1024 px. Abaixo disso o painel mostra somente leitura e o aviso "edite no desktop". **Preview** sempre em 375 e desktop.

```
/admin                         Visão geral
/admin/regioes                 Global · Sul · Norte · Centro-Oeste
/admin/tracking                (escopo selecionável)
/admin/secoes/[scope]          lista ordenável
/admin/secoes/[scope]/[id]     editor da seção
/admin/midia                   biblioteca
/admin/publicar                diff · preview · publicar · histórico · rollback
/admin/catalogo                estado do sync INK, cobertura, categorias
/admin/usuarios                (owner)
```

Cabeçalho fixo: seletor de escopo · estado ("Rascunho com 3 mudanças" / "Publicado") · botão Publicar.

### 4.1 Visão geral

```
┌ Visão geral ───────────────────────────────────────────────────────────────────┐
│ Sul  ● Publicado  release #12 · 22/09 14:03 · por gabriel      [Ver rascunho]   │
│ Norte ○ Rascunho vazio (storefront não publicado)                               │
│ Centro-Oeste ○ idem                                                             │
├─ Catálogo INK ────────────────┬─ Tracking efetivo ──────────────────────────────┤
│ use-sul     9.834 prod · sync 21/09 01:36  │ Sul   Meta ✔ 1558…052   GA4 ✔ G-8G…F77 │
│ use-norte   3.646 · sync 21/09 01:33       │ Norte Meta — (disabled) GA4 —          │
│ use-centro  3.914 · sync 21/09 01:33       │ Cobertura Sul: N cidades               │
│ [Sync em andamento? não]                   │                                        │
├─ Banners e seções ────────────┴─────────────────────────────────────────────────┤
│ Sul: 9 seções ativas · 3 com imagem · 0 avisos                                   │
│ ⚠ drift: published.json ≠ release #12   [Reaplicar release atual]   (se houver)  │
└──────────────────────────────────────────────────────────────────────────────────┘
```

Todos os números vêm de dados reais: snapshot (`productCount`, `syncedAt`), `coveredCityIds(region).size`, `release_head`, `currentSyncJob()`. Nenhum placeholder.

### 4.2 Regiões

```
┌ Regiões ────────────────────────────────────────────────────────────┐
│ Global        defaults de tracking e de aparência        [Abrir]    │
│ Sul           habilitada · herda Global: aparência       [Abrir]    │
│ Norte         desabilitada no storefront                  [Abrir]    │
│ Centro-Oeste  desabilitada no storefront                  [Abrir]    │
└─────────────────────────────────────────────────────────────────────┘
```

"Habilitada" segue `ENABLED_REGIONS`. Mudá-la continua sendo mudança de código nesta fase (D8): o CMS **prepara** Norte e Centro-Oeste, não as liga.

### 4.3 Tracking

```
┌ Tracking · Escopo: [Sul ▾] ─────────────────────────────────────────────────┐
│ Meta Pixel   (●) Próprio  ( ) Herdar do Global  ( ) Desativado               │
│              ID [ 1558923262073052 ]  ✔ formato válido                        │
│ GA4          (●) Próprio  ( ) Herdar  ( ) Desativado                         │
│              ID [ G-8GYTEJ1F77 ]      ✔ formato válido                        │
│ Efetivo agora (publicado): Meta 1558…052 · GA4 G-8G…F77                       │
│ ⓘ Nenhum evento é enviado antes do aceite no banner de consentimento.        │
│ ⓘ Trocar o ID não pede novo consentimento; adicionar outro fornecedor pede.  │
│                                            [Salvar rascunho]  [Ir p/ Publicar]│
└──────────────────────────────────────────────────────────────────────────────┘
```

### 4.4 Seções (lista)

```
┌ Seções · Sul ────────────────────────────────────────── [Preview 375│Desktop]┐
│ ⠿ 1  Hero                         hero            ● ativa  🔒 fixa           │
│ ⠿ 2  Sua cidade, de 8 jeitos      city-styles     ● ativa                    │
│ ⠿ 3  Da Nossa Terra               carousel        ● ativa   fonte: módulo    │
│ ⠿ 4  Escolha seu estado           states          ● ativa                    │
│ ⠿ 5  Redesenhos / Releituras      carousel·poster ● ativa                    │
│ ⠿ 6  Feito Para Você              carousel        ● ativa                    │
│ ⠿ 7  Fala daqui                   carousel·dark   ● ativa   🖼 imagem          │
│ ⠿ 8  O número de cada região      carousel        ● ativa                    │
│ ⠿ 9  Campanha editorial           campaign        ● ativa   🖼 imagem          │
│ — 10 Footer                       footer          🔒 fixo                    │
└──────────────────────────────────────────────────────────────────────────────┘
```

Reordenar por arrastar e por botões acessíveis (↑/↓). Hero e Footer não se movem. Ordem ou ativação alteradas mostram diff antes de publicar.

### 4.5 Editor de seção

```
┌ Da Nossa Terra ────────────────── ● ativa ─┬─ Preview ──────────────────────┐
│ CONTEÚDO                                   │ ┌ 375 ┐  ┌────── 1280 ─────────┐ │
│ Título       [Da Nossa Terra           ]   │ │     │  │                     │ │
│ Subtítulo    [O estado inteiro numa…   ]   │ │ real│  │   render real       │ │
│ CTA "Ver todos" → [Coleção INK ▾ da-nossa…] │ │     │  │                     │ │
│ FONTE                                      │ └─────┘  └─────────────────────┘ │
│ (●) Categoria INK [Sul ▾ · Da Nossa Terra ▾]│ Avisos:                         │
│ ( ) Curadoria manual  [buscar produto…]     │ ⚠ contraste estimado 3,8:1      │
│ ( ) Módulo editorial legado (só leitura)   │                                  │
│ Quantidade [ 6 ]  Ordem (●) categoria ( ) manual                             │
│ LAYOUT   (●) Padrão  ( ) Poster    Tom (●) Claro ( ) Escuro                   │
│ APARÊNCIA                                                                     │
│ Preenchimento (●) Sólido [#ffffff] ( ) Gradiente [de][para][ângulo]          │
│ Imagem Mobile  [🖼 escolher] alt[…] ☐decorativa  foco [● arrastar]            │
│ Imagem Desktop [🖼 escolher] alt[…] ☐decorativa  foco [● arrastar]            │
│ ☐ usar a imagem mobile também no desktop                                      │
│ Sobreposição (●) Preset [regional-wash-primary ▾] ( ) Custom [cor][ 0.45 ]   │
│ Texto cor [auto ▾]  Destaque [#d6ba8d]                                        │
│                          [Salvar rascunho]  [Descartar]  [Ir p/ Publicar]     │
└──────────────────────────────────────────────────────────────────────────────┘
```

O seletor de categoria só lista coleções realmente presentes no snapshot (D6). Se o snapshot não tiver coleções, a opção fica desabilitada com o motivo "sync ainda não consome categorias INK".

### 4.6 Mídia

```
┌ Mídia ─────────────────────────────────────────── [↑ Enviar imagem] ┐
│ [thumb] hero-mobile.png   1122×1402  legado    usada em: Sul/Hero    │
│ [thumb] fala-daqui-…      1254×1254  legado    usada em: Sul/Fala    │
│ [thumb] (novo upload)     2048×768   ready ✔   sem uso  [Excluir]    │
│ Regras: PNG/JPEG/WebP · ≤ 8 MB · ≤ 6000 px · sem SVG/GIF            │
└──────────────────────────────────────────────────────────────────────┘
```

Excluir só se nenhum rascunho nem release publicado usa o asset. Substituir = novo upload + trocar a referência na seção.

### 4.7 Preview / Publicação

```
┌ Publicar · Sul ──────────────────────────────────────────────────────────────┐
│ Mudanças vs release #12                                                       │
│  ~ Tracking: —        ~ Seção "Fala daqui": overlay 0.35→0.45                 │
│  + Mídia nova: fala-2.webp                                                    │
│ Validação: ✔ schema  ✔ mídia pronta  ✔ destinos  ⚠ 1 aviso (contraste)        │
│ [Abrir preview 375] [Abrir preview desktop]                                   │
│ Nota da publicação [ ………………… ]              [ Publicar agora ]            │
├─ Histórico ──────────────────────────────────────────────────────────────────┤
│ #12 publish  22/09 14:03  gabriel   "hero novo"        [Ver] [Restaurar]      │
│ #11 publish  21/09 09:40  …                                                    │
│ #1  seed     migração inicial                                                  │
└──────────────────────────────────────────────────────────────────────────────┘
```

"Restaurar" cria um novo release e pede confirmação explícita (ação com efeito na produção).

### 4.8 Catálogo (somente leitura na V1)

```
┌ Catálogo INK ────────────────────────────────────────────────────────────────┐
│ Loja        Produtos  Cidades  Merch  Excluídos  Último sync                 │
│ use-sul     9.834     …        244    59         21/09 01:36                  │
│ Job atual: nenhum          [Sincronizar agora] (owner)                        │
│ Categorias INK (snapshot): 0 — sync ainda não coleta   ← estado real, hoje    │
└───────────────────────────────────────────────────────────────────────────────┘
```

"Sincronizar agora" é uma Server Action que chama a função de sync **dentro do servidor** (sem expor `ADMIN_SYNC_TOKEN` ao navegador; só `owner`). O endpoint Bearer atual continua para automação.

---

## 5. Decisão: Postgres, autenticação e storage

### 5.1 Onde guardar rascunhos, versões, usuários e auditoria

Critérios: edição concorrente, rollback sem risco, durabilidade independente do app, custo operacional, não quebrar a vitrine.

| Critério | A. Postgres (Railway) + `published.json` | B. Só arquivos JSON no Volume | C. SQLite no Volume |
|---|---|---|---|
| Serviços novos | +1 | 0 | 0 |
| Transação / lock otimista | nativo | mutex em memória + arquivo, feito à mão | nativo |
| Histórico e auditoria consultáveis | sim | JSONL, sem consulta | sim |
| Durabilidade fora do app | **sim**, independente do Volume do catálogo | **não**: config e catálogo no mesmo Volume | **não**, mesmo problema |
| Restauro se o Volume for perdido | rehidrata do banco | **perde edições** | perde edições |
| Sessões, usuários, papéis | tabelas padrão das libs de auth | reimplementar | possível, adaptador menos comum |
| Vitrine depende dele em runtime | **não** (lê arquivo) | não | não |
| Risco para produção | baixo: banco só é tocado pelo admin | médio: bug de admin mexe no mesmo disco do catálogo | médio |
| Complexidade de implementação | média (padrão) | baixa no início, alta depois | média |

**Recomendação: A.** A necessidade que justifica o serviço novo é concreta: hoje o Volume é a única cópia de qualquer estado persistente e é **compartilhado com o catálogo**. O catálogo é regenerável a partir da INK. Uma edição do CMS **não é**. Colocar dado insubstituível no único disco do app, sem transação, nem backup independente, é o risco que o plano evita. **B é a alternativa válida** se a decisão for "zero serviço novo": funciona para 1–3 editores, mas sem restauro independente (D1).

### 5.2 Autenticação e autorização

- Modelo: allowlist de e-mails em `admin_user`, papéis `owner` (tudo, inclusive usuários e sync) e `editor` (escopos atribuídos; edita e publica só neles). Isolamento por região = checagem `scope ∈ user.scopes` **no servidor**, em todo write.
- Método recomendado: **OIDC (Google)** com allowlist. Sem senha própria para guardar. Sessão em banco, 8 h de inatividade, cookie `HttpOnly; Secure; SameSite=Lax`.
- Biblioteca: decidir na etapa S5, **depois de verificar compatibilidade com Next 16 e React 19.2** (Auth.js v5, Better Auth ou implementação mínima sobre a especificação OIDC). Não fixo agora porque não consigo confirmar versões sem instalar.
- Fluxo de segurança:
  - **Toda** Server Action e route handler chama `requireRole(scope)` na DAL (`admin/dal.ts`). O `proxy.ts` só faz redirect otimista, como o guia do Next recomenda.
  - Mutação só por `POST` (Server Actions). Verificação de origem já é padrão das Server Actions.
  - Rate limit no login e no upload. Limite de corpo por rota (`/admin/midia` ≤ 8 MB).
  - Erros do admin não vazam stack nem SQL.
  - `INK_TOKEN_*`, `ADMIN_SYNC_TOKEN`, `DATABASE_URL`, credenciais de storage: só env do servidor. Nenhum passa por props de client component (revisão de código e teste que procura esses nomes no bundle client).
- Alternativa se Google não for aceitável: e-mail + senha com hash `scrypt` do Node e TOTP. Mais código e mais superfície (D3).

### 5.3 Object storage / CDN

| Critério | R2 (Cloudflare) | Railway Bucket | Volume do storefront |
|---|---|---|---|
| Serviço novo | conta Cloudflare | recurso Railway | — |
| Entrega pública/CDN | sim, via domínio custom no Cloudflare | confirmar: entrega pública e CDN **não verificados** | via app, sem CDN |
| Egress | sem cobrança | por uso (verificar) | consome CPU do app |
| DNS | exige o domínio (ou subdomínio de mídia) no Cloudflare | independente | — |
| Regra do pedido | ok | ok | **proibido** ("não guardar banners no Volume do catálogo") |

**Recomendação: R2** com um subdomínio de mídia (ex.: `media.useorigens.com.br`), se o DNS puder passar pelo Cloudflare. Se o DNS de `useorigens.com.br` estiver em outro provedor, a alternativa é Railway Bucket **com** entrega via rota do próprio app + `next/image`, e isso tem de ser verificado antes (D2). **Não sei onde o DNS está hospedado.**

Pipeline de upload (server-side, `sharp` declarado como dependência):

1. Recebe multipart com limite (≤ 8 MB) por Server Action ou route handler autenticado.
2. Confere **magic bytes** (PNG/JPEG/WebP). Rejeita SVG, GIF, HEIC e qualquer outro tipo, mesmo com extensão certa. Ignora o nome do arquivo enviado.
3. Decodifica com `sharp` (falha de decodificação = rejeitado), limita ≤ 6000 px de lado, remove EXIF/ICC sensível, calcula `avg_luminance`.
4. Gera variantes WebP (ex.: 640/1080/1600/2400 px de largura) e guarda original privado.
5. Chave = `sha256`; dedupe automático.
6. `status='ready'` só depois de todas as variantes gravadas.
7. Avisos (não bloqueiam): dimensão abaixo do mínimo de `SLOT_FRAMES` (`hero` mobile 1440×1800 etc.), proporção fora do esperado, contraste baixo.

### 5.4 Custo operacional aproximado

**Estimativas de ordem de grandeza, não verificadas em tabela de preços hoje; confirmar no painel do Railway/Cloudflare antes de aprovar.**

| Item | Estimativa |
|---|---|
| Postgres Railway (uso baixo, < 1 GB, poucas conexões) | ~US$ 2–6/mês, cobrança por uso |
| R2 (poucos GB, egress grátis) | ~US$ 0 (faixa gratuita) até centavos |
| Auth (OIDC Google) | US$ 0 |
| Compute extra | ~0: mesmo serviço; upload/`sharp` são picos curtos |
| **Total incremental** | **~US$ 2–6/mês** |

### 5.5 Migração sem downtime

- Tudo é **aditivo**. Nenhuma etapa altera o comportamento da vitrine antes de S2 comprovar identidade visual.
- O Postgres é um serviço novo; provisioná-lo não toca o storefront. `DATABASE_URL` só é lida por `/admin`. **Sem `DATABASE_URL`, `/admin` responde 404** e a vitrine não muda. É também o "desligar" do CMS.
- O storefront **não** ganha nova exigência de env no boot nem no `/api/ready`.
- Cada deploy usa o fluxo Railway existente. O breve gap de redeploy de serviço com Volume já é conhecido (`docs/deploy/railway.md`) e **não é introduzido** por este trabalho.
- Ordem: código puro (S1–S4) → banco/auth (S5) → funcionalidades. Nada exige janela de manutenção.

---

## 6. Templates de seção e regra de fallback

Não é page builder: o editor escolhe **uma** das seções abaixo, dentre um catálogo fechado. Cada template define quais campos existem.

| Template | Cobre | Campos editáveis | Layout (opções fixas) | Fontes de dados | Fundo com imagem |
|---|---|---|---|---|---|
| `hero` | 1 | título, subtítulo, texto de apoio, trio de famílias (escolha entre `HERO_FAMILIES` reais) | único | famílias reais da INK | sim |
| `city-styles` | 2 | título, subtítulo, cidade vitrine (busca entre cidades cobertas) | único | bindings da cidade | não |
| `product-carousel` | 3, 5, 6, 7, 8 | título, intro, "Ver todos", quantidade (3–24), fonte | `standard` \| `poster`; tom `light` \| `dark`; superfície `paper` \| `plain` | `ink-category`, `manual`, `editorial-module` | sim (opcional) |
| `states` | 4 | título, intro, ordem dos estados | único | geo + linhas de estado | não |
| `campaign` | 9 | título, texto, CTA | único; fallback `crops` \| `fill` | crops reais de camiseta | sim |
| `footer` | 10 | — (fixo) | — | — | — |

Regras gerais:

- `hero` fica sempre primeiro, `footer` sempre por último.
- **Seção sem produtos válidos não renderiza** (comportamento de hoje). O admin mostra aviso e não bloqueia.
- `anchor` preserva os DOM ids atuais (`estilos`, `terra`, `estados`, …). Âncoras e links internos continuam funcionando.
- `sourceSection` de analytics continua vindo de `SOURCES` (enum central). **Não é editável**: qualquer valor livre poluiria eventos Meta/GA4.
- Cada carrossel mantém `viewAllHref`, agora resolvido de um `Destination` validado.

### 6.1 Regra de fallback imagem / cor / gradiente

`Appearance.fill` é **obrigatório** e é a base de toda seção. Imagem é sempre opcional e por breakpoint.

```
para cada breakpoint bp em {mobile (< 1024), desktop (≥ 1024)}:
  img = appearance.image[bp]
  se img existe e asset.status = 'ready'           → <picture> daquele bp, foco focal[bp], overlay aplicado
  senão se bp = desktop e reuseMobileOnDesktop     → usa a imagem mobile também no desktop (escolha explícita do editor)
  senão                                            → só o fill (sólido/gradiente), SEM overlay, sem <img>
```

- O fill também é a cor de pré-carregamento sob a foto (equivale ao `baseClassName` atual).
- **Nunca** uma imagem quebrada, `<img>` vazio, nem faixa/bandeira entre seções: a mídia é sempre camada absoluta **dentro** da própria `<section>` (`RegionalPhotoSection`). O contrato do template não tem um modo "faixa".
- Desktop não herda mobile automaticamente: recorte mobile em tela larga costuma ficar errado. Reuso exige marcar a opção.
- `campaign` sem imagem em nenhum breakpoint **mantém os recortes de camiseta** (comportamento atual). Com `fallback: "fill"`, mostra só o fill.
- `overlay.preset` mapeia para as classes existentes. `overlay.custom` é `rgba(cor, opacidade)` com teto de 0,85 e só é aplicado quando há imagem.
- Contraste: no upload, `avg_luminance`. No editor, estima contraste do texto contra `overlay + luminância` e **avisa** abaixo de 4,5:1 (corpo) / 3:1 (título grande). É estimativa, não garantia (não amostra a região sob o texto).
- **LCP**: só a primeira seção ativa com imagem recebe `priority`/`fetchPriority=high`. Não é configurável. Hoje isso acontece no hero.
- `sizes` e `quality` continuam definidos pelo componente, dentro de `images.qualities` (`70`, `80`).

---

## 7. Migração fiel da home Sul (visualmente idêntica)

**Estratégia: o seed é o código atual, não uma cópia digitada à mão.**

1. `lib/site-config/seed.ts` gera o `ScopeDoc` do Sul a partir das mesmas fontes do código de hoje: `REGION_BANNERS.sul`, textos extraídos de `page.tsx`/`Campaign.tsx`/`RegionHero.tsx`, `REAL_COLLECTIONS`, `SOURCES`, `SHOWCASE`, `HERO_FAMILIES`. Sem retranscrição manual, sem divergência silenciosa.
2. Cada seção do Sul usa `source.kind = "editorial-module"` (módulos atuais) e imagens `kind='legacy-public'` apontando para `/banners/sul/*.png` (arquivos **ficam** em `/public`; nada migra para o bucket no dia 1).
3. `overlay.preset` = a classe que a seção já usa hoje. Foco = valores atuais (`30% 35%` no hero). `tone`/`layout` = os atuais.
4. A home passa a ser renderizada por `HomeSections(config)`, e o **primeiro** `config` é o seed. **Sem banco, sem admin, sem arquivo**, a home tem de sair idêntica (é o gate da S2).
5. Só depois disso entram o leitor de `published.json` (S4) e o banco (S5). O primeiro release é `kind=seed`, com o bundle do seed.

**Gate visual (S2), critério de aceite duro:**

- Baseline: screenshots da `main` (`678c26a`) em **375, 390, 768, 1280 e 1920 px**, tela cheia, com animações desligadas (`prefers-reduced-motion` e classes `settle-*` estabilizadas) e carrosséis no estado inicial, estrutura de `scripts/screenshots.mts`/Playwright existente.
- Depois da refatoração: mesmas capturas e **diff de pixel = 0** por viewport (`maxDiffPixels: 0`). Qualquer diff bloqueia.
- Comparação estrutural adicional: HTML de `<main>` normalizado (sem hashes de build) idêntico entre `main` e a branch, cobrindo ordem, ids/âncoras, atributos `href`, `sizes`, `fetchpriority` e `loading`.
- Cabeçalhos de cache e `revalidate` inalterados.
- **Tracking intocado**: os testes de `tests/e2e/tracking-and-nav.spec.ts` continuam verdes sem edição. Verificação nova: com consentimento aceito, as requisições `fbevents.js` e `gtag/js` saem com os **mesmos IDs de produção**; sem consentimento, **nenhuma**.
- Cidade/estado/PDP, busca (`bag` → Bagé e Tibagi) e navegação por mesorregiões: nenhum arquivo dessas rotas é tocado; os testes existentes seguem verdes.
- Cards de estilo da cidade continuam apontando direto para a INK quando não há variante; PDP interna só quando há variantes. Nada disso está no escopo de configuração.

---

## 8. Plano de implementação em etapas pequenas

Cada etapa é um PR pequeno em `feature/storefront-admin`, **sem deploy até o gate da própria etapa passar**. A partir do primeiro PR mergeado em `main`, o deploy Railway acontece com a vitrine idêntica.

| # | Etapa | Entrega | Aceite | Rollback |
|---|---|---|---|---|
| S0 | Pré-requisitos | Respostas às decisões D1–D8; verificação read-only do escopo `store.categories.read` (D6) | decisões registradas | n/a |
| S1 | Contrato | `schema.ts`, `resolve.ts`, `seed.ts` + testes unitários (Given-When-Then). **Nenhuma rota muda** | `vitest` verde; `resolve` cobre inherit/override/disabled e fallback de imagem; seed valida no schema | reverter PR |
| S2 | Home por config | `HomeSections(config)` alimentado pelo seed; extrair `RegionShell` | **gate visual §7 com diff 0**; `typecheck`, `lint`, testes e2e existentes verdes | reverter PR (vitrine antiga intacta) |
| S3 | Tracking por props | `RegionLayout` → props para `MetaPixel`/`GoogleAnalytics`; fallback env; navegação entre regiões completa | testes novos: sem consentimento 0 requisições (3 modos); ID trocado por fixture aparece sem rebuild; sem double-init | reverter PR; env continua funcionando |
| S4 | Config publicada em arquivo | `published.ts` (mtime-cache, schema, última-válida), boot self-heal, `revalidatePath`; fixture de teste (padrão `ALLOW_FIXTURE_SYNC`) | arquivo inválido/ausente não derruba página; troca do arquivo + revalidate reflete na home; `infra.test.ts` (sem rede) verde | apagar `site-config/`; a vitrine volta ao seed |
| S5 | Fundação do admin | Postgres + migrações; auth + DAL + papéis; `admin/*` shell; `audit_log`; ajuste de `proxy.ts` (`/admin` fora do gate 503, `noindex`, `no-store`); 404 sem `DATABASE_URL` | login só de allowlist; editor de Norte não escreve em Sul (teste); sem `DATABASE_URL` → 404 e vitrine igual; segredos ausentes do bundle client | desprovisionar env; `/admin` desliga |
| S6 | Primeira fatia vertical: **Tracking + Publicar/Rollback** | tela de tracking, publicar atômico (§2.3), histórico e rollback, drift | publicar **Norte** (escopo desabilitado, seguro) muda `published.json` e `release_head`; rollback restaura; falha simulada no passo 3 não altera nada; **Sul inalterado** | restaurar release anterior; ou apagar arquivo |
| S7 | Editor de seções (texto/ordem/ativo/layout/CTA) | lista + editor sem mídia; validação de `Destination` | reordenar, ocultar e editar título no rascunho; preview 375/desktop reflete; publicar aplica; destino fora da allowlist é rejeitado | rollback de release |
| S8 | Mídia + aparência | upload, pipeline `sharp`, storage (D2), foco, overlay, fallback §6.1, avisos | upload malicioso (SVG, polyglot, > 8 MB, > 6000 px) rejeitado; troca de imagem publicada aparece; sem imagem cai no fill; hero mantém `priority` | rollback de release; asset antigo continua no CDN |
| S9 | Categorias INK | estender o sync para `GET /v1/stores/collections`; campo aditivo `collections` em `StoreIndex` (snapshot segue `version: 1`); fonte `ink-category`; tela Catálogo | snapshots antigos sem `collections` continuam válidos; seção vazia se oculta; `infra` sem rede em request | reverter PR; snapshot tolera campo ausente |
| S10 | Operação e endurecimento | Visão geral com dados reais, rate limit, runbook em `docs/admin/`, checklist de segurança | overview sem placeholders; runbook de restauro testado | n/a |

### 8.1 QA mobile/desktop

- Viewports: 375, 390, 768, 1024, 1280, 1920 (Playwright, Chromium + WebKit mobile).
- Vitrine: gate visual §7 em toda etapa que toca a home. **Sul ≈ 90% mobile**, então 375/390 são o principal.
- Painel: teste de fluxo (login → editar → preview → publicar → rollback) em 1280; em < 1024 conferir o modo somente leitura.
- Acessibilidade: foco visível, ordem de tab, botões ↑/↓ no lugar do arrastar, `alt` obrigatório, contraste dos controles.
- Performance: Lighthouse mobile da home antes e depois (LCP; as medições em ambiente estável continuam pendentes da Fase 1). **Não pior** que o baseline.
- Checklist de dispositivo real: `docs/qa/mobile-real-device-checklist.md`.

### 8.2 Critérios de aceite globais

1. Home Sul idêntica (pixel diff 0) enquanto o conteúdo for o seed.
2. Tracking do Sul idêntico: mesmos IDs, mesma condição de consentimento, mesmos eventos.
3. Vitrine serve sem banco e sem storage, e sem novas requisições de rede em runtime.
4. Publicar é atômico: falha em qualquer passo deixa a versão anterior servindo.
5. Editor de uma região não altera outra.
6. Nenhum segredo (INK, `DATABASE_URL`, sync token, storage) chega ao navegador.
7. `typecheck`, `lint`, `vitest`, Playwright verdes; busca `bag` → Bagé e Tibagi intacta.

### 8.3 Rollback geral

| Nível | Ação | Efeito |
|---|---|---|
| Conteúdo | "Restaurar" release anterior no admin | novo release, vitrine volta |
| Config publicada | apagar `site-config/published.json` | vitrine volta ao seed embutido |
| Admin | remover `DATABASE_URL` | `/admin` 404; vitrine igual |
| Código | `git revert` do PR, ou redeploy da versão anterior no Railway | estado anterior |
| Dados | Postgres e storage não são tocados pela vitrine, então removê-los não a afeta | — |

---

## 9. Fora da V1 (explícito)

- Banners de página de **estado, cidade e PDP** (`REGION_BANNERS.*.states/city`, `collections.ddd`): continuam em código.
- Habilitar Norte/Centro-Oeste no storefront (`ENABLED_REGIONS`) e home da raiz "Qual é a sua origem?".
- Pixel/GA4 aditivos (regional + global).
- "Mais vendidos" e "Novidades" públicos.
- Edição de tokens INK, preços ou produtos (INK é somente leitura).
- Merge campo a campo, comentários, fluxo de aprovação em duas etapas, agendamento de publicação, multi-idioma.
- HTML/markdown livre, page builder, CSS custom.
- Migrar os PNGs de `/public/banners/sul` para o bucket (opcional, depois).
- Mudanças na busca, no índice de cidades ou na arquitetura de cache do catálogo.

---

## 10. Riscos

| Risco | Mitigação |
|---|---|
| Admin e storefront no mesmo processo | fronteira de código + testes de vitrine sem `DATABASE_URL`; limites de corpo; sem estado global mutável |
| Diff visual por refatoração da home | gate de pixel 0 antes de qualquer outra coisa (S2) |
| Volume perdido reverte edições ao seed | autoreparo pelo `release_head` + aviso de drift |
| Categorias INK indisponíveis (escopo do token, API) | S9 é a última funcional; o resto da V1 funciona com `editorial-module` e `manual` |
| Slug de categoria ≠ URL da loja | só 4 URLs de coleção foram verificadas manualmente (`collections.ts`). Verificar a regra `…/<loja>/collections/<slug>` para todas antes de derivar destino |
| Auth incompatível com Next 16 | escolha adiada para S5, com teste de compatibilidade; fallback = implementação mínima OIDC |
| Custos de storage/banco fora da estimativa | estimativa marcada como não verificada; limites de upload e de variantes |
| Preview embutido em iframe | rota de preview precisa permitir `frame-ancestors 'self'`, só nela; o resto do site não muda |
| INK cobra `100 req/min` por loja compartilhado | S9 acrescenta poucas requisições por sync (coleções, `per_page=100`); mantém o ritmo de 1,5 s |

---

## 11. Decisões que exigem sua aprovação

| # | Decisão | Recomendação | Alternativa |
|---|---|---|---|
| **D1** | Onde persistir rascunhos/versões/usuários | **Postgres no Railway** (§5.1) | Só JSON no Volume (0 serviço novo, sem restauro independente) |
| **D2** | Storage de mídia | **Cloudflare R2** + subdomínio de mídia. **Preciso saber onde está o DNS de `useorigens.com.br`** | Railway Bucket (entrega e CDN a verificar) |
| **D3** | Autenticação e quem é admin | **Google OIDC + allowlist**; quais e-mails, quem é `owner`, quem edita qual região | E-mail/senha + TOTP |
| **D4** | Host do painel | `admin.useorigens.com.br` no mesmo serviço (cookie isolado do site público; exige 1 registro DNS e domínio extra no Railway) | `/admin` no domínio principal, `noindex` |
| **D5** | Semântica do tracking | **Um ID por documento**: `override` substitui o global; Global começa `disabled` | Aditivo (regional + global juntos), com mais risco de dupla contagem |
| **D6** | Categorias INK | Autorizar **uma leitura** `GET /v1/stores/collections?per_page=1` por loja para checar o escopo `store.categories.read`, ou regenerar tokens com o escopo | Adiar S9; V1 só com curadoria manual/módulos |
| **D7** | Modelo de publicação | Editor publica direto **nos seus escopos**, com auditoria | Editor propõe, `owner` aprova |
| **D8** | Escopo da V1 | Home do Sul + tracking + fundação de outras regiões (§9) | Incluir banners de estado/cidade já na V1 |

Nada aqui depende de você para começar **S1–S4**, que são código puro sem serviço novo. Elas já podem rodar em paralelo às respostas.

---

## 12. Fontes consultadas

- Código: `src/app/[region]/{page,layout}.tsx`, `src/proxy.ts`, `src/lib/{home,site,editorial/banners,editorial/collections,catalog/*,ink/*,config/*}`, componentes `home/*`, `banners/*`, `analytics/*`, `consent/*`; `tests/unit/infra.test.ts`, `tests/e2e/infra.spec.ts`.
- Docs do repositório: `docs/deploy/railway.md`, `docs/deploy/infra-audit-review.md`, `docs/decisions/0001–0004`.
- Docs do Next em `node_modules/next/dist/docs/01-app/02-guides/`: `how-revalidation-works`, `draft-mode`, `self-hosting`, `authentication`.
- Docs INK: `https://developers.reserva.ink/llms-full.txt` (escopos, `GET /v1/stores/collections`, `custom_showcase`, `total_sales_count`).
- Railway CLI (`status`, `volume list`, `variables`, só nomes de variáveis).
