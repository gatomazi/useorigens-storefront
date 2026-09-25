# CMS V1: Rodada 8: Norte, Centro-Oeste e tracking global

- Branch `feature/storefront-admin`. **Só commits locais.** Nenhum push, merge, deploy, migração real, mudança de variável no Railway, publicação de IDs de tracking ou habilitação pública de Norte/Centro-Oeste foi feito. Nenhum ID de produção foi alterado.
- Commits desta rodada: `a4b2855` (modelo de tracking), `213345e` (regiões no CMS + tela Tracking), `c1cc9c6` (testes E2E, smoke, capturas). Antes deles, ainda locais: `1ee2733` (consentimento), `db5512f` (merge da `main`).
- Guia operacional: [`production-runbook.md`](production-runbook.md) (seção "Regiões e tracking").

## 1. Estado real do rollout anterior (Rodadas 6/7)

Verificado **somente leitura** em sessão anterior de hoje (Git, deploy e nomes/flags das variáveis no Railway); **não** foi reverificado nesta rodada e não dá para reverificar sem acesso ao Railway real.

| Item | Estado |
|---|---|
| Deploy em produção | `main` em `8526991` (PRs #3 e #4 mergeados por você). |
| Admin | Ao vivo em `https://www.useorigens.com.br/admin` (mesmo serviço, sem subdomínio). Login with Railway funcionou para o owner. |
| Banco | Migrations `0001` e `0002` aplicadas em 2026-09-25. |
| Bucket | Storage Bucket privado servido por `/media`. |
| **Upload de imagem em produção** | **Ainda falha**: o commit `b749965` (limite de 9 MB nos Server Actions) está só em `origin/feature/storefront-admin`, **não na `main`**. Precisa de PR/merge. |
| Consentimento | O commit `1ee2733` (medir sem esperar o banner) também não está na `main`. |
| Catálogo INK em produção | **Só o Sul** tem token e catálogo (`INK_TOKEN_SUL`). Norte e Centro-Oeste não têm token, catálogo nem coleções em produção. |
| `SITE_CONFIG_HOME` | Lido como `on` na verificação de hoje. Uma anotação antiga dizia `off`: confirme no Railway antes de agir. |

## 2. O que foi implementado

| Área | O que existe agora |
|---|---|
| Seletor de região | Barra no topo do painel (Sul, Norte, Centro-Oeste, com estado Pública/Prévia). A escolha vive num cookie `Path=/admin`; **todo formulário carrega a região para a qual foi renderizado** e a Server Action valida a permissão dela (duas abas em duas regiões não se misturam). Editor só vê e edita as regiões dele. |
| Home das regiões | "Criar home inicial": topo + seletor de estados (se houver páginas reais) + até 3 carrosséis de coleções **públicas da própria loja INK** com produtos suficientes. **Nada é copiado do Sul** (sem título, slogan, curadoria, número, campanha, avaliações). Tudo editável/removível. |
| Biblioteca | Filtrada pela loja INK da região; habilitar coleção interna vale só para aquela região; schema, `sourceProblem` e a action recusam coleção de outra loja. |
| Publicar/restaurar | **Por região.** Publicar Norte não toca Sul, Centro-Oeste, global nem catálogo. Restaurar recompõe só o documento da região sobre o estado atual (nova release, nunca apaga histórico). Descartar rascunho é por região. |
| Editável ≠ lançado | Campo `launched` no documento da região, publicado como qualquer release. Lançar/recolher é só do owner, é uma publicação da região (reversível, no histórico, auditada). O lançamento é **recusado** enquanto a região não estiver pronta (ver `launchBlockers`: cobertura de catálogo ≥ 50% das cidades, home criada, seções válidas, ao menos uma seção de produtos com ≥ 3 produtos reais). |
| Navegação pública | `launchedRegions()` decide em tempo de execução, a partir do `published.json`: Sul sempre; Norte/Centro só se `launched` **e** catálogo pronto **e** flag ligada. Páginas, `/api/cidades/*`, header, rodapé e menu mobile usam isso: região não lançada dá 404 e o link cai na loja INK legada, como antes. Nunca página vazia, "0 cidades" ou link morto. `proxy.ts` e `/api/ready` continuam olhando só o Sul. |
| Tela **Tracking** (`/admin/tracking`) | Cards Global, Sul, Norte, Centro-Oeste. Meta Pixel e GA4 independentes. Região: herdar / ID próprio / desligar (Sul tem ainda "Legado"). Global: ativo com ID ou inativo (guarda o ID). Validação: Meta só números; GA4 `G-XXXXXXXXXX`. Tabela de **ID efetivo e origem** por região/ferramenta: "No ar agora" e "Se publicar o rascunho". Aviso quando o global é herdado por regiões. Só o owner altera o global; editor altera a própria região. |
| Regra de tracking | `disabled` → nada; `override` → só o ID próprio; `inherit` → ID do global **somente se ativo**; `legacy` (só Sul) → `NEXT_PUBLIC_META_PIXEL_ID`/`NEXT_PUBLIC_GA_MEASUREMENT_ID` do build até uma escolha explícita ser publicada. Norte/Centro **nunca** herdam o legado do Sul. |
| Rascunho ≠ produção | Salvar tracking só grava rascunho. Publicar exige marcar a confirmação dos IDs efetivos **sempre que algum ID efetivo mudar** (publicação normal, lançamento e restauração). Publicar só o global não muda ninguém que ainda não tenha publicado a própria escolha. |
| Loja | O layout de cada região resolve no servidor os IDs a partir do `published.json` (sem banco por PageView) e registra os IDs ativos; **todo evento é endereçado** (Meta `trackSingle`/`trackSingleCustom`, GA4 `send_to`), então uma navegação Sul → Norte → Centro-Oeste → Sul não vaza evento para o ID da região anterior. Mesmo ID em duas regiões seguidas = um envio. Região sem ID = nenhum envio. `/admin` e a prévia não emitem pixel. |
| Visão geral | Tabela de regiões (Pública/Prévia) com o tracking efetivo publicado. |

Sem migração nova: tudo é campo novo em documento `jsonb` (`launched`, `tracking.*`); os `check` de escopo do banco já aceitavam `global`, `norte` e `centro-oeste`.

## 3. Testes

| Verificação | Resultado |
|---|---|
| `tsc --noEmit` | limpo |
| ESLint | 0 erros (2 avisos antigos) |
| Vitest (unitário + integração PGlite) | **529 testes, 34 arquivos** (novos: `regions-cms`, `regions-launch`, `tracking-routing`, `measurement-policy`, extensões de schema/resolução/preflight) |
| E2E admin dev (`npm run test:admin`) | roundtrip do Sul (3) + **Norte** e **Centro-Oeste** (criar home, Biblioteca da própria loja, habilitar interna, lançar, recolher, restaurar, Sul intacto) + **global em rascunho** (nada muda na loja até publicar; publicar global não move quem não publicou; confirmação obrigatória; aviso de herança; formato inválido) |
| E2E de tracking (`playwright.tracking.config.ts`, SDKs mockados, requisição real a Meta/Google = falha) | **2/2**: Sul legado; Norte próprio + GA4 herdado; Centro herda Meta e GA4 desligado; cada visita só fala com os IDs da região; nenhum `track` sem endereço; rascunho não muda a loja; publicação confirmada muda |
| Smoke público (`scripts/smoke-home-config.mts`, `next start`) | **passou**, incluindo: com fixture de 3 lojas, `/norte` e `/centro-oeste` = 200 com ≥ 3 produtos reais e links para a **própria** loja INK, "Ver todos" da própria loja, sem "0 cidades", Sul intacto e apontando para `/norte`; com **só o Sul** (produção hoje) o mesmo `published.json` com as duas regiões "lançadas" continua dando **404** |
| `verify:prerender` | passou |
| `verify:bootstrap` (build novo) | passou |
| Build | ok |
| Suíte E2E da loja (Playwright, dev server, modo estrito de consentimento; uma passagem completa) | **141 passaram, 2 falharam**: `sul.spec.ts:26` (busca por teclado com apelido) e `cart-mirror.spec.ts:334` (rótulo de idade). Ambos passam isolados ou variam entre execuções; a máquina estava com load médio de 90-130 (outros projetos). O `sul.spec.ts:26` já falhava antes das mudanças desta rodada nas execuções de base que fiz; **não é regressão comprovada, mas também não provei que é ambiental**: reexecute em máquina descarregada. |
| Regressão real achada e corrigida pelo E2E da loja | um `gtag`/`fbq` que lança exceção na inicialização derrubava a página (a chamada `config`/`init` nova não estava protegida). Agora é `try/catch`. Mocks dos E2E passaram a normalizar o formato endereçado (`trackSingle`/`send_to`), coberto pelos testes unitários e pelo E2E de tracking. |
| E2E do admin em modo produção (`test:admin:prod`: `next start` + Postgres/OIDC/S3 falsos) | **Parcial**: 6 de 8 passaram numa execução; o 7º (fluxo completo do owner) passou até o passo de restaurar (inclui upload, `/media`, publicação, tracking só depois do aceite) e falhou só nos textos antigos do botão/mensagem de restauração, que corrigi; o 8º não rodou. **Depois dessa correção não consegui reexecutar**: 3 tentativas estouraram o tempo de subida dos servidores auxiliares (Postgres/PGlite) com a máquina em load médio 90-130. Precisa de uma reexecução em máquina descarregada (`npm run test:admin:prod`). Exige build com `NEXT_PUBLIC_MEASUREMENT_REQUIRES_CONSENT=true` e os IDs públicos (documentado em `playwright.prod.config.ts`). Teste do "editor de outra região" reescrito: o editor do Norte agora edita o Norte e um formulário forjado para o Sul é recusado. |

Capturas 375 px e desktop (Norte, Centro-Oeste, Tracking, Publicar, Visão geral): [`screenshots/2026-09-25-round8/`](../screenshots/2026-09-25-round8/). São dados **locais** (catálogo e coleções sincronizados nesta máquina), não de produção.

## 4. Rotas regionais realmente prontas

Prontas **no código e localmente**: `/norte`, `/norte/[uf]`, `/norte/[uf]/[cidade]`, `/norte/[uf]/[cidade]/[família]`, `/norte/privacidade`, `/api/cidades/norte`, e o equivalente de `centro-oeste`. Localmente: Norte 450 cidades, Centro-Oeste 468.

**Em produção não estão prontas**: faltam token INK, catálogo e coleções de Norte e Centro-Oeste. Mesmo que alguém publique `launched: true`, o servidor mantém 404 até o catálogo cobrir ≥ 50% das cidades (coberto por teste e pelo smoke).

## 5. Tracking efetivo inicial por região (sem credenciais)

Sem nenhuma publicação nova, e depois de publicar a primeira release do CMS (o documento semente não escreve IDs):

| Região | Meta Pixel | GA4 |
|---|---|---|
| Sul | legado: valor de `NEXT_PUBLIC_META_PIXEL_ID` do build (os IDs atuais, inalterados) | legado: `NEXT_PUBLIC_GA_MEASUREMENT_ID` |
| Norte | nenhum (desligado) | nenhum (desligado) |
| Centro-Oeste | nenhum (desligado) | nenhum (desligado) |
| Global | inativo, sem ID | inativo, sem ID |

A migração futura para IDs globais é feita só pelo painel: owner ativa o global, cada região passa a "Herdar", publica com a confirmação.

## 6. Pendências de dados reais (não dá para resolver no código)

1. Token INK, catálogo e coleções de **Norte** e **Centro-Oeste** em produção (sincronizar, "Sincronizar coleções" por loja).
2. Curadoria: escolher, na Biblioteca, quais coleções entram na home de cada região; textos e banners próprios (o seed é enxuto de propósito).
3. Decidir os IDs de Meta/GA4 das duas regiões (próprios ou global) e autorizar a publicação deles.
4. Verificação visual sua da home de cada região antes do lançamento.

## 7. Conflito a decidir: consentimento

O texto da Rodada 8 diz "preservar o consentimento binário… zero scripts antes do aceite". Sua decisão de 2026-09-25 foi tirar a exigência para Meta/GA4 mantendo o banner (e "Rejeitar" continua medindo, como na INK). Mantive **as duas coisas**: padrão = sem esperar o banner; `NEXT_PUBLIC_MEASUREMENT_REQUIRES_CONSENT=true` (variável de **build**) liga o modo estrito, com zero script antes do aceite. A suíte E2E da loja roda no modo estrito. Nada muda até você decidir: diga qual modo vale para Norte e Centro-Oeste.

## 8. Não verificável sem o Railway real

Login real e `email_verified`; S3 real do bucket; o proxy do Railway; o estado atual das variáveis (última leitura foi antes desta rodada); tráfego real de Norte/Centro. O efeito real de `revalidatePath` num container com Volume só é provado em produção (o `verify:prerender` e o smoke cobrem o mecanismo localmente).

## 9. Roteiro objetivo para liberar as três regiões

Cada passo é reversível e só acontece com sua autorização explícita.

1. **Integrar**: abrir PR `feature/storefront-admin` → `main` (traz o upload de 9 MB, o consentimento e esta rodada) e mergear. Depois do deploy, o upload de imagem passa a funcionar. Sem migração de banco.
2. **Sul (já público)**: publicar a primeira release do CMS só se quiser fixar/editar; o Sul continua no legado até você escolher outra coisa na tela Tracking.
3. **Norte** (repetir para Centro-Oeste):
   1. Configurar `INK_TOKEN_NORTE` (e o de Centro) no Railway e rodar a sincronização de catálogo e coleções (sua ação).
   2. No painel: região **Norte** → Home → "Criar home inicial" → ajustar seções/Biblioteca/banners → conferir a prévia em 375 px e desktop.
   3. Tracking: escolher herdar o global, ID próprio ou desligar; publicar com a confirmação dos IDs efetivos.
   4. Publicar → **Lançar Norte ao público** (só o owner; o botão só habilita se o catálogo cobrir ≥ 50% das cidades).
   5. Reversão: **Recolher Norte** (volta à prévia, 404 público, link do menu volta à INK legada) ou **Restaurar** uma release anterior.
4. **Global** (quando quiser um Pixel/GA4 únicos): owner ativa o global na tela Tracking, cada região passa a "Herdar", publica cada uma com a confirmação. Reversão: voltar cada região para "ID próprio"/"Legado".
5. Decidir o modo de consentimento (seção 7) antes de lançar as regiões novas.
