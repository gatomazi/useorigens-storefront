# CMS V1: Rodada 5: coleções internas e autocompletar

- Branch `feature/storefront-admin`. **Só commits locais. Nenhum push, merge ou deploy.**
- Não foram tocados: Railway, proxy, consentimento, tracking, catálogo de produção, Postgres, R2, OIDC, DNS. Nada foi reativado ou alterado na INK.
- Guia de uso: [`cms-local-usage.md`](cms-local-usage.md).

## 1. Como abrir

```bash
npm run cms:dev
```

Painel: http://127.0.0.1:3000/admin · **Coleções**: http://127.0.0.1:3000/admin/colecoes · loja local: http://127.0.0.1:3000/sul

Requer o `collections-snapshot.json` novo (v2). O da máquina já foi ressincronizado (seção 3); em outra máquina: `npm run collections:sync`.

## 2. Passo a passo: habilitar uma coleção interna e usá-la

1. **Admin → Coleções**. Digite `fe de origem` (sem acento e sem se preocupar com maiúsculas): aparece **Fé de Origem** · `#148122` · *Interna (oculta na INK)* · 8 produtos avulsos · *Desabilitada*.
2. Clique em **Habilitar**. Aparece “habilitada para uso no CMS (a INK não foi alterada)”. Só essa coleção muda; as vizinhas (`SUL - RS`, etc.) continuam desabilitadas.
3. **Admin → Home · Seções**, campo **Coleção**: digite `fe de`, use ↓ e Enter (ou o mouse). Antes do passo 2 a mesma busca mostrava a coleção esmaecida, com “Interna · não habilitada” e um link para a Biblioteca.
4. Título opcional, nº de cards, **Criar seção**. O vínculo salvo é **loja + ID da coleção** (renomear na INK não quebra).
5. No editor, o “Ver todos” já vem desligado, com o motivo: coleção interna não tem página pública na loja (não inventamos URL).
6. **Salvar rascunho** → pré-visualização 375 px e desktop com os produtos reais → **Publicar no sandbox local** → `/sul` mostra a seção.
7. Enquanto a seção existe, **Desabilitar** fica bloqueado na Biblioteca, com “Usada em: <título>”. Para desfazer: remova ou troque a seção, e só então desabilite. **Restaurar versão** também restaura a lista de habilitadas (ela vive dentro do documento).

Regras que valem sempre: só produtos **ativos do snapshot da mesma loja** (avulsos e desenhos de cidade); com menos de 3 produtos, a coleção não é selecionável (mensagem explica); coleção que sumiu, esvaziou ou perdeu a habilitação **oculta a seção** em vez de gerar carrossel vazio; seções originais/curadas do Sul não foram alteradas.

## 3. Sincronização (uma execução, 4 GETs, somente leitura)

`npm run collections:sync`: Sul 2 páginas, Norte 1, Centro 1. Arquivo v2: **78 206 bytes (~76 KB)** (o v1 tinha 43 377 B; cresceu porque agora guarda até 48 IDs de produto por coleção, já filtrados para o catálogo local, e nunca a lista bruta da INK).

| Loja | Coleções | Públicas | Públicas com ≥ 3 elegíveis | Internas | Internas com ≥ 3 elegíveis |
|---|---:|---:|---:|---:|---:|
| Sul | 176 | 13 | 10 | 163 | 38 (36 só de desenhos de cidade, 2 de avulsos) |
| Norte | 22 | 20 | 19 | 2 | 2 |
| Centro-Oeste | 26 | 21 | 19 | 5 | 5 |

A maioria das internas do Sul (`SUL - RS`, `SUL - TERRIT. - SC`…) é de **desenhos de cidade**, não de avulsos; por isso o modelo passou a guardar e renderizar os dois tipos (cartão: família do desenho + “Cidade · UF”). Internas de avulsos no Sul: **Fé de Origem** (8) e **Dia dos Pais** (17). Habilitar coleções de Norte e Centro-Oeste ainda não está disponível (só o Sul tem home editável).

## 4. O que mudou

- **Modelo v2** (`collections-snapshot.json`): visibilidade na INK ≠ habilitação no CMS ≠ elegibilidade (≥ 3 produtos). Arquivo v1 é lido com segurança e marcado “precisa ressincronizar” (a Biblioteca avisa; interna nunca aparece como pronta). Escrita atômica, último bom preservado, idempotente.
- **Biblioteca** (`/admin/colecoes`): busca sem acento (nome, slug, ID), 5 filtros, contagens reais do catálogo, status público × interno, habilitar/desabilitar individual (sem “habilitar todas”), bloqueio quando em uso; no celular a tabela vira lista de cartões.
- **Autocompletar** (combobox ARIA, teclado e mouse) no criador e no editor, substituindo o `<select>` gigante; sugestões iniciais só utilizáveis; mesma loja apenas.
- **Renderização**: coleção interna habilitada alimenta seções criadas no CMS com os produtos da própria loja, sem “Ver todos”; pública mantém o botão. `docs.sul.collections.enabled` é validado e, se malformado, só a lista é descartada (home inteira preservada).
- **Correção encontrada no E2E**: mensagens de retorno das actions usavam `?` mesmo quando a URL já tinha `?q=…`; corrigido em `actions.ts` (`back`).

## 5. Testes (todos passaram)

| Verificação | Resultado |
|---|---|
| `tsc --noEmit` | limpo |
| ESLint | 0 erros (2 avisos antigos em `docs/admin/migrations/validate-pglite.mjs`, arquivo não tocado) |
| Vitest | **316 testes**, 20 arquivos (novos: v2/v1→v2, interna habilitada × não habilitada, desenhos de cidade, outra loja, produto fora do snapshot, host não permitido, CTA público × interno, habilitar/desabilitar no rascunho com bloqueio, sanitize de `collections`, busca sem acento) |
| Build limpo (`rm -rf .next`, com os dois IDs públicos) | ok |
| Smoke de produção | **passou** (inclui: interna não habilitada → sem seção; habilitada → produtos reais; sem “Ver todos”; v1 antigo não quebra a home; home flag OFF × ON idêntica) |
| E2E do admin (`npm run test:admin`) | **3/3**. Fluxo principal: Biblioteca → busca sem acento → habilitar → autocompletar → criar seção → salvar → prévia 375/desktop → bloqueio de desabilitar → publicar → `/sul` → editar → publicar → restaurar |
| E2E da loja (Playwright) | **93/93** |
| Paridade da seed | a home publicada com flag OFF × ON continua idêntica no smoke; o renderer público só mudou na resolução de coleções |

Capturas (sem rolagem horizontal em 375 e 1440): [`screenshots/round5/`](screenshots/round5/): `biblioteca-375.png`, `biblioteca-1440.png`, `autocomplete-375.png`, `autocomplete-1440.png`.

Não executado: `verify:bootstrap` (exige `.next` limpo e o build foi usado pelo smoke) e `verify:prerender`; nenhuma mudança relevante para eles nesta rodada.

## 6. Commits locais

Ver `git log` na branch (mensagens em Conventional Commits). Ficaram **fora** dos commits: capturas e Lighthouse antigos (`docs/design/lighthouse/`, `docs/screenshots/`), snapshots locais e `data/admin-dev`.

## 7. O que falta para produção

Já sabido e não feito por decisão desta fase: **Postgres** (rascunhos, ledger, histórico), **Google OIDC** (hoje é só modo dev em loopback), **R2** (mídia), **domínio do admin**, **publicar o `published.json` no Volume** (hoje o sandbox local faz esse papel).

Pendências objetivas ligadas a esta rodada:
1. `collections-snapshot.json` v2 precisa existir no Volume de produção (rodar a sincronização lá, ou promovê-la ao mesmo fluxo do catálogo); sem ele, seções em coleções ficam ocultas (comportamento seguro).
2. As coleções internas de desenhos de cidade têm milhares de produtos; a seção mostra os primeiros (≤ 24, na ordem da INK). Se quiserem outra ordem (mais vendidos, por cidade), é decisão de produto.
3. Habilitação de coleções de Norte/Centro-Oeste depende de existir home editável para essas regiões.
4. A sincronização de coleções é manual; definir cadência (e alerta de arquivo desatualizado) antes de produção.
