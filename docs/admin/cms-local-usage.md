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

## O menu do painel

O menu lateral é agrupado pelo que a pessoa está fazendo; **Publicar** fica na barra do topo, ao lado da região, com o número de itens esperando publicação.

| Grupo | Item | O que tem dentro |
|---|---|---|
| — | **Visão geral** (`/admin`) | O que pede atenção na região: solicitações abertas, itens esperando publicação, seções com problema, carrosséis de estado que não aparecem, links que ainda abrem a INK, dados desatualizados. |
| Conteúdo · região | **Home** (`/admin/home`) | Seções da home (ordem, editar, ocultar, adicionar). |
| | **Páginas de estado** (`/admin/estados`) | Por estado: a coleção com o nome do estado e os carrosséis que aparecem; a lista de carrosséis por coleção (com quantos produtos cada um teria em cada estado); O Pódio. |
| | **Páginas** (`/admin/paginas`) | Hotpages e categorias-pai. |
| | **Menu** (`/admin/navegacao`) | Coleções no menu (Topo, Categorias, Não exibidas; também a navbar da INK), seções da home na barra e os blocos do menu do celular. |
| | **Mídia** (`/admin/midia`) | Banners e imagens enviadas. |
| Catálogo | **Coleções** (`/admin/colecoes`) | A biblioteca: status, habilitar internas, página da coleção no site. |
| | **Personalização** (`/admin/personalizacao`) | Modelos personalizáveis. |
| Atendimento | **Solicitações** (`/admin/personalizacao/solicitacoes`) | A fila de personalização, com o contador. |
| Marketing | **Cupons e promoções**, **Faixa do topo**, **Tracking** | Botão de cupons; mensagens agendadas da faixa preta (loja e INK) e prazo de produção; Meta Pixel e GA4 por região e global. |
| Configuração | **Aparência** | Paleta da região e paleta global, botão nos cards, Meu Pequeno Mundo. |
| | **Sincronização** (`/admin/sincronizacao`) | Catálogo e coleções da INK (sincronizar, só owner) e o estado técnico da publicação. |
| | **Pessoas** (só owner, produção) | Quem entra e em que regiões. |

**Publicar** (`/admin/publicar`) lista tudo o que espera: o rascunho da região, cada página e cada modelo (publicados um a um) e a **configuração global** (paleta da Use Origens, botão nos cards, Meu Pequeno Mundo e tracking global, publicada inteira, só pelo owner). Aparência e Tracking só avisam que o global tem alterações e levam para lá.

## Roteiro de 5 minutos

1. **Visão geral** (`/admin`): o que pede atenção agora; o estado técnico (catálogo, coleções sincronizadas, sandbox) está em **Sincronização**.
2. **Home**: a ordem da home. Arraste uma seção pela alça (os seis pontos à esquerda; no teclado, Espaço na alça e as setas) para mudá-la de lugar: a ordem é salva no rascunho ao soltar. **Ocultar/Ativar**, **Duplicar** (a cópia começa oculta) e **Editar**. O hero fica sempre no topo e o rodapé no fim.
3. **Coleções** (`/admin/colecoes`): a Biblioteca com todas as coleções da INK, inclusive as **internas** (ocultas na INK). Busca sem acento por nome, slug ou número; filtros Todas / Públicas / Internas / Habilitadas no CMS / Sem produtos elegíveis. Para usar uma coleção interna, clique em **Habilitar** nela (individual e reversível; nada é enviado à INK). Enquanto uma seção a usa, ela não pode ser desabilitada.
4. **Nova seção a partir de uma coleção da INK**: no campo **Coleção**, digite parte do nome, o slug ou o número (↑/↓ e Enter, ou o mouse). As sugestões iniciais são só as coleções utilizáveis (públicas e internas habilitadas, com ≥ 3 produtos no catálogo local); se o que você digitou é uma interna ainda não habilitada, a lista diz isso e leva à Biblioteca. Dê um título e **Criar seção**. Ela entra no rascunho, antes da campanha. Coleção interna não tem “Ver todos” (a INK não expõe página pública para ela).
5. **Editor da seção**: título, subtítulo, botão “Ver todos” (coleção real da loja, URL da loja ou página interna), fonte (coleção ou a curadoria atual), quantidade de cards, layout, **cor do texto**, **fundo** (sem cor / cor sólida / degradê), **imagem mobile e desktop** opcionais (banners do projeto ou enviadas), **foco** por dispositivo, **sobreposição** e um aviso de legibilidade do texto. **Salvar rascunho** atualiza a pré-visualização (375 px e desktop, com os componentes reais e os cards reais do snapshot; não dispara tracking).
6. **Publicar** (barra do topo): veja as diferenças, **Publicar no sandbox local**. A loja local (`/sul`) passa a mostrar a nova versão. O histórico permite **Restaurar esta versão** (cria uma nova release) e **Descartar rascunho**.

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

**Coleções habilitadas** ficam no próprio documento (rascunho e `published.json`), então acompanham publicar, restaurar e descartar. O arquivo `collections-snapshot.json` (fora do repositório, em `data/generated/` ou no Volume) vem de `npm run collections:sync` (só leitura, ~4 GETs); se ele for da versão antiga, a Biblioteca pede uma nova sincronização.

## Segurança do modo local

O painel, suas ações e a pré-visualização só respondem quando **todas** as condições valem: processo de **desenvolvimento**, `ADMIN_DEV_MODE=true`, Host `localhost`/`127.0.0.1`/`[::1]` e nenhum cabeçalho de proxy apontando para fora. Qualquer outro caso (build de produção, Railway, host público, `?ADMIN_DEV_MODE=true` na URL, requisição encaminhada) é **404**, também para as server actions e para `/admin/media/*`. A verificação está no `proxy.ts`, no layout e em cada action/rota. O diretório do sandbox é recusado se estiver dentro do diretório do catálogo (o Volume).

## Testes

```bash
npm run test:admin     # roundtrip no navegador (servidor próprio na porta 3320, dados em pasta temporária)
npx vitest run         # unitários
```

## Limites desta versão

Só a região **Sul** é editável (Norte e Centro-Oeste aparecem como “em breve”). Coleções internas só podem ser habilitadas no Sul. Não há curadoria manual de produtos (só coleção INK ou a curadoria atual), nem arrastar-e-soltar (a ordem é por botões), nem edição de tracking. A troca de fonte de uma seção original para uma coleção **substitui a curadoria** dela e só vale depois de publicada.
