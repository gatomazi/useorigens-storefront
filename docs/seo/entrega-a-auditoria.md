# SEO — Entrega A: auditoria e baseline

Data: 2026-09-27. Fonte do plano: `Plano_SEO_Storefront_Use_Origens_Sem_INK.md`. Somente leitura: GETs ao site público (User-Agent Googlebot) e leitura do código. Nenhuma alteração de produção, nada da INK tocado.

## Resumo

| # | Achado | Gravidade |
|---|--------|-----------|
| 1 | **Toda resposta de página em produção sai com `X-Robots-Tag: noindex`, inclusive em `www.useorigens.com.br`.** O Google não indexa nada enquanto isso durar. | Bloqueante |
| 2 | Nenhum JSON-LD (`BreadcrumbList`, `WebSite`, `Organization`) em nenhuma página. Breadcrumbs existem só em HTML. | Alta |
| 3 | Título e descrição dos estados com gramática errada: "Camisetas de Paraná", "em Rio Grande do Sul". | Média |
| 4 | H1 da cidade é só o nome ("Bagé"); não há texto visível com cidade + estado + produtos. | Média |
| 5 | Sem `og:image` em home, estados e cidades (só nas páginas de família, com imagem da INK). Descrição de `/privacidade` é a genérica. | Baixa |
| 6 | `robots.txt` só tem comentários (content signals do Cloudflare), sem regras e sem linha `Sitemap:`. | Baixa |
| 7 | Sitemap em produção inclui Norte (4.041 URLs) e Centro-Oeste (4.187 URLs), porque as duas estão lançadas no CMS. O plano manda excluir enquanto não estiverem disponíveis. | Decidido: manter, se disponíveis ao comprador (ver `norte-centro-oeste-evidencias.md`) |
| 8 | Domínio raiz `useorigens.com.br` responde 200 (com `noindex`), sem redirecionar para `www`. | Baixa |

## 1. `noindex` global (bloqueante)

**Evidência (produção, 2026-09-27):** `/sul`, `/sul/rs`, `/sul/rs/bage`, famílias, `/norte` e o domínio raiz respondem `x-robots-tag: noindex`. `/sitemap.xml` não tem o header (o matcher do proxy o exclui).

**Causa provável:** `src/proxy.ts`, `isCanonicalHost()`, compara `request.nextUrl.hostname` com o host de `NEXT_PUBLIC_SITE_URL`. Atrás de Railway/Cloudflare, `nextUrl.hostname` traz o hostname de bind do servidor, não o `Host` da requisição. Reproduzi localmente: com `Host: www.useorigens.com.br` (com ou sem `X-Forwarded-Host`), o header `noindex` continua. O mesmo arquivo já usa o header `Host` para o roteamento do admin (`decideRoute`), e o admin funciona em produção, então o `Host` chega correto.

**Não verificado:** o valor real de `NEXT_PUBLIC_SITE_URL` no Railway (não tenho acesso e não imprimo valores). Se ele estiver diferente de `https://www.useorigens.com.br`, também causaria o mesmo sintoma. O canonical renderizado aponta para `www`, o que indica que o valor em build é `www` ou está ausente (fallback).

**Diff proposto (não aplicado):**

```diff
 function isCanonicalHost(request: NextRequest): boolean {
   try {
-    return request.nextUrl.hostname === new URL(siteUrl()).hostname;
+    // Compare the Host the client asked for. `nextUrl.hostname` carries the server's bind hostname behind Railway/Cloudflare, which made every
+    // response `noindex`, including the real production domain.
+    const host = (request.headers.get("host") ?? "").split(":")[0].toLowerCase();
+    return host === new URL(siteUrl()).hostname.toLowerCase();
   } catch {
     return false;
   }
 }
```

Efeito: `www.useorigens.com.br` deixa de enviar `noindex`; o endereço `*.up.railway.app` e o domínio raiz continuam com `noindex`. Precisa de teste unitário (host www, host raiz, host railway, host com porta) e de deploy autorizado. Depois do deploy: `curl -I https://www.useorigens.com.br/sul/rs/bage` sem `x-robots-tag`, e URL Inspection no Search Console.

Enquanto isso não for corrigido, as Entregas B, C e D não têm efeito orgânico.

## 2. Amostra de 12 URLs (HTML inicial, produção)

Todas: HTTP 200, `lang="pt-BR"`, canonical autorreferente em `www`, title/description/canonical/H1 já presentes no HTML inicial (renderização no servidor), 0 imagens sem `alt`.

| URL | Title | H1 | og:image |
|-----|-------|----|----------|
| `/sul` | Camisetas da sua cidade no Sul \| Use Origens | O seu lugar, do seu jeito. | não |
| `/sul/rs` | Camisetas de Rio Grande do Sul \| Use Origens | Rio Grande do Sul | não |
| `/sul/sc` | Camisetas de Santa Catarina \| Use Origens | Santa Catarina | não |
| `/sul/pr` | Camisetas de Paraná \| Use Origens | Paraná | não |
| `/sul/rs/bage` | Camisetas de Bagé, RS \| Use Origens | Bagé | não |
| `/sul/pr/curitiba` | Camisetas de Curitiba, PR \| Use Origens | Curitiba | não |
| `/sul/sc/florianopolis` | Camisetas de Florianópolis, SC \| Use Origens | Florianópolis | não |
| `/sul/rs/porto-alegre` | Camisetas de Porto Alegre, RS \| Use Origens | Porto Alegre | não |
| `/sul/sc/urubici` | Camisetas de Urubici, SC \| Use Origens | Urubici | não |
| `/sul/rs/torres` | Camisetas de Torres, RS \| Use Origens | Torres | não |
| `/sul/rs/bage/ponto-de-origem` | Ponto de Origem de Bagé \| Use Origens | Ponto de Origem (2×) | sim (INK) |
| `/sul/rs/santa-cruz-do-sul/gentilico` | Gentílico de Santa Cruz do Sul \| Use Origens | Gentílico (2×) | sim (INK) |

Observações:
- Os títulos das cidades já são únicos e incluem a UF (homônimos ficam distintos). As descrições são todas o mesmo modelo, trocando só o nome.
- As páginas de família têm dois `<h1>`; conferir se é duplicação responsiva do mesmo componente.
- Coleções (`/sul/colecoes/*`) e páginas do CMS (`/sul/h/*`): nenhuma foi encontrada no sitemap nem amostrada. Só entram se publicadas e marcadas como indexáveis; a amostra pede 2 coleções/produtos que existam, ainda em aberto.
- Comportamentos corretos: `/nao-existe` → 404; `/sul/rs/bage/` → 308 para sem barra; `?utm_source=…&fbclid=…` → canonical limpo; `/sul/busca` → `noindex, follow`.

## 3. Sitemap e robots

- `sitemap.xml`: 200, `application/xml`, 18.870 URLs, 2,4 MB (Sul 10.642, Norte 4.041, Centro-Oeste 4.187), sem duplicatas. 40 URLs sorteadas: 40 × 200. Dentro dos limites do Google (50.000 URLs / 50 MB). Publicado pelo PR #24.
- `lastmod` usa a data do último sync do catálogo para todas as URLs. O plano pede `lastmod` só quando o conteúdo mudou; hoje um sync sem mudança altera todas as datas. Opção: omitir `lastmod` ou usar uma data por URL derivada do conteúdo.
- `robots.txt`: 200, apenas comentários (content signals), sem `User-agent`, sem `Disallow`, sem `Sitemap:`. Sem regras significa "tudo permitido", então não bloqueia o Googlebot. Sugestão: `Sitemap: https://www.useorigens.com.br/sitemap.xml` e `Disallow: /admin`, `/api`, `/busca`, `/personalizar`.
- Cloudflare: o Googlebot recebeu 200 em todas as páginas, sem bloqueio visível.

## 4. Search Console, Core Web Vitals

- Search Console: sem acesso nesta sessão. Procedimento manual para o administrador: propriedade de tipo Domínio (`useorigens.com.br`, verificação por DNS no Cloudflare); Sitemaps → `sitemap.xml`; conferir Páginas → "Excluída por tag noindex" antes e depois da correção do item 1; URL Inspection em `/sul`, `/sul/rs`, `/sul/rs/bage`.
- Lighthouse mobile: já existe baseline de 2026-09-23 em `docs/design/lighthouse/2026-09-23/` (não versionado, fora deste relatório). Não medi de novo.

## 5. Rotas e fontes de dados (mapa para a Entrega B)

| Rota | Arquivo | Metadados hoje |
|------|---------|----------------|
| `/[region]` | `src/app/[region]/page.tsx` | title, description, canonical |
| `/[region]/[uf]` | `src/app/[region]/[uf]/page.tsx` | idem, texto genérico |
| `/[region]/[uf]/[city]` | `src/app/[region]/[uf]/[city]/page.tsx` | idem |
| `/[region]/[uf]/[city]/[family]` | `.../[family]/page.tsx` | idem + `og:image` |
| `/[region]/colecoes/[slug]`, `/h/[slug]` | CMS: `src/lib/pages/public.ts` (`pageMetadata`) | `indexable` controla `robots` |

Dados existentes: `src/lib/geo/cities.ts` (nome, UF, slug, mesorregião), `src/lib/geo/regions.ts` (`STATE_NAMES`), `src/lib/catalog/families.ts` (8 famílias). Gentílico e DDD não têm campo validado por cidade em `City`; hoje aparecem só como família de produto ("Gentílico") e no texto da home. O título de exemplo do plano ("Orgulho Bageense") depende de um dado que ainda não existe.

Já existem: `metadataBase`, `openGraph.siteName/locale` em `src/app/layout.tsx`; breadcrumbs HTML nas páginas de estado, cidade e família; canonicais relativos por rota.

## 6. Pontos para decidir antes da Entrega B

1. Aprovar a correção do `noindex` (item 1) e o deploy.
2. Norte e Centro-Oeste devem ficar no sitemap? Hoje estão lançadas. Se não, o filtro é por região no `sitemap.ts`.
3. Gramática dos estados: usar mapa "do Paraná / do Rio Grande do Sul / de Santa Catarina" (o plano já sugere "gaúchas" no título do RS).
4. Redirecionar o domínio raiz para `www` (Cloudflare, fora do código).

## 7. Decisões do dono após esta auditoria (2026-09-27)

1. Corrigir o `noindex` em branch/PR separado, sem merge nem deploy automáticos (`correcao-noindex.md`).
2. Norte e Centro-Oeste: manter no sitemap somente se disponíveis ao comprador; evidências em `norte-centro-oeste-evidencias.md`.
3. Gramática aprovada: do Paraná, do Rio Grande do Sul, de Santa Catarina, centralizada em um mapa reutilizável (Entrega B).
4. Redirect raiz → `www`: tarefa separada no Cloudflare. `robots.txt`: referenciar o sitemap sem `Disallow` em páginas que devem ser lidas com `noindex`.
