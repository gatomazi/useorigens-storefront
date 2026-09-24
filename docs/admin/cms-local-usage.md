# CMS local: como abrir e usar

O painel é uma ferramenta de **desenvolvimento**: existe só no seu computador, não tem login (ainda não há OIDC) e **não altera a loja em produção**. Rascunhos e publicações ficam em `data/admin-dev/` (ignorado pelo Git).

## Abrir

```bash
npm install                 # se ainda não instalou
npm run catalog:sync        # só se data/generated/catalog-snapshot.json não existir
npm run collections:sync    # só leitura na INK, ~4 requisições; gera data/generated/collections-snapshot.json
npm run cms:dev
```

- Painel: **http://127.0.0.1:3000/admin**
- Loja local (lendo o que você publicar no sandbox): **http://127.0.0.1:3000/sul**

`npm run cms:dev` liga o servidor de desenvolvimento **somente em 127.0.0.1** e define, só para esse processo:

| Variável | Valor | Para quê |
|---|---|---|
| `ADMIN_DEV_MODE` | `true` | libera o painel (sem isso, `/admin` é 404) |
| `SITE_CONFIG_HOME` | `on` | a loja local renderiza a home pela configuração |
| `SITE_CONFIG_DIR` | `<repo>/data/admin-dev/published` | onde a loja lê o `published.json` do sandbox |

Opcional: `ADMIN_DEV_DATA_DIR` (caminho absoluto) muda onde o sandbox guarda os dados. Não há segredos. As primeiras aberturas de cada tela compilam por alguns segundos.

## Roteiro de 5 minutos

1. **Visão geral** (`/admin`): estado real: rascunho × publicado, catálogo, coleções sincronizadas, seções com problema.
2. **Home · Seções**: a ordem da home. Use ↑/↓ para mover, **Ocultar/Ativar**, **Duplicar** (a cópia começa oculta) e **Editar**. O hero fica sempre no topo e o rodapé no fim.
3. **Nova seção a partir de uma coleção da INK**: escolha a coleção (só aparecem as públicas com pelo menos 3 produtos que existem no catálogo local; o número mostrado é o de produtos elegíveis, não o total bruto da INK), dê um título e **Criar seção**. Ela entra no rascunho, antes da campanha.
4. **Editor da seção**: título, subtítulo, botão “Ver todos” (coleção real da loja, URL da loja ou página interna), fonte (coleção ou a curadoria atual), quantidade de cards, layout, **cor do texto**, **fundo** (sem cor / cor sólida / degradê), **imagem mobile e desktop** opcionais (banners do projeto ou enviadas), **foco** por dispositivo, **sobreposição** e um aviso de legibilidade do texto. **Salvar rascunho** atualiza a pré-visualização (375 px e desktop, com os componentes reais e os cards reais do snapshot; não dispara tracking).
5. **Publicar**: veja as diferenças, **Publicar no sandbox local**. A loja local (`/sul`) passa a mostrar a nova versão. O histórico permite **Restaurar esta versão** (cria uma nova release) e **Descartar rascunho**.

**Mídia**: banners do projeto e envio de imagens (PNG, JPEG ou WebP até 8 MB, 6000 px), somente neste computador; não é versionado nem é o armazenamento de produção.

## O que fica onde (`data/admin-dev/`)

| Caminho | Conteúdo |
|---|---|
| `drafts/sul.json` | rascunho atual (com `rev` para detectar edição concorrente) |
| `published/published.json` | o que a loja local lê (escrita atômica) |
| `published/releases/<n>.json` | cada release publicada (base do “restaurar”) |
| `ledger.json` | registro das publicações (faz o papel do Postgres) |
| `uploads/` | imagens enviadas |

Para recomeçar do zero: pare o servidor e `rm -rf data/admin-dev`. Sem `published.json` a loja usa a home original (seed).

## Segurança do modo local

O painel, suas ações e a pré-visualização só respondem quando **todas** as condições valem: processo de **desenvolvimento**, `ADMIN_DEV_MODE=true`, Host `localhost`/`127.0.0.1`/`[::1]` e nenhum cabeçalho de proxy apontando para fora. Qualquer outro caso (build de produção, Railway, host público, `?ADMIN_DEV_MODE=true` na URL, requisição encaminhada) é **404**, também para as server actions e para `/admin/media/*`. A verificação está no `proxy.ts`, no layout e em cada action/rota. O diretório do sandbox é recusado se estiver dentro do diretório do catálogo (o Volume).

## Testes

```bash
npm run test:admin     # roundtrip no navegador (servidor próprio na porta 3320, dados em pasta temporária)
npx vitest run         # unitários
```

## Limites desta versão

Só a região **Sul** é editável (Norte e Centro-Oeste aparecem como “em breve”). Não há curadoria manual de produtos (só coleção INK ou a curadoria atual), nem arrastar-e-soltar (a ordem é por botões), nem edição de tracking. A troca de fonte de uma seção original para uma coleção **substitui a curadoria** dela e só vale depois de publicada.
