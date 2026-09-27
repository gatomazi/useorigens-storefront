# Hotpages e personalização: fechamento final (mockups reais + prova em Postgres)

Rodada de fechamento sobre [`cms-hotpages-personalizacao-release-gate.md`](cms-hotpages-personalizacao-release-gate.md), na branch `feature/hotpages-customizacao`, a partir do commit `42ca1c8`. A implementação funcional já estava aprovada; esta rodada não reabriu escopo de produto, só fechou o que faltava.

> **Atualização (2026-09-27): Etapa A executada em produção**, com autorização explícita do owner. Ver §0. Este arquivo passa a ser a fonte da verdade sobre o estado real do rollout; §§1–10 abaixo são o relatório da rodada de fechamento local, anterior ao deploy.

## 0. Etapa A — executada em produção

Autorizado pelo owner ("pode fazer") após o preflight objetivo (SHA da branch, SHA de `origin/main`, SHA publicado no Railway, estado das migrations — todos conferidos, sem divergência, fast-forward limpo).

1. **Push** de `feature/hotpages-customizacao` para `origin` (conta `gatomazi`, confirmada; `gh` trocado de `gtomazi_meli` — corporativa, estava ativa por padrão — para `gatomazi` antes de qualquer chamada à API do GitHub).
2. **PR #19** aberto (`main` ← `feature/hotpages-customizacao`), `mergeable: MERGEABLE`, `mergeStateStatus: CLEAN`, sem CI configurado no repo (testes já rodados localmente, resultados no corpo do PR).
3. **Merge feito pelo owner** no GitHub (commit `da245cd`, "Merge pull request #19").
4. **Deploy automático do Railway**, serviço `useorigens-storefront`, ambiente `production`: `status: SUCCESS`, commit publicado `da245cd403c9c2a24a4ebdae5a5e33534dc3e31a` — confirmado via `railway status --json` (somente leitura).
5. **Smoke pós-deploy** (via `curl`, sem sessão de owner):

   | Verificação | Resultado |
   |---|---|
   | `/api/health`, `/api/ready` | 200 |
   | `/sul`, `/norte`, `/centro-oeste` | 200, **ids de seção idênticos** à linha de base capturada no preflight (nenhuma home mudou) |
   | `/admin/login` | 200 |
   | Busca (`/api/cidades/sul?q=florian`) | funcionando |
   | Link de produto INK real (`usesul.com.br`) | presente, correto |
   | `/sul/h/dia-dos-pais`, `/sul/colecoes/pais` (rotas novas, nada publicado) | **404** |
   | `db:status` em produção (via `railway ssh`) | `applied: 0001_init, 0002_auth_sync, 0003_release_delete` · **`pending: 0004_customization_requests, 0005_customization_contact_workflow`** — o código chegou, nada foi aplicado |

6. **Criação de página de teste pelo painel real**, feita pelo owner (login via Railway OAuth, sessão própria — fora do alcance desta sessão): hotpage "Dia das Crianças" (`/admin/paginas`), endereço `dia-das-criancas`, seção **Identidade e SEO** conferida e explicada (título/descrição para buscadores, imagem de compartilhamento, alt, e a caixa "Permitir que buscadores indexem esta página" — desmarcada por padrão, `noindex` até o owner ligar explicitamente). Rascunho salvo com sucesso; owner confirmou "tudo funcionando".

**Critério da Etapa A: atendido.** Código no ar, as três homes publicadas intactas, painel operacional, hotpages/categorias-pai utilizáveis em rascunho, nenhuma página nova pública sem ação explícita.

**Pendente da Etapa A** (não bloqueia o critério, mas ainda não foi feito): publicar de fato a página de teste (ou qualquer página) publicamente — fica a critério do owner, quando quiser, pelo próprio botão "Publicar" no painel.

## 1. Mockups reais no fluxo completo

Os dois arquivos chegaram desta vez dentro do ZIP `CLAUDE_HOTPAGES_FECHAMENTO_MOCKUPS_REAIS.zip` e foram extraídos para `referencias/` na raiz do repositório (commit `24cc96a`):

| Arquivo | Dimensões | Conteúdo conferido visualmente |
|---|---|---|
| `referencias/pai-paranaense-churrasqueiro-lenda.png` | 800×820 | Camiseta preta dobrada, "PAI / PARANAENSE / CHURRASQUEIRO / LENDA" em cores (laranja/amarelo/verde/branco) |
| `referencias/la-de-santiago.png` | 800×820 | Camiseta preta dobrada, "LÁ DE SANTIAGO" sobre o contorno do mapa do RS com um ponto marcado |

O E2E (`tests/e2e-admin/hotpages.spec.ts`) já lia esses nomes de arquivo automaticamente (função `read(REFERENCES.pai)`/`read(REFERENCES.santiago)`) desde a rodada anterior; bastou os arquivos existirem para o teste parar de cair no *fallback* preto e passar a usá-los de verdade — nenhuma mudança de lógica de produto foi necessária.

**Onde aparecem, confirmado pelo teste (upload real → CMS → renderer público), não por inspeção manual:**
- **Card 1 do carrossel** (`/sul/colecoes/pais`, seção "Pais com fé de origem"): `expectMockup()` confere que a imagem decodifica e mantém a proporção do arquivo (`ratioOf()` lê as dimensões reais com `sharp`).
- **Formulário de personalização** (mobile, `/sul/personalizar/pai-paranaense` e `/sul/personalizar/la-de-santiago`): mesma checagem de proporção; `object-fit: contain` já era o comportamento do componente (`className="... object-contain"` em `CustomizerForm.tsx`), sem corte nem distorção.
- **Prévia do admin**, mobile e desktop, nos dois iframes (`iframe[data-preview="mobile|desktop"]`).
- **Depois de salvar, publicar no sandbox e recarregar**: o teste navega de novo à página pública após a publicação e reconfirma a imagem.
- **Detalhe da solicitação no painel** (`request-mockup`): também usa o mockup real.

Capturas regeneradas com a arte real em `docs/screenshots/2026-09-26-hotpages/` (mesmos nomes de arquivo da rodada anterior, conteúdo atualizado): `personalizar-pai-375.png`, `personalizar-pai-desktop.png`, `personalizar-santiago-375.png`, `personalizar-santiago-desktop.png`, `formulario-contato-375.png`, `solicitacao-375.png`, `solicitacao-painel-desktop.png`, `fila-desktop.png`, `categoria-375.png`, `categoria-desktop.png`. Nenhuma imagem preta permanece nas capturas.

## 2. Solicitação completa em Postgres, modo produção

Novo teste em `tests/e2e-prod/prod-admin.spec.ts` (commit `a5c7e58`), rodando contra `next start` real + PGlite falando o protocolo de fio do Postgres (as migrations `0004` e `0005` são aplicadas em sequência pelo próprio bootstrap do banco de teste, `tests/e2e-prod/servers/db.mts`, via `loadMigrations`) + bucket S3 fake + IdP OIDC fake — nada fora desta máquina é contatado.

O teste, na íntegra:
1. **Habilita** a coleção interna "Fé de Origem" (idempotente: se um teste anterior já habilitou, apenas confirma o estado — não falha por causa disso).
2. Sobe o mockup real, cria o modelo "Pai Paranaense" com o grupo de 4→6 linhas, ativa e publica.
3. Confere o mockup renderizado na página pública com a proporção real do arquivo e `object-fit: contain`.
4. **Envia uma solicitação anônima real** com nome, WhatsApp e e-mail, sobre o Postgres real; confere que a referência, os canais mascarados na confirmação e a URL não vazam nome, telefone nem e-mail (checagem por substring codificada exata, não um regex frouxo que colidia com hash de bundle).
5. **Permissão regional**: o editor de Sul abre a solicitação e vê o contato completo. O editor de Norte, navegando direto para a mesma URL, recebe "Página não encontrada." (o `notFound()` do Next roda depois do `requireAdmin()` — a pessoa está autenticada, só não tem acesso àquela região — sem redirecionamento, sem formulário algum chegando a existir no DOM dela).
6. **Prova de que o servidor, não a página, decide**: como a página nunca renderiza um formulário para o editor de Norte, uma tentativa de forjar pela UI não é possível. Em vez de simular isso com um endpoint inventado, o teste **captura a requisição real** que o Next.js Server Action produz quando o editor de Sul registra uma observação legítima (URL, cabeçalhos, corpo exatos) e **repete essa mesma requisição, byte a byte, usando a sessão do editor de Norte**. O histórico da solicitação continua com a observação **uma única vez** e o estado não muda — a região é sempre re-derivada do registro gravado, nunca de um campo do cliente.
7. **wa.me e mailto só abrem por clique humano**: as rotas são interceptadas e contadas; abrir a página não dispara nada; o link do WhatsApp e o assunto/corpo do e-mail são conferidos.
8. **Todos os estados de produção**, na ordem: Recebida → Em criação → Arte pronta → Cliente contatado (recusado sem a confirmação humana, aceito com ela) → Encerrada. Confirma que não existe campo, rótulo nem botão de número de pedido em nenhum momento.
9. **Página privada da solicitação**: status em português, WhatsApp mascarado, sem o número completo, `noindex`, sem cache.

Resultado: **10/10** (os 7 testes já existentes + os 3 novos: o fluxo completo, um teste de ambiente sem armazenamento configurado e o teste final de mídia, que precisou de um pequeno ajuste porque agora há dois uploads reais no arquivo em vez de um — a contagem de objetos no bucket ficou relativa ao upload mais recente em vez de um número fixo).

## 3. Isolamento dos testes do admin

**Causa concreta** dos 12/19 da rodada anterior: os seis specs de `tests/e2e-admin/` compartilham **um** servidor `next dev` e **um** sandbox (arquivo de rascunho + `published/`), por design (`playwright.admin.config.ts` original). Dois specs assumem um estado impossível de reconstituir depois que outro o consome:

- `roundtrip.spec.ts` afirma que a coleção interna "Fé de Origem" começa **desabilitada** (prova que o autocompletar não a oferece antes de habilitar) — mas `hotpages.spec.ts` a habilita, e não existe ação de "desabilitar de novo" depois de usada numa seção publicada (o próprio botão fica desabilitado permanentemente).
- `scopes.spec.ts` afirma que Norte e Centro-Oeste **não têm home ainda** ("Esta região ainda não tem home") — mas `hero.spec.ts` e `structured.spec.ts` criam a home das duas regiões, e a única ação inversa é "Recolher" (volta a prévia, mas o documento da home continua existindo).
- `roundtrip.spec.ts` também afirma que sua própria publicação é a **release 1** do sandbox — e o próprio comentário de `scopes.spec.ts` já dizia "Runs AFTER roundtrip.spec.ts, which counts sandbox releases from 1", confirmando que essa ordem já era uma dependência conhecida, só nunca imposta pelo `playwright.admin.config.ts`.

**Correção real, não um afrouxamento de expectativa**: `playwright.admin.config.ts` (commit `0e4bbe6`) agora declara os seis specs como `projects` com `dependencies` do Playwright, fixando a ordem `roundtrip → scopes → hero → hotpages → navbar → structured`. `dependencies` faz o Playwright terminar um projeto por completo (e parar a cadeia no primeiro erro) antes de começar o próximo — não é paralelismo, é ordem explícita, documentada no próprio arquivo de config com a razão de cada passo. Continua **um único** servidor e **um único** sandbox: não precisei (nem tentei manter) seis servidores paralelos — essa alternativa foi tentada primeiro e descartada por gerar flakiness real de porta/processo sob a carga desta máquina (documentado abaixo, para não esconder o caminho que não funcionou). Como reforço, também tornei o passo de habilitar "Fé de Origem" em `hotpages.spec.ts` idempotente (mesmo padrão usado no teste de produção), então a ordem deixa de ser a *única* coisa impedindo uma falha.

**Reprodução do problema antigo** (para quem quiser conferir): reverter `playwright.admin.config.ts` para um `webServer`/`use.baseURL` únicos sem `projects`, e rodar `npx playwright test -c playwright.admin.config.ts` — a ordem alfabética original (`hero, hotpages, navbar, roundtrip, scopes, structured`) reproduz a falha de `roundtrip.spec.ts:41` ("Fé de Origem" já habilitada) e de `scopes.spec.ts:45` ("Esta região ainda não tem home" não aparece).

**Resultado, com a ordem fixada, sem afrouxar nenhuma asserção**: duas execuções completas e independentes da suíte inteira, `npx playwright test -c playwright.admin.config.ts` (com `CAPTURE=1` na primeira):
- 1ª execução: **19/19** (inclui o cenário F de capturas, que só roda com `CAPTURE=1`).
- 2ª execução (sem `CAPTURE=1`): **18/18** + 1 pulado corretamente (o cenário F, que se anuncia como `test.skip(!process.env.CAPTURE, ...)`).

Não declaro isto como "isolamento verdadeiro" (cada spec continua podendo, em teoria, ser afetado por um spec anterior na mesma cadeia) — é uma **ordem pinada e documentada**, a correção mais simples e de menor risco disponível sem duplicar toda a infraestrutura de servidor/sandbox por spec. Um spec novo que precise de estado pristino terá de entrar nessa mesma lista, na posição certa, ou ganhar sua própria tolerância (como fiz em `hotpages.spec.ts`).

### O que foi tentado e descartado (seis servidores/sandboxes)

Antes da correção acima, tentei dar a cada spec seu próprio `next dev` + sandbox (seis portas, seis diretórios), via um array `webServer` e `projects` com `use.baseURL` distintos. Tecnicamente funcionou uma vez, mas numa segunda tentativa um processo `next dev` de uma porta anterior não foi encerrado a tempo pelo Playwright antes do novo start (`Another next dev server is already running`), quebrando a execução inteira — sob a carga desta máquina (múltiplos `next dev`/`next start` concorrentes chegaram a load average 23–33), isso não é confiável o bastante para deixar como está. Descartei essa abordagem em favor da ordem pinada.

## 4. Mocks externos (Meta/GA4)

Sem mudança nesta rodada: os stubs locais introduzidos na rodada anterior (`tests/e2e-prod/prod-admin.spec.ts` intercepta `connect.facebook.net`, `googletagmanager.com`) continuam em uso; build de teste com `NEXT_PUBLIC_META_PIXEL_ID`/`NEXT_PUBLIC_GA_MEASUREMENT_ID` fictícios. Nenhum tráfego saiu desta máquina.

## 5. Resultados dos testes (reais, nesta máquina, após todas as correções)

| Verificação | Resultado |
|---|---|
| `tsc --noEmit` | limpo |
| ESLint (`src`, `tests`, `playwright.admin.config.ts`) | 0 erros, 0 avisos |
| Vitest completo | **52 arquivos, 751 testes, todos passam** (+2 desde o relatório anterior: um teste de Postgres real e inatingível rejeitando rápido em vez de travar, e um teste do `submitCustomizationAction` com uma store cujo `create()` rejeita, confirmando a mensagem genérica que nunca ecoa o motivo interno) |
| `npm run db:validate` (0001 a 0005) | ALL CHECKS PASSED |
| `next build` (com IDs de tracking fictícios) | passa |
| E2E do admin, suíte inteira, ordem fixada | **19/19** numa execução, **18/18 + 1 pulado por design** noutra |
| E2E de produção (`e2e-prod`) | **10/10** (7 anteriores + o fluxo completo de contato manual + o teste de ambiente sem store + o teste de mídia ajustado) |
| E2E público (`tests/e2e`, 3 regiões, busca, links INK, carrinho) | **144/144** (uma primeira tentativa caiu com `ERR_CONNECTION_REFUSED` sob load average 23–33 da máquina — sem nenhum processo meu vivo na hora; refeita já com a máquina mais livre, 144/144 limpo) |
| Smoke das regiões (`SMOKE_REGIONS_ONLY=1`) | PASSED |
| `verify-home-equivalence` /sul (build padrão × `SITE_CONFIG_HOME=on`) | **EQUIVALENT** (HTML, DOM, links e pixels idênticos em 375, 390, 768, 1280, 1920) |

## 6. Estado da branch e da working tree

Branch `feature/hotpages-customizacao`. Working tree limpa depois dos commits desta rodada, à exceção de arquivos preexistentes não relacionados (`_px.mts`, `docs/design/lighthouse/2026-09-23/`, `docs/screenshots/2026-09-23/`), que continuam intocados, como nas rodadas anteriores.

Commits desta rodada (locais, nenhum enviado):
1. `24cc96a` test(cms): use the real reference mockups, not placeholders
2. `0e4bbe6` test(cms): pin a safe order for the shared admin E2E sandbox
3. `a5c7e58` test(prod): the manual-contact flow end to end on real Postgres
4. `fc07ccb` test(customization): behaviour under a real, unreachable Postgres
5. docs(cms): final gate (este arquivo)

Nenhum arquivo de produto (`src/`) mudou nesta rodada — só testes, configuração de testes, os dois mockups reais e a documentação. A implementação funcional é exatamente a do commit `42ca1c8`.

## 7. Esquema de migrations

| Migration | Estado real nesta máquina |
|---|---|
| `0001_init`, `0002_auth_sync`, `0003_release_delete` | de rodadas muito anteriores; presumidamente já aplicadas em produção (fora do escopo desta rodada) |
| `0004_customization_requests` | escrita, commitada, **validada só em PGlite**. Confirme com `db:status` antes de decidir a ordem — nesta sessão nunca foi aplicada em banco real algum |
| `0005_customization_contact_workflow` | aditiva sobre a `0004`, mesma situação: só validada em PGlite (incluindo o caminho `0004 → 0005` sobre linhas com o fluxo antigo, e o `down`) |

`0004` e `0005` devem ser aplicadas **juntas, na mesma janela**, nesta ordem, quando autorizado. Sem elas, a tabela de solicitações não existe: o formulário público responde "O envio de solicitações não está disponível neste ambiente" (nunca finge sucesso) e a fila do admin mostra "as solicitações ainda não estão disponíveis neste ambiente" — confirmado no código (`try/catch` em ambos os lados) e por teste unitário/integração desta rodada. **Sim, é possível publicar hotpages e categorias-pai sem `0004`/`0005`**: elas vivem inteiramente no documento `jsonb` da região, sem depender de tabela nenhuma; só o envio de solicitações depende do banco.

## 8. Roteiro de publicação em duas etapas

### A — Hotpages e categorias-pai (sem dependência de `0004`/`0005`)
1. `git push` da branch e abrir PR (com autorização explícita) → revisão → merge em `main`.
2. Deploy normal do código (sem migration nova para esta parte).
3. Publicar cada página **uma de cada vez**, pelo painel (owner ou editor da região), conferindo a prévia 375/desktop antes de publicar. Nenhuma home é tocada por isso (publicar página nunca recompõe a home).
4. Rollback: arquivar a página (`archivePageAction`) ou restaurar uma versão anterior dela pelo histórico — nunca mexe nas outras páginas, na home nem noutra região.

### B — Formulário de personalização e operação manual (depende de `0004` + `0005`)
Checklist, na ordem, **nada disto executado agora**:
1. `fury db:status` (ou equivalente do projeto) no ambiente real — confirmar que nem `0004` nem `0005` foram aplicadas, e a versão atual do schema.
2. Backup do banco de produção antes de qualquer migration (procedimento padrão da equipe/Railway; esta migration é aditiva e não apaga nada, mas o backup é sempre anterior a uma migration real).
3. Aprovação explícita de quem autoriza migration em produção.
4. Aplicar `0004` e depois `0005`, na mesma janela (`npm run db:migrate` ou o comando real do projeto).
5. Conferir `db:status` de novo (nenhuma pendente).
6. Subir os mockups reais pelo fluxo de mídia (já provado nesta rodada) e publicar os dois modelos, um de cada vez, conferindo a prévia antes de cada publicação.
7. Smoke de **uma** solicitação real de teste (nome + contato real da equipe, não de um cliente) — conferir que aparece na fila, que o contato é visível só para quem edita aquela região, e então **cancelar/encerrar** essa solicitação de teste para não confundir a fila.
8. Definir, com a equipe, quem atende a fila (Recebida → Em criação → Arte pronta → Cliente contatado → Encerrada) e o texto de autorização de contato, se o jurídico quiser revisar.
9. Rollback operacional: desativar o modelo (`active: false`) e/ou remover o primeiro card do carrossel — a página de personalização sai do ar, mas **nenhuma solicitação já registrada é apagada**, e o painel continua acessível para atendê-las. Não existe rollback destrutivo de banco: reverter `0005`/`0004` (`db:migrate down`) só é uma opção se a tabela realmente precisar deixar de existir, e mesmo assim os dados de contato seriam perdidos — evitar, a menos que seja essa a decisão explícita.

## 9. Riscos remanescentes

- A ordem pinada da suíte do admin (§3) é uma correção real e testada duas vezes, mas não é isolamento genuíno: um spec novo mal escrito ainda pode poluir o sandbox compartilhado se não for tolerante a estado prévio (como os dois que corrigi) ou não entrar na lista `ORDER` na posição certa.
- Não há E2E de produção cobrindo `0004`/`0005` sendo aplicadas sobre um banco com dados **reais** de clientes anteriores — só sobre dados fabricados no próprio teste. A prova de que `0004 → 0005` preserva histórico real (não fabricado) só existe em ambiente real, no momento da migration.
- A carga da máquina local (load average acima de 20 em vários momentos desta sessão, por processos alheios a este trabalho) já causou uma falha de ambiente (§5) que precisou ser refeita; isso é uma característica desta máquina de desenvolvimento, não do código.
- O texto de autorização de contato (`CONTACT_NOTICE_VERSION = "2026-09-v1"`) e o aviso de uso de dados não passaram por revisão jurídica — permanece como estava na rodada anterior.

## 10. Comandos de release (para autorização futura — não executados)

```bash
# A — hotpages/categorias-pai
git push origin feature/hotpages-customizacao
gh pr create --base main --title "..." --body "..."
# após aprovação e merge: deploy normal (sem migration)

# B — personalização (só depois de A estar no ar e aprovado separadamente)
# 1. no ambiente real:
npm run db:status
# 2. backup do banco (procedimento da equipe)
# 3. aprovação explícita
# 4. aplicar as migrations, nesta ordem:
npm run db:migrate   # aplica 0004 e 0005 em sequência (todas as pendentes)
npm run db:status    # confirmar: nenhuma pendente
```

Nada disto foi executado nesta sessão.
