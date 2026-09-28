# SEO — Entrega B: núcleo (metadados, texto visível, JSON-LD)

Escopo: só o Storefront. Nada da INK, Worker, checkout, carrinho, sessão ou eventos. Nenhuma URL nova, nenhum caminho alterado. Branch `feature/seo-entrega-b`, sem push nem merge.

## O que mudou

| Área | Antes | Depois |
|------|-------|--------|
| Gramática dos estados | "Camisetas de Paraná", "em Rio Grande do Sul" | Mapa único `src/lib/seo/state-copy.ts`: do Paraná, do Rio Grande do Sul, de Santa Catarina (e as demais UFs); títulos "Camisetas Gaúchas / Catarinenses / Paranaenses e de Cidades do RS / de SC / do PR" |
| Home da região | "Camisetas da sua cidade no Sul" | "Camisetas do Sul e da Sua Cidade" e descrição do plano; regiões com mais de 4 estados usam o nome da região |
| Estado | descrição genérica, sem parágrafo | descrição com a contagem real de cidades; parágrafo curto visível antes da seleção por região, com link para a capital e para o início da região |
| Cidade | descrição igual para todas | descrição com os estilos reais da cidade ("8 estilos disponíveis, como Ponto de Origem, Feito em, Coordenadas e mais 5"); parágrafo de 35–80 palavras **abaixo** dos produtos |
| Família | título sem UF (homônimos idênticos), 2 `<h1>` no HTML | título com UF ("Ponto de Origem de Bagé, RS"); **um único `<h1>`** |
| Open Graph | página com `openGraph` próprio perdia `siteName` e `locale`; sem `og:image` em home, estado e cidade | `siteName`/`locale`/`type` preservados; `og:description`; `og:image` com uma foto real de produto da própria página (a mesma origem que a família já usava) |
| JSON-LD | nenhum | `BreadcrumbList` em estado, cidade e família (espelha o breadcrumb visível); `WebSite` e `Organization` nas homes regionais |

Arquivos: `src/lib/seo/{state-copy,copy,jsonld,open-graph}.ts`, `src/components/seo/JsonLd.tsx`, `src/components/catalog/VariantPicker.tsx` (H1 único), e as quatro rotas (`[region]`, `[uf]`, `[city]`, `[family]`).

## Decisões e limites (para revisar)

- **Sem gentílico de cidade.** O plano sugere "Orgulho Bageense", mas não há gentílico validado por cidade em `City`. Títulos de cidade ficam como estavam (já eram únicos e com UF). Demônimos de estado só para os três aprovados (paranaenses, gaúchas, catarinenses); os demais estados usam "Camisetas de Cidades do Pará", etc.
- **H1 da cidade continua "Bagé".** O subtítulo já visível mostra estado e mesorregião. Em vez de mexer no visual do topo, o texto com "Camisetas de Bagé, no Rio Grande do Sul…" fica em um parágrafo sob a grade de estilos, como o plano prevê (bloco editorial abaixo dos produtos).
- **Parágrafo de cidade lista só estilos que existem** no catálogo daquela cidade; nada de "8 estilos" fixo. Com 1 estilo o texto tem ~36 palavras (o plano diz 40–80 como referência).
- **Nada de texto novo na home da região.** O plano só permite copy complementar se não prejudicar a conversão no celular; a home ficou pixel-idêntica.
- **`og:image` é foto de produto** (INK CDN, sem dimensões declaradas), não uma arte de compartilhamento 1200×630. Melhor que nada e sem inventar imagem; uma arte própria seria decisão de design.
- **`Organization`** usa só nome, domínio, o logo da região (`/brand/logo-*.png`, 192×192) e o Instagram oficial da região. Sem telefone, endereço ou CNPJ (não verificados). `WebSite` sem `SearchAction`.
- **Sem `Product`/`Offer`/preço/estoque/avaliação**, como manda o plano; um teste garante que nunca aparecem.
- **`alt` das imagens** não mudou: a auditoria não achou nenhuma sem `alt`, e os textos atuais ("Camiseta Ponto de Origem de Bagé") já são descritivos. O exemplo do plano ("com estampa do mapa da cidade") só vale se a imagem mostrar isso, o que exige revisão editorial por família.
- **Não feito nesta entrega:** `lastmod` do sitemap (hoje é a data do último sync do catálogo para todas as URLs; o plano pede só quando o conteúdo muda), overrides editoriais de cidades e coleções prioritárias (Entrega C), metadados de coleções/hotpages do CMS (já passam por `pageMetadata`, sem mudança), redirect do domínio raiz (Cloudflare).

## Como foi verificado

- **HTML inicial** (dev, catálogo real): título, descrição, canonical, `og:*`, H1 e JSON-LD nas páginas de home, estados (RS, SC, PR), cidades (Bagé, Curitiba) e família. Canonical continua limpo com UTM, `fbclid` e `gclid`.
- **Regressão visual (Playwright, celular 390 px e desktop 1280 px, antes/depois, diff de pixels):** home e página de família **idênticas**; estado e cidade mudam só a partir do novo parágrafo. A diferença de 74×71 px vista na home no celular é o indicador de desenvolvimento do Next. A reordenação do título na família (um só `<h1>` com `display: contents` + `order` no celular) não alterou nenhum pixel.
- **Unitários (38 novos):** gramática de todas as UFs; unicidade de título e descrição entre **todos** os municípios e entre todas as combinações município × família; tamanho ≤ 160; nomes com acento, hífen e apóstrofo; sem "de Paraná"; escape de `</script>`, `&`, U+2028/2029 no JSON-LD; ausência de `Product`/`Offer`.
- **E2E (11 novos, `tests/e2e/seo.spec.ts`):** o que o rastreador lê sem JavaScript; um `<h1>`; breadcrumb estruturado igual ao visível; intro depois da grade de estilos; homônimos (Cruzeiro do Sul PR × RS) com título e canonical próprios; `/busca` continua `noindex` e sem dados estruturados. Rodou junto com o `infra.spec.ts` (17): 28/28.

## Pendências de validação após o deploy (dono)

1. Rich Results Test / Schema Markup Validator em `/sul`, `/sul/rs`, `/sul/rs/bage`, `/sul/rs/bage/ponto-de-origem` (`BreadcrumbList`, `WebSite`, `Organization`).
2. URL Inspection: conferir título, descrição e H1 renderizados; pedir reindexação das amostras.
3. Lighthouse mobile em `/sul/rs/bage` e `/sul/rs` contra o baseline de 2026-09-23: a mudança adiciona um parágrafo de texto abaixo dos produtos e um `<script>` JSON-LD pequeno; não deve afetar LCP/CLS, mas não medi.
4. Compartilhar uma URL de cidade no WhatsApp/Facebook Sharing Debugger para ver o `og:image`.

## Rollback

`git revert` do(s) commit(s) desta branch: não há migração, variável ou dado envolvido.
