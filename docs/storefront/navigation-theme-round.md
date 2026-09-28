# Navegação hierárquica + paleta por região

Branch `feature/navigation-theme` (a partir da `main` local `cdea08e`). Nada publicado em produção; nenhuma migration (o modelo é evolução do documento publicado, `jsonb`).

## Arquitetura
- `ScopeDoc` ganha `navigation?` (só regiões) e `theme?` (regiões e global). Publicados junto do escopo; a vitrine lê `published.json` (cache por mtime), sem Postgres por pageview.
- `src/lib/site-config/navigation-schema.ts` (tipos + validadores estritos), `navigation.ts` (resolvers: `navData`, `assembleNavigation`, `resolveTheme`, contraste), `chrome.ts` (server-only: junta config publicada + regiões lançadas + estados com produtos).
- Mesma fonte de dados no mobile e no desktop (dropdown de estados e seletor de região). `MobileMenuPanel` é o mesmo componente no drawer e na prévia do CMS.
- Estados e regiões nunca são cadastrados: estados = UFs da região com produtos (sem catálogo, todos); regiões = lançadas, exceto a atual.

## Schema
```ts
navigation: { primaryBlock?, statesBlock?, regionsBlock?: {label, visible, order}; primaryLinks?: {id, destination: "styles"|"speech"|"states", label, visible, order}[] }
theme: { mode: "inherit"|"override", colors: Partial<{brandPrimary, headerBackground, headerText, mobileMenuBackground, mobileMenuText, accent, pageBackground, pageText}> }
```
Global é sempre `override`. Campos desconhecidos, cores fora de `#rrggbb`, labels vazios/>40/com quebra de linha e destinos fora da lista são recusados.

## Fallback
- Sem `navigation`: hierarquia padrão com rótulos padrão. Sem `theme`: nenhuma variável CSS emitida (visual atual; testado nas 3 regiões). Global publicado não altera região sem config.
- Documento antigo continua válido; `navigation`/`theme` inválidos no arquivo publicado são descartados com diagnóstico, sem derrubar a região.
- CSS: `--nav-header-bg/text`, `--nav-menu-bg/text` com fallback (região / preto e branco); `brandPrimary`, `accent`, `pageBackground`, `pageText` sobrescrevem `--region-primary`, `--region-accent`, `--ground`, `--ink`. `.on-ink` passou a `#000` fixo para a faixa de anúncio não seguir o texto principal.

## CMS
`/admin/navegacao` e `/admin/aparencia` (região + paleta global, owner). Rascunho → Publicar (linhas de mudança novas) → Restaurar por região. Contraste: ao vivo; salvar avisa; publicar bloqueia < 3:1 (global: checa só regiões que herdam).

## Acessibilidade
`<dialog>` modal + focus trap explícito, foco inicial no painel, ESC, retorno do foco ao gatilho, scroll da página travado, fecha ao ampliar para desktop, links reais, grupos com `aria-labelledby`, safe areas, alvo de 44px. Blocos usam `div role=group` (um `<section>` quebrava seletores que assumem o hero como primeiro `section`).

## Testes
| Verificação | Resultado |
|---|---|
| `tsc`, `eslint --max-warnings=0`, `next build` | limpos |
| vitest (904, 38 novos) | passa com `CATALOG_SNAPSHOT_DIR` do checkout principal (sem snapshot, 14 testes de publicação existentes falham por ambiente) |
| E2E drawer (`tests/e2e/mobile-menu.spec.ts`, 320/375/390/440/1280/1440) | passa |
| E2E CMS (`tests/e2e-admin/navigation-theme.spec.ts`, 11) | 11/11 |
| `sul.spec`, `cart-mirror.spec` | falhas que também ocorrem no checkout principal: altura da página de estado (>2600) e `ageSeconds=30` (sensível a tempo) |

Cenário 6 (estado sem produtos não aparece) coberto em unitário (`coveredUfs`); o catálogo local tem todos os estados cobertos.

## Diferenças por região
Sul: PR, SC, RS; Norte: AC, AM, AP, PA, RO, RR, TO; Centro-Oeste: DF, GO, MS, MT (ordem editorial existente). Outras regiões: as demais lançadas.

## Riscos
- Região não lançada some do menu/seletor (antes apontava para a loja INK); rodapé inalterado.
- `pageBackground` diferente de `#e5e5e5` deixa caixa visível atrás das fotos de produto.
- Publicar o global publica também rascunho de tracking global pendente.
- Sem restauração do global pela UI.
- O teste de idade do carrinho é frágil por tempo (preexistente).

## Passos para release
Merge → deploy normal (sem migration) → nada muda até alguém configurar em Navegação/Aparência e publicar por região (hierarquia nova do menu é imediata, por ser código).

Capturas: `docs/screenshots/navigation-theme-round/`.
