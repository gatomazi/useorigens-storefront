# CMS V1: Rodada 4 (acompanhada): do protótipo ao primeiro CMS local utilizável

- Branch `feature/storefront-admin`; `main` e `origin/main` seguem em `678c26a`. **Commits locais apenas. Nenhum push, merge ou deploy foi feito.**
- **Não provisionado**: Postgres, R2, OIDC, DNS. Não foram alterados IDs Meta/GA4, consentimento, variáveis do Railway nem o Volume de produção.
- Guia de uso: [`cms-local-usage.md`](cms-local-usage.md).

## 1. Como abrir

```bash
npm run cms:dev
```

Painel: **http://127.0.0.1:3000/admin**. Loja local lendo o sandbox: **http://127.0.0.1:3000/sul**. O script liga `ADMIN_DEV_MODE=true`, `SITE_CONFIG_HOME=on` e `SITE_CONFIG_DIR=<repo>/data/admin-dev/published` **só para esse processo**, e amarra o servidor em `127.0.0.1`. Nenhum valor secreto. Pré-requisitos locais (já existem nesta máquina): `data/generated/catalog-snapshot.json` e `collections-snapshot.json`.

## 2. O que está clicável e persistente de verdade

Tudo abaixo foi exercitado por um teste de navegador real (`npm run test:admin`, 3 testes, servidor próprio, dados numa pasta temporária) e por capturas.

| Função | Estado |
|---|---|
| **Visão geral** com dados reais (rascunho × publicado, catálogo por loja, coleções sincronizadas com “utilizáveis/públicas/total”, consistência do sandbox, problemas) | funciona |
| **Criar seção a partir de coleção INK** (só públicas, com ≥ 3 produtos no catálogo local; contagem = elegíveis, não o total bruto) | funciona; entra no rascunho antes da campanha |
| **Editar seção** (título, subtítulo, botão “Ver todos” para coleção real/URL da loja/rota, fonte = coleção ou curadoria atual, nº de cards 3–24, variante, superfície, **cor do texto**) | funciona |
| **Fundo**: sem cor / **cor sólida** / **degradê**; **imagem mobile e desktop opcionais**; **foco** por dispositivo; **sobreposição** (véus da marca ou cor + intensidade ≤ 0,85); aviso de **legibilidade** ao vivo (bloqueia a publicação se o texto ficar ilegível) | funciona |
| **Reordenar** (↑/↓), **ocultar/ativar**, **duplicar** (cópia nasce oculta), **remover** (só as criadas no painel) | funciona; hero fixo no topo e rodapé no fim (regra também na camada de dados) |
| **Salvar rascunho**, persistente entre recarregamentos, com controle de edição concorrente (`rev`) | funciona (formulário velho não sobrescreve nada e avisa) |
| **Pré-visualização** a 375 px e desktop (e lado a lado), com os **mesmos componentes da loja**, seções novas, cards reais do snapshot, fundo escolhido | funciona; sem MetaPixel/GA/consentimento, links e formulários inertes |
| **Publicar no sandbox local**: diferenças em português, bloqueios (coleção sumida, texto ilegível, schema), nota, protocolo de duas fases + reconciliador | funciona |
| **Histórico e restaurar versão anterior** (nova release, nunca apaga histórico); **descartar rascunho** | funciona |
| **Mídia**: banners do projeto e **upload local** (PNG/JPEG/WebP reais, ≤ 8 MB, ≤ 6000 px, re-codificado, nome aleatório; SVG e arquivo falso recusados; servido só pelo painel dev) | funciona |
| Norte e Centro-Oeste | aparecem “em breve”; existem no contrato, sem home fictícia |

**Não feito** (dito claramente): curadoria manual restrita a uma coleção (a fonte `manual` continua indisponível), arrastar-e-soltar (a ordem é por botões), edição de tracking na UI, edição de aparência para as seções “Estados” e “Sua cidade” (só o texto), sync de coleções pela UI (é o comando `npm run collections:sync`).

### Roundtrip verificado (teste `roundtrip.spec.ts`)

criar seção de coleção → cor + banner + véu → salvar → mover → **recarregar (persistiu)** → pré-visualização mobile e desktop com ≥ 3 cards reais da INK e a foto como camada **dentro** da seção → **nenhuma requisição a Meta/Google** → publicar no sandbox → `/sul` (flag ON) mostra a seção e a curada continua intacta → editar e publicar de novo → **restaurar a release 1** → `/sul` volta ao texto anterior. Passou 3 de 3 nas três execuções finais (1,3, 2,1 e 1,5 min).

## 3. Segurança do modo local

O painel, as server actions, a pré-visualização e `/admin/media/*` só respondem com **todas** estas condições: processo de desenvolvimento, `ADMIN_DEV_MODE=true`, Host `localhost`/`127.0.0.1`/`[::1]` e nenhum cabeçalho de proxy que aponte para fora (o Next carimba `x-forwarded-*` em toda requisição, então o que conta é o **valor**: cliente/host público, `via` ou `forwarded` recusam). Em qualquer outro caso: **404**, antes de renderizar (`proxy.ts`), no layout e em cada action/rota. Testado: 6 unitários do guarda e, **numa build de produção**, 7 caminhos de admin + um POST de server action = 404 (smoke). O sandbox é recusado se estiver dentro do diretório do catálogo (Volume).

## 4. Coleções INK

`npm run collections:sync` foi executado **uma vez**: **4 GETs** (Sul 2 páginas, Norte 1, Centro-Oeste 1), somente leitura, sem erros. Resultado em `data/generated/collections-snapshot.json` (**43.377 bytes**, ignorado pelo Git, escrita atômica; os `product_ids` brutos não são guardados, só os que casam com o catálogo local).

| Loja | Coleções | Públicas | Públicas com ≥ 3 produtos no catálogo |
|---|---:|---:|---:|
| Sul | 176 | 13 | 9 |
| Norte | 22 | 20 | 11 |
| Centro-Oeste | 26 | 21 | 10 |

O catálogo local é de 2026-09-21 (3 dias). As quatro editoriais do Sul casaram como no inventário: Da Nossa Terra 73, Feito Para Você 21, Do Nosso Jeito 32, Fala Daqui 55; `Novidades` 53. O seed da home foi mantido intacto (curadoria por `editorial-module`). Coleção ausente ou oculta: o **editor mostra o motivo** e bloqueia a publicação, e a **vitrine omite a seção** (nunca um carrossel vazio; coberto por unitário e pelo smoke). A ordem dos cards é a da INK e não é rotulada como “mais vendidos” nem “mais recentes”.

## 5. Imagens (Etapa A): commit `150db18`, separável

- **Causa** (Rodada 3): `/_next/image` do Next 16.3.5 deixa pendurados os pedidos seguintes quando o primeiro de uma entrada fria é abortado.
- **Patch**: os banners locais passam a sair como **WebP estático pré-dimensionado** direto de `/public` (640/1080/largura total; `scripts/build-banner-variants.mts`), sem o otimizador; a logo do cabeçalho sai `unoptimized`. **Fotos de produto da INK continuam pelo otimizador.** Tamanho: **30,1 MiB de PNGs → 5,3 MiB** de variantes (p.ex. o banner de cidade desktop: 2,7 MiB → 42/109/272 KiB).
- **Antes/depois (servidor local isolado)**: as páginas de cidade e a home passam a ter **0** URLs de banner/logo em `/_next/image` (antes: 27 só na home). O repro contra a URL antiga do otimizador ainda trava (**3 de 16** entradas frias: o bug do Next continua existindo, mas nenhuma página o usa); contra uma foto remota da INK: **0 de 16**. O arquivo estático responde 200 imediatamente depois de requisições abortadas. Conferido visualmente em 390 e 1440 px (home e cidade).
- **Merece release urgente separada?** Sim, se o risco em produção for considerado real: é pequeno, autocontido e independente do CMS (cherry-pick do commit; toca `BannerBackground`, `SiteChrome`, `package.json` para `sharp` como devDependency e 39 WebP). Ressalva honesta: **o travamento nunca foi confirmado no Railway**; o patch também reduz o peso servido.

## 6. Playwright (Etapa B): commit `b103368`

Causa das corridas: cliques logo após o HTML chegar, antes de o React instalar os handlers. Correção: `<HydrationSignal/>` marca `data-hydrated` no `<html>` depois do primeiro commit e `tests/e2e/fixtures.ts` faz `page.goto/reload` esperarem esse sinal; os helpers de busca perderam o “fecha e reabre”. Sem `waitForTimeout`, `skip`, retry global ou timeout inflado; Meta/GA4 continuam interceptados. `verify:bootstrap` agora **recusa rodar**, com instruções, numa build que já serviu requisições (ou com a porta ocupada).

| Execução (imagens ligadas, workers padrão, cache de imagens vazio) | Resultado |
|---|---|
| Após a correção, 3 rodadas | **93/93, 93/93, 93/93** (1,3 / 1,1 / 0,8 min) |
| Final, no código completo, rodada 1 (*load average* 133 por outros projetos) | **91/93**: `sul.spec.ts:17` (clicar no resultado da busca não navegou em 5 s) e `:190` |
| Final, rodada 2 (*load* 66) | **93/93** |

Antes: ~50 % das rodadas davam 14–16 falhas em massa e toda rodada tinha 1–3 corridas. As 2 falhas restantes numa rodada com carga 133 são de **tempo** (a navegação para uma página de cidade ainda fria passou de 5 s com a máquina saturada por processos de outros projetos), não de hidratação: o sinal já estava `true` no registro da falha, e a rodada seguinte passa. Não há falha atribuível a produto; segue **bloqueio de release** se voltar com a máquina saudável.

## 7. Gates executados (todos sobre o código final)

| Gate | Resultado |
|---|---|
| Vitest | **291/291** (19 arquivos; +51 nesta rodada: leitor, ops, form, guarda, contraste, diff) |
| `tsc --noEmit`, ESLint | limpos |
| `next build` normal, sem `published.json` nem coleções | ok; único aviso é o de fonte (`Big Shoulders`), que já existia. Removi um aviso novo de tracing do projeto inteiro |
| `verify:prerender` (build sem Volume → início com Volume → sync invalida ISR) | ALL CHECKS PASSED |
| `verify:bootstrap` (build limpa) | ALL CHECKS PASSED |
| **Smoke** (`scripts/smoke-home-config.mts`, servidores de produção, catálogo fixture) | **PASSED, 66 verificações**: seed intacto; seção de coleção publicada aparece com cards reais e URL real de “Ver todos”; seção inválida cai fora sem derrubar a home; coleção inexistente omitida; arquivo corrompido/incompatível/vazio → seed; flag OFF ignora o arquivo; zero requisições a fornecedores antes do consentimento e IDs de fallback depois; **admin = 404** em build de produção |
| Paridade focal, flag desligada × ligada (390 e 1440 px, catálogo real) | **idêntica**: SSR, DOM, 138 links, sem overflow e **screenshots pixel-idênticos** |
| `npm run test:admin` | 3/3 (três execuções) |

A prova completa de cinco larguras da Rodada 3 não foi repetida (não mudei o renderer além do wrapper de carrossel, coberto pela paridade focal e pelo smoke).

## 8. Capturas (`docs/admin/screenshots/round4/`)

`overview-1440.png`, `home-1440.png`, `editor-visual-1440.png`, `editor-375.png`, `publicar-1440.png`, `preview-section-desktop.png`, `preview-section-mobile.png` (seção “Novidades da semana”, coleção real da INK, degradê verde→preto, texto claro). O painel foi verificado em 375 px sem overflow horizontal (corrigi um em `/admin/publicar`).

## 9. Git

Commits locais em `feature/storefront-admin` (a partir de `678c26a`):

1. `93ec822` feat(cms): foundations and collection sources (Rodadas 1–3)
2. `150db18` fix(images): avoid city banner optimizer lockup **(separável)**
3. `b103368` test(e2e): wait for hydration and isolate verify:bootstrap
4. `e79c3f7` feat(cms): published config reader with tolerant fallback
5. feat(cms): local admin, section editor and preview (o commit mais recente da branch)

**Excluídos de propósito**: `docs/screenshots/2026-09-23/`, `docs/design/lighthouse/2026-09-23/` (untracked, de outra época), `data/generated/*` (snapshots), `data/admin-dev/` (sandbox, ignorado), uploads, `.env*`, `test-results/`. **Nenhum push, merge ou deploy.** O `pre-commit` global reclamou da falta de `.pre-commit-config.yaml`; usei `PRE_COMMIT_ALLOW_NO_CONFIG=1` (a opção que o próprio hook sugere), sem `--no-verify`.

## 10. O que falta para produção (sem pedir credenciais agora)

1. **Postgres** (Railway): aplicar `docs/admin/migrations/0001_init.up.sql` e trocar `fileDraftRepository` / o registro JSON pelos repositórios SQL (as interfaces já existem).
2. **OIDC Google** com e-mails e papéis (owner/editor por região); tirar o guarda “só localhost” e ligar a autenticação do servidor em cada action.
3. **R2** para imagens (hoje: banners do projeto + upload local de desenvolvimento) e domínio `media.`.
4. **Host `admin.`** e DNS; integrar `src/lib/admin/routing.ts` ao `proxy.ts`.
5. **Rollout**: o publicador de produção escreve `published.json` no Volume (namespace `site-config/`) e chama `revalidatePath` (o protocolo já está testado); ligar `SITE_CONFIG_HOME` só depois de repetir paridade e smoke sobre o snapshot de produção.
6. Decidir a **release separada das imagens** (§5) e a **curadoria manual** por coleção.
7. Tracking por região vindo da configuração (hoje intocado: o Sul segue nas envs).
